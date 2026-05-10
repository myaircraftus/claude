/**
 * /api/admin/support/counts — Phase 16 Sprint 16.4
 *
 * Lightweight count endpoint for the admin nav badge + the
 * /admin/* P0 banner. Returns {awaiting_admin, p0_breaching}.
 */
import { NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { TICKET_SLA_WINDOW_MS } from '@/lib/support/tickets'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase
    .from('user_profiles').select('is_platform_admin').eq('id', user.id).single()
  if (!profile?.is_platform_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceSupabase()
  const { count: awaitingAdmin } = await service
    .from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'awaiting_admin')
    .is('deleted_at', null)

  // P0 awaiting > 15 min = SLA breach.
  const cutoff = new Date(Date.now() - TICKET_SLA_WINDOW_MS.P0).toISOString()
  const { count: p0Breaching } = await service
    .from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'awaiting_admin')
    .eq('severity', 'P0')
    .lt('created_at', cutoff)
    .is('deleted_at', null)

  return NextResponse.json({
    awaiting_admin: awaitingAdmin ?? 0,
    p0_breaching: p0Breaching ?? 0,
  })
}
