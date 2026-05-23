/**
 * GET /api/inbox  →  user's unified inbox (most recent thread first).
 * Returns one row per thread with the latest message preview, unread count,
 * and the AI category.
 *
 * Query params:
 *   filter: 'all' | 'unread' | 'receipt' | 'estimate' | 'invoice' | 'reminder'
 *   limit:  default 50, max 200
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const filter = req.nextUrl.searchParams.get('filter') ?? 'all'
  const limit = Math.min(
    200,
    Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10)),
  )

  const service = createServiceSupabase()
  let q = service
    .from('inbox_messages')
    .select('id, source, direction, from_addr, to_addr, subject, body_text, classified_as, classify_confidence, thread_key, read_at, created_at, related_work_order_id, related_expense_id, related_estimate_id, related_invoice_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (filter === 'unread') q = q.is('read_at', null)
  else if (
    filter === 'receipt' ||
    filter === 'estimate' ||
    filter === 'invoice' ||
    filter === 'reminder'
  )
    q = q.eq('classified_as', filter)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Roll up by thread_key — pick the most recent message per thread, sum
  // unread, attach a short preview. Threads without a key get treated as
  // singletons keyed on id.
  type Row = NonNullable<typeof data>[number]
  const byThread = new Map<string, { latest: Row; unread: number; count: number }>()
  for (const row of data ?? []) {
    const key = row.thread_key ?? `solo:${row.id}`
    const slot = byThread.get(key)
    if (!slot) {
      byThread.set(key, { latest: row, unread: row.read_at ? 0 : 1, count: 1 })
    } else {
      slot.count += 1
      if (!row.read_at) slot.unread += 1
      if (new Date(row.created_at) > new Date(slot.latest.created_at)) slot.latest = row
    }
  }
  const threads = Array.from(byThread.entries()).map(([key, v]) => ({
    thread_key: key,
    latest: {
      id: v.latest.id,
      source: v.latest.source,
      direction: v.latest.direction,
      from_addr: v.latest.from_addr,
      to_addr: v.latest.to_addr,
      subject: v.latest.subject,
      preview: (v.latest.body_text ?? '').slice(0, 160),
      classified_as: v.latest.classified_as,
      classify_confidence: v.latest.classify_confidence,
      created_at: v.latest.created_at,
      related_work_order_id: v.latest.related_work_order_id,
    },
    unread: v.unread,
    message_count: v.count,
  }))
  threads.sort((a, b) => (b.latest.created_at ?? '').localeCompare(a.latest.created_at ?? ''))

  return NextResponse.json({ threads })
}
