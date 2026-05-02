/**
 * POST /api/public/approvals/[token]/respond  (Spec 1.5 — PUBLIC, no auth)
 *
 * Customer responds to a single line item.
 * Body: { line_item_id, response: 'approved'|'denied'|'deferred', comment? }
 *
 * Side effects:
 *   - Updates the line item with customer_response + customer_comment +
 *     responded_at.
 *   - Recomputes parent request status: 'partially-responded' if any items
 *     remain unanswered, 'completed' once all are answered. Stamps
 *     responded_date on first response and on completion.
 *   - **Sprint 1.5 → 1.4 cross-wire**: when response='deferred', creates
 *     a continued_items row for the aircraft (idempotent via the
 *     resulting_continued_item FK on the line item).
 *   - **Sprint 1.5 → 0d cross-wire**: notifies the operator's org via
 *     sendNotification (in-app) so they see the response in real time.
 *
 * Token + line_item_id form the auth: an attacker would need both.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { isValidTokenShape } from '@/lib/approvals/token'
import { sendNotification } from '@/lib/notifications/dispatch'
import type { ApprovalLineResponse, ApprovalLineItem } from '@/types'

const VALID_RESPONSES: ReadonlySet<ApprovalLineResponse> = new Set([
  'approved', 'denied', 'deferred',
])

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  if (!isValidTokenShape(params.token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const lineItemId = String(body?.line_item_id ?? '').trim()
  if (!lineItemId) {
    return NextResponse.json({ error: 'line_item_id required' }, { status: 400 })
  }
  if (!VALID_RESPONSES.has(body?.response)) {
    return NextResponse.json(
      { error: 'response must be approved | denied | deferred' },
      { status: 400 },
    )
  }
  const response: ApprovalLineResponse = body.response
  const comment: string | null =
    typeof body.comment === 'string' && body.comment.trim() ? body.comment.trim() : null

  const supabase = createServiceSupabase()

  // Resolve token → request, with light status guards.
  const { data: request } = await supabase
    .from('approval_requests')
    .select('id, organization_id, aircraft_id, status, expires_at, subject')
    .eq('public_token', params.token)
    .maybeSingle()
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const requestRow = request as {
    id: string; organization_id: string; aircraft_id: string | null;
    status: string; expires_at: string | null; subject: string | null;
  }
  if (requestRow.status === 'draft') {
    return NextResponse.json(
      { error: 'This approval has not been sent yet.' },
      { status: 404 },
    )
  }
  if (requestRow.expires_at && new Date(requestRow.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { error: 'This approval has expired.', status: 'expired' },
      { status: 410 },
    )
  }

  // Resolve line item — must belong to this request.
  const { data: line } = await supabase
    .from('approval_line_items')
    .select('*')
    .eq('id', lineItemId)
    .eq('approval_request_id', requestRow.id)
    .maybeSingle()
  if (!line) return NextResponse.json({ error: 'Line item not found' }, { status: 404 })
  const lineRow = line as ApprovalLineItem

  // Update the line item
  const { error: updErr } = await supabase
    .from('approval_line_items')
    .update({
      customer_response: response,
      customer_comment: comment,
      responded_at: new Date().toISOString(),
    })
    .eq('id', lineItemId)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  // ── Cross-wire 1.5 → 1.4: deferred responses become continued_items ────
  // Idempotent via resulting_continued_item: if this line already produced
  // one (e.g. customer changed mind from approved → deferred → approved
  // → deferred), reuse it. If response flips AWAY from deferred, leave
  // the continued_item alone — it's its own row with its own status now.
  if (response === 'deferred' && requestRow.aircraft_id && !lineRow.resulting_continued_item) {
    const { data: ci, error: ciErr } = await supabase
      .from('continued_items')
      .insert({
        organization_id: requestRow.organization_id,
        aircraft_id: requestRow.aircraft_id,
        description: lineRow.description,
        // Discovery context: note that this came from a customer-deferred
        // approval request. Stored as plain text in notes — no FK from
        // continued_items to approval_requests today.
        discovered_date: new Date().toISOString().slice(0, 10),
        priority: 'medium',
        status: 'open',
        notes: comment
          ? `Deferred by customer on approval "${requestRow.subject ?? 'approval request'}":\n${comment}`
          : `Deferred by customer on approval "${requestRow.subject ?? 'approval request'}".`,
      })
      .select('id')
      .single()
    if (!ciErr && ci) {
      await supabase
        .from('approval_line_items')
        .update({ resulting_continued_item: (ci as { id: string }).id })
        .eq('id', lineItemId)
    }
  }

  // ── Recompute parent request status ─────────────────────────────────────
  const { data: allItems } = await supabase
    .from('approval_line_items')
    .select('id, customer_response')
    .eq('approval_request_id', requestRow.id)

  const items = (allItems ?? []) as Array<{ customer_response: string | null }>
  const answered = items.filter((i) => i.customer_response != null).length
  const total = items.length

  let newStatus = requestRow.status
  let respondedDate: string | null = null
  if (total > 0 && answered === total) {
    newStatus = 'completed'
    respondedDate = new Date().toISOString()
  } else if (answered > 0) {
    newStatus = 'partially-responded'
    if (requestRow.status === 'sent') {
      // First response stamps responded_date for "we heard back" surfacing.
      respondedDate = new Date().toISOString()
    }
  }

  if (newStatus !== requestRow.status || respondedDate) {
    await supabase
      .from('approval_requests')
      .update({
        status: newStatus,
        ...(respondedDate ? { responded_date: respondedDate } : {}),
      })
      .eq('id', requestRow.id)
  }

  // ── Cross-wire 1.5 → 0d: notify the operator's org ──────────────────────
  sendNotification(supabase, {
    organization_id: requestRow.organization_id,
    user_id: 'all-org-members',
    category: 'approval',
    title: `Customer responded: ${response}`,
    body: `${requestRow.subject ?? 'Approval request'} — line "${lineRow.description}" was ${response}${comment ? ` ("${comment.slice(0, 80)}…")` : ''}.`,
    link: `/approvals/${requestRow.id}`,
    source_kind: 'approval_request',
    source_id: requestRow.id,
  }).catch((e) => console.warn('[approvals/respond] notify failed:', e))

  return NextResponse.json({ ok: true, status: newStatus })
}
