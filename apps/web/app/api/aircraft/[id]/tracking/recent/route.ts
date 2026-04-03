import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createTrackingAdapter } from '@/lib/tracking/factory';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (process.env.ENABLE_AIRCRAFT_LIVE_TRACKING !== 'true') {
    return NextResponse.json({ flights: [] });
  }
  try {
    const supabase = createServerSupabase();
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20');

    const { data: aircraft } = await supabase
      .from('aircraft')
      .select('id, registration')
      .eq('id', params.id)
      .single();
    if (!aircraft) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Return cached flights if recent
    const { data: cached } = await supabase
      .from('aircraft_recent_flights')
      .select('*')
      .eq('aircraft_id', params.id)
      .order('departed_at', { ascending: false })
      .limit(limit);

    const cacheAge = cached?.[0]
      ? Date.now() - new Date(cached[0].synced_at).getTime()
      : Infinity;

    if (cached && cached.length > 0 && cacheAge < 10 * 60 * 1000) {
      return NextResponse.json({ flights: cached, cached: true });
    }

    const { data: config } = await supabase
      .from('aircraft_tracking_provider_config')
      .select('provider')
      .eq('aircraft_id', params.id)
      .single();

    // Use mock for N636SA or when no provider configured
    const provider = config?.provider ||
      (aircraft.registration === 'N636SA' ? 'mock' : 'mock');

    const adapter = createTrackingAdapter(provider as 'flightaware' | 'adsbexchange' | 'mock');
    const flights = await adapter.getRecentFlights(aircraft.registration, limit);

    // Upsert flights
    for (const flight of flights) {
      flight.aircraftId = params.id;
      await supabase.from('aircraft_recent_flights').upsert({
        aircraft_id: params.id,
        registration: aircraft.registration,
        provider: flight.provider,
        provider_flight_id: flight.providerFlightId,
        callsign: flight.callsign,
        origin: flight.origin,
        destination: flight.destination,
        departed_at: flight.departedAt,
        arrived_at: flight.arrivedAt,
        duration_minutes: flight.durationMinutes,
        max_altitude_ft: flight.maxAltitudeFt,
        avg_groundspeed_kts: flight.avgGroundspeedKts,
        status: flight.status,
        provider_link: flight.providerLink,
        raw: flight.raw,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'aircraft_id,provider_flight_id' });
    }

    return NextResponse.json({ flights, cached: false });
  } catch (err) {
    console.error('Tracking recent error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
