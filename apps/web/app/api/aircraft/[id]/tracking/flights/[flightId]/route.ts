import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createTrackingAdapter } from '@/lib/tracking/factory';

export async function GET(_req: NextRequest, { params }: { params: { id: string; flightId: string } }) {
  try {
    const supabase = createServerSupabase();

    const { data: cached } = await supabase
      .from('aircraft_recent_flights')
      .select('*')
      .eq('provider_flight_id', params.flightId)
      .single();

    if (cached) return NextResponse.json({ flight: cached });

    const adapter = createTrackingAdapter('mock');
    const flight = await adapter.getFlightDetails(params.flightId);
    return NextResponse.json({ flight });
  } catch (err) {
    console.error('Flight detail error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
