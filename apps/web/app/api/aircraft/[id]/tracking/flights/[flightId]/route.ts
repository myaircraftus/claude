import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createTrackingAdapter } from '@/lib/tracking/factory';

export async function GET(_req: NextRequest, { params }: { params: { id: string; flightId: string } }) {
  try {
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // Org check via the RLS-respecting client — a non-member sees no aircraft.
    const { data: aircraft } = await supabase
      .from('aircraft')
      .select('id')
      .eq('id', params.id)
      .single();
    if (!aircraft) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: cached } = await supabase
      .from('aircraft_recent_flights')
      .select('*')
      .eq('provider_flight_id', params.flightId)
      .eq('aircraft_id', params.id)
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
