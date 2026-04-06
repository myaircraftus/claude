import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from('aircraft_tracking_provider_config')
    .select('*')
    .eq('aircraft_id', params.id)
    .single();
  return NextResponse.json({ config: data });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase();
  const body = await req.json();

  const { data: existing } = await supabase
    .from('aircraft_tracking_provider_config')
    .select('id, org_id')
    .eq('aircraft_id', params.id)
    .single();

  if (existing) {
    const { data } = await supabase
      .from('aircraft_tracking_provider_config')
      .update({
        provider: body.provider,
        embed_enabled: body.embedEnabled,
        structured_sync_enabled: body.structuredSyncEnabled,
        use_as_ops_signal: body.useAsOpsSignal,
        sync_cadence_seconds: body.syncCadenceSeconds,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single();
    return NextResponse.json({ config: data });
  } else {
    // Get organization_id from aircraft
    const { data: aircraft } = await supabase
      .from('aircraft')
      .select('organization_id')
      .eq('id', params.id)
      .single();

    const { data } = await supabase
      .from('aircraft_tracking_provider_config')
      .insert({
        aircraft_id: params.id,
        organization_id: aircraft?.organization_id,
        provider: body.provider || 'none',
        embed_enabled: body.embedEnabled ?? false,
        structured_sync_enabled: body.structuredSyncEnabled ?? false,
        use_as_ops_signal: body.useAsOpsSignal ?? false,
        sync_cadence_seconds: body.syncCadenceSeconds ?? 120,
      })
      .select()
      .single();
    return NextResponse.json({ config: data });
  }
}
