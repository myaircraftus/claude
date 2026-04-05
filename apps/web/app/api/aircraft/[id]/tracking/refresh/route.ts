import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createTrackingAdapter } from '@/lib/tracking/factory';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  if (process.env.ENABLE_AIRCRAFT_LIVE_TRACKING !== 'true') {
    return NextResponse.json({ error: 'Not enabled' }, { status: 404 });
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
      .select('provider')
      .eq('aircraft_id', params.id)
      .single();

    const provider = config?.provider || 'mock';
    const adapter = createTrackingAdapter(provider as 'flightaware' | 'adsbexchange' | 'mock');
    await adapter.refreshAircraftTracking(aircraft.registration);

    // Clear cached state to force re-fetch
    await supabase
      .from('aircraft_live_state')
      .update({ synced_at: new Date(0).toISOString() })
      .eq('aircraft_id', params.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Tracking refresh error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
