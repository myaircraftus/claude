import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * Auth + org guard. The aircraft fetch runs on the RLS-respecting client, so a
 * caller who is not a member of the aircraft's org gets nothing → 404. Returns
 * the aircraft row (with organization_id) on success, or a NextResponse to
 * return immediately.
 */
async function guardAircraft(
  supabase: ReturnType<typeof createServerSupabase>,
  aircraftId: string,
): Promise<{ ok: true; organizationId: string } | { ok: false; response: NextResponse }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, organization_id')
    .eq('id', aircraftId)
    .single();
  if (!aircraft) {
    return { ok: false, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }
  return { ok: true, organizationId: aircraft.organization_id as string };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerSupabase();
    const guard = await guardAircraft(supabase, params.id);
    if (!guard.ok) return guard.response;

    const { data } = await supabase
      .from('aircraft_tracking_provider_config')
      .select('*')
      .eq('aircraft_id', params.id)
      .single();
    return NextResponse.json({ config: data });
  } catch (err) {
    console.error('[tracking/provider-config GET] unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerSupabase();
    const guard = await guardAircraft(supabase, params.id);
    if (!guard.ok) return guard.response;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('aircraft_tracking_provider_config')
      .select('id')
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
    }

    const { data } = await supabase
      .from('aircraft_tracking_provider_config')
      .insert({
        aircraft_id: params.id,
        organization_id: guard.organizationId,
        provider: body.provider || 'none',
        embed_enabled: body.embedEnabled ?? false,
        structured_sync_enabled: body.structuredSyncEnabled ?? false,
        use_as_ops_signal: body.useAsOpsSignal ?? false,
        sync_cadence_seconds: body.syncCadenceSeconds ?? 120,
      })
      .select()
      .single();
    return NextResponse.json({ config: data });
  } catch (err) {
    console.error('[tracking/provider-config PATCH] unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
