/**
 * POST /api/inbox/approve
 *
 * Approve the AI-extracted draft attached to an inbox_messages row.
 * Body: { message_id: string }
 *
 * The classifier+extractor chain has already drafted a cost_entries /
 * estimates / invoices row and linked it via related_*_id on the
 * inbox_messages row. This endpoint flips the draft to approved /
 * pending so it stops being a "draft" and shows up in the normal
 * reports + workflows.
 *
 * - cost_entries.approved → true
 * - estimates.status      → 'pending'  (was 'draft')
 * - invoices.status       → 'pending'  (was 'draft')
 *
 * Idempotent. Only the user who owns the inbox message (and is in the
 * matching org) can approve.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { message_id?: string }
  if (!body.message_id) {
    return NextResponse.json({ error: 'message_id required' }, { status: 400 })
  }

  const service = createServiceSupabase()
  const { data: msg } = await service
    .from('inbox_messages')
    .select(
      'id, user_id, related_expense_id, related_estimate_id, related_invoice_id, classified_as',
    )
    .eq('id', body.message_id)
    .maybeSingle()
  if (!msg) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (msg.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const updates: Array<{ table: string; id: string; ok: boolean; error?: string }> = []

  if (msg.related_expense_id) {
    const { error } = await service
      .from('cost_entries')
      .update({ approved: true })
      .eq('id', msg.related_expense_id)
    updates.push({ table: 'cost_entries', id: msg.related_expense_id, ok: !error, error: error?.message })
  }
  if (msg.related_estimate_id) {
    const { error } = await service
      .from('estimates')
      .update({ status: 'pending' })
      .eq('id', msg.related_estimate_id)
      .eq('status', 'draft')
    updates.push({ table: 'estimates', id: msg.related_estimate_id, ok: !error, error: error?.message })
  }
  if (msg.related_invoice_id) {
    const { error } = await service
      .from('invoices')
      .update({ status: 'pending' })
      .eq('id', msg.related_invoice_id)
      .eq('status', 'draft')
    updates.push({ table: 'invoices', id: msg.related_invoice_id, ok: !error, error: error?.message })
  }

  if (updates.length === 0) {
    return NextResponse.json(
      { error: 'No AI-extracted draft attached to this message' },
      { status: 400 },
    )
  }
  return NextResponse.json({ ok: true, updates })
}
