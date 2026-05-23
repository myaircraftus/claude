/**
 * GET /api/inbox/thread/[key]  →  every message in a thread, oldest first.
 * Marks the thread read for the calling user.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { key: string } }) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceSupabase()
  const key = decodeURIComponent(params.key)
  // Solo-thread keys (no thread_key on the row) take the form "solo:<uuid>"
  const soloId = key.startsWith('solo:') ? key.slice(5) : null

  const baseSelect = service
    .from('inbox_messages')
    .select('id, source, direction, from_addr, to_addr, cc_addrs, subject, body_text, body_html, classified_as, classify_confidence, attachments, read_at, created_at, related_work_order_id, related_expense_id, related_estimate_id, related_invoice_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
  const { data, error } = soloId
    ? await baseSelect.eq('id', soloId)
    : await baseSelect.eq('thread_key', key)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Mark unread messages in this thread as read.
  const rows = (data ?? []) as Array<{ id: string; read_at: string | null }>
  const unreadIds = rows.filter((m) => !m.read_at).map((m) => m.id)
  if (unreadIds.length > 0) {
    await service
      .from('inbox_messages')
      .update({ read_at: new Date().toISOString() })
      .in('id', unreadIds)
  }

  return NextResponse.json({ thread_key: key, messages: data ?? [] })
}
