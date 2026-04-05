import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createTrackingAdapter } from '@/lib/tracking/factory';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (process.env.ENABLE_AIRCRAFT_LIVE_TRACKING !== 'true') {
    return NextResponse.json({ error: 'Live tracking not enabled' }, { status: 404 });
  }
  try {
    const supabase = createServerSupabase();
    const { data: aircraft } = await supabase
      .from('aircraft')
      .select('id, registration')
      .eq('id', params.id)
      .single();
    if (!aircraft) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: config } = await supabase
      .from('aircraft_tracking_provider_config')
      .select('*')
      .eq('aircraft_id', params.id)
      .single();

    const provider = config?.provider || 'mock';

    // Check cached state first (< 2 min old)
    const { data: cached } = await supabase
      .from('aircraft_live_state')
      .select('*')
      .eq('aircraft_id', params.id)
      .single();

    if (cached && new Date(cached.synced_at).getTime() > Date.now() - 2 * 60 * 1000) {
      return NextResponse.json({ state: cached, cached: true });
    }

    const adapter = createTrackingAdapter(provider as 'flightaware' | 'adsbexchange' | 'mock');
    const state = await adapter.getAircraftLiveState(aircraft.registration);
    state.aircraftId = params.id;

    // Upsert live state
    await supabase.from('aircraft_live_state').upsert({
      aircraft_id: params.id,
      registration: aircraft.registration,
      provider: state.provider,
      is_live: state.isLive,
      status: state.status,
      callsign: state.callsign,
      latitude: state.latitude,
      longitude: state.longitude,
      altitude_ft: state.altitudeFt,
      groundspeed_kts: state.groundspeedKts,
      heading_deg: state.headingDeg,
      last_seen_at: state.lastSeenAt,
      departed_airport: state.departedAirport,
      arrival_airport: state.arrivalAirport,
      provider_link: state.providerLink,
      embed_url: state.embedUrl,
      raw: state.raw,
      synced_at: new Date().toISOString(),
    }, { onConflict: 'aircraft_id' });

    return NextResponse.json({ state, cached: false });
  } catch (err) {
    console.error('Tracking live error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
