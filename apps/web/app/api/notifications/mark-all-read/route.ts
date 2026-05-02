/**
 * POST /api/notifications/mark-all-read (Spec 0.4)
 *
 * Marks every unread notification (channel = in-app) for the current user
 * × active org as read. Used by the bell dropdown's "Mark all read" button.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { error, count } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() }, { count: 'exact' })
    .eq('user_id', ctx.user.id)
    .eq('organization_id', ctx.organizationId)
    .eq('channel', 'in-app')
    .is('read_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, marked: count ?? 0 })
}
