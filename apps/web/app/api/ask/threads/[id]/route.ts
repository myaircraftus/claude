/**
 * GET    /api/ask/threads/[id]  — full message history for one owned thread.
 * DELETE /api/ask/threads/[id]  — archive (soft-delete) the conversation.
 *
 * Both verify the thread belongs to the caller (org + created_by) inside the
 * data layer, so a user can only read/remove their own Ask AI conversations.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { loadAskThreadMessages, archiveAskThread } from '@/lib/ask/threads'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const result = await loadAskThreadMessages(supabase, params.id, ctx.organizationId, ctx.user.id)
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(result)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const ok = await archiveAskThread(supabase, params.id, ctx.organizationId, ctx.user.id)
  if (!ok) return NextResponse.json({ error: 'Could not delete conversation' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
