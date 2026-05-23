/**
 * GET /api/admin/approvals/count
 *
 * Returns aggregate pending-approval counts so the topbar can show a
 * single chip linking to /admin/agents. Each query is gated by
 * is_platform_admin so non-admins get { ok: false, count: 0 } cheaply
 * and the chip stays hidden.
 *
 * Counts:
 *   - agent_recommendations: agent_runs.status = 'needs_human' with
 *     no `acknowledged_at` (the recommendation hasn't been triaged)
 *   - inbox_pending_approval: inbox_messages with classified_as in
 *     ('receipt','estimate','invoice') and approved = false (drafts
 *     waiting for the founder's one-click approve)
 *   - tach_review_pending: agent_runs.agent_id = 'data-sync.tach-time-scraper'
 *     status = 'needs_human' that haven't been resolved yet
 *
 * Cheap — three count(*) queries with HEAD requests.
 */
import { NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, count: 0 })

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .maybeSingle()
  const isAdmin = Boolean((profile as { is_platform_admin?: boolean } | null)?.is_platform_admin)
  if (!isAdmin) return NextResponse.json({ ok: false, count: 0, is_admin: false })

  const service = createServiceSupabase()
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const [agentRes, inboxRes, tachRes] = await Promise.all([
    service
      .from('agent_runs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'needs_human')
      .is('acknowledged_at', null)
      .gte('created_at', since),
    service
      .from('inbox_messages')
      .select('id', { count: 'exact', head: true })
      .in('classified_as', ['receipt', 'estimate', 'invoice'])
      .eq('approved', false)
      .gte('created_at', since),
    service
      .from('agent_runs')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', 'data-sync.tach-time-scraper')
      .eq('status', 'needs_human')
      .is('acknowledged_at', null)
      .gte('created_at', since),
  ])
  const agent = agentRes.count ?? 0
  const inbox = inboxRes.count ?? 0
  const tach = tachRes.count ?? 0
  // tach is a subset of agent — don't double-count
  const count = Math.max(0, agent + inbox)

  return NextResponse.json({
    ok: true,
    is_admin: true,
    count,
    breakdown: {
      agent_recommendations: agent,
      inbox_pending: inbox,
      tach_review_pending: tach,
    },
  })
}
