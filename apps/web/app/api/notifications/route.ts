/**
 * GET /api/notifications (Spec 0.4)
 *
 * Returns the current user's notifications for the active org. RLS already
 * restricts to the recipient; this layer adds filtering + ordering.
 *
 * Query params:
 *   - status=unread|read|all  (default: all)
 *   - channel=in-app|email|push|sms  (default: in-app — bell view)
 *   - limit=N (default 50, max 200)
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

const VALID_CHANNELS = new Set(['in-app', 'email', 'push', 'sms'])

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = req.nextUrl
  const status = url.searchParams.get('status') ?? 'all'
  const channelParam = url.searchParams.get('channel') ?? 'in-app'
  const channel = VALID_CHANNELS.has(channelParam) ? channelParam : 'in-app'

  const limitRaw = parseInt(url.searchParams.get('limit') ?? '50', 10)
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 200)

  const supabase = createServerSupabase()
  let q = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', ctx.user.id)
    .eq('organization_id', ctx.organizationId)
    .eq('channel', channel)
    .order('sent_at', { ascending: false })
    .limit(limit)

  if (status === 'unread') q = q.is('read_at', null)
  else if (status === 'read') q = q.not('read_at', 'is', null)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Unread count for bell badge — separate cheap aggregate.
  const { count: unread } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', ctx.user.id)
    .eq('organization_id', ctx.organizationId)
    .eq('channel', 'in-app')
    .is('read_at', null)

  return NextResponse.json({
    notifications: data ?? [],
    unread_count: unread ?? 0,
  })
}
