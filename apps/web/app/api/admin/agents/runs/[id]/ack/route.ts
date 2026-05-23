/**
 * POST /api/admin/agents/runs/[id]/ack
 *
 * Marks an agent_runs row as acknowledged by the calling platform
 * admin. Decrements the topbar approval-count chip.
 *
 * Does NOT mutate status, output, recommendation, or any other audit
 * field. Only flips acknowledged_at / acknowledged_by.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .maybeSingle()
  const isAdmin = Boolean((profile as { is_platform_admin?: boolean } | null)?.is_platform_admin)
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = createServiceSupabase()
  const { error } = await service
    .from('agent_runs')
    .update({
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: user.id,
    })
    .eq('id', params.id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
