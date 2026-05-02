/**
 * /api/notifications/[id] (Spec 0.4)
 *
 * PATCH  → mark read or unread. Body: { read: boolean }.
 * DELETE → permanently delete (caller's UI dismiss). Bell view is filtered
 *           by `read_at IS NULL` so dismiss is also "make it disappear from
 *           the bell view" — softer than DB delete; we still hard-delete to
 *           keep the user's notification table from growing unbounded.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { read?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.read !== 'boolean') {
    return NextResponse.json({ error: 'read (boolean) required' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('notifications')
    .update({ read_at: body.read ? new Date().toISOString() : null })
    .eq('id', params.id)
    .eq('user_id', ctx.user.id)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', params.id)
    .eq('user_id', ctx.user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
