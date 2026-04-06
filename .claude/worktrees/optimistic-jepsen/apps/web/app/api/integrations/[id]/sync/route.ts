import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

// POST /api/integrations/[id]/sync
// Triggers a manual sync for a connected integration.
// In production this would enqueue a Trigger.dev job; for now it updates
// last_sync_at and returns a success response so the UI flow works.

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabase()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Verify integration belongs to this org
    const { data: integration, error: intErr } = await supabase
      .from('integrations')
      .select('id, provider, status, organization_id')
      .eq('id', params.id)
      .eq('organization_id', (membership as any).organization_id)
      .single()

    if (intErr || !integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
    }

    if (integration.status !== 'connected') {
      return NextResponse.json(
        { error: 'Integration is not connected. Reconnect it before syncing.' },
        { status: 400 }
      )
    }

    // Mark sync started
    await supabase
      .from('integrations')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'syncing',
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)

    // In production: enqueue the sync job via Trigger.dev
    // await tasks.trigger('integration-sync', { integrationId: params.id, provider: integration.provider })

    // For now, simulate a successful sync (no actual external API calls)
    const syncResult = await simulateSync(integration.provider)

    // Update with sync result
    const { data: updated, error: updateErr } = await supabase
      .from('integrations')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: syncResult.success ? 'success' : 'error',
        last_sync_error: syncResult.error ?? null,
        aircraft_count_synced: syncResult.aircraftCount ?? 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select()
      .single()

    if (updateErr) {
      console.error('[integrations/sync] update error:', updateErr)
    }

    return NextResponse.json({
      success: syncResult.success,
      message: syncResult.success
        ? `Sync complete. ${syncResult.aircraftCount ?? 0} aircraft records updated.`
        : `Sync failed: ${syncResult.error}`,
      integration: updated ?? null,
    })
  } catch (err: any) {
    console.error('[POST /api/integrations/[id]/sync] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Simulates sync for demo purposes until real provider APIs are integrated.
async function simulateSync(provider: string): Promise<{
  success: boolean
  aircraftCount?: number
  error?: string
}> {
  // Simulate network latency
  await new Promise(r => setTimeout(r, 800))

  const mockCounts: Record<string, number> = {
    flight_schedule_pro: 3,
    flight_circle: 2,
    myfbo: 4,
    avianis: 6,
    fl3xx: 5,
    leon: 7,
    talon: 2,
  }

  return {
    success: true,
    aircraftCount: mockCounts[provider] ?? 1,
  }
}
