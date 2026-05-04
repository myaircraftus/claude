/**
 * /api/approval-requests (Spec 1.5)
 *
 * GET  → list approval requests in active org. Filter by ?work_order_id,
 *        ?status (csv), ?customer_id. Newest first.
 * POST → create a new request + line items. Body:
 *        {
 *          work_order_id?, customer_id?, aircraft_id?,
 *          subject?, message?, expires_at?,
 *          line_items: Array<{ description, estimated_cost?, labor_hours?, parts_cost?, photo_urls? }>
 *        }
 *
 * Mechanic+ writes (matches RLS).
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { generateApprovalToken } from '@/lib/approvals/token'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import type { OrgRole, ApprovalRequestStatus } from '@/types'

const VALID_STATUSES: ReadonlySet<ApprovalRequestStatus> = new Set([
  'draft', 'sent', 'partially-responded', 'completed', 'expired',
])

const SELECT_REQUEST = `
  id, organization_id, work_order_id, customer_id, aircraft_id, public_token,
  status, subject, message, sent_date, responded_date, expires_at,
  created_by, created_at, updated_at,
  line_items:approval_line_items (
    id, approval_request_id, description, estimated_cost, labor_hours,
    parts_cost, photo_urls, customer_response, customer_comment,
    responded_at, resulting_continued_item, work_order_line_id,
    sort_order, created_at, updated_at
  )
`

function sortLineItems(req: any) {
  return {
    ...req,
    line_items: Array.isArray(req?.line_items)
      ? [...req.line_items].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      : [],
  }
}

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = req.nextUrl
  const woId        = url.searchParams.get('work_order_id') ?? undefined
  const customerId  = url.searchParams.get('customer_id') ?? undefined
  const statusParam = url.searchParams.get('status') ?? undefined
  const limitRaw    = parseInt(url.searchParams.get('limit') ?? '100', 10)
  const limit       = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 100, 1), 500)

  const supabase = createServerSupabase()
  let q = supabase
    .from('approval_requests')
    .select(SELECT_REQUEST)
    .eq('organization_id', ctx.organizationId)
    // Spec polish.cross-rollout — exclude soft-deleted rows.
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (woId)        q = q.eq('work_order_id', woId)
  if (customerId)  q = q.eq('customer_id', customerId)
  if (statusParam) {
    const wanted = statusParam
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is ApprovalRequestStatus => VALID_STATUSES.has(s as ApprovalRequestStatus))
    if (wanted.length > 0) q = q.in('status', wanted)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    requests: ((data ?? []) as any[]).map(sortLineItems),
  })
}

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!MECHANIC_AND_ABOVE.includes(ctx.role as OrgRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const lineItems = Array.isArray(body?.line_items) ? body.line_items : []
  if (lineItems.length === 0) {
    return NextResponse.json({ error: 'At least one line item required' }, { status: 400 })
  }
  for (const li of lineItems) {
    if (!li?.description || typeof li.description !== 'string' || !li.description.trim()) {
      return NextResponse.json({ error: 'Each line item needs a description' }, { status: 400 })
    }
  }

  const supabase = createServerSupabase()

  // Insert request
  const { data: request, error: reqErr } = await supabase
    .from('approval_requests')
    .insert({
      organization_id: ctx.organizationId,
      work_order_id: body.work_order_id ?? null,
      customer_id:   body.customer_id   ?? null,
      aircraft_id:   body.aircraft_id   ?? null,
      public_token:  generateApprovalToken(),
      status: 'draft',
      subject: body.subject ?? null,
      message: body.message ?? null,
      expires_at: body.expires_at ?? null,
      created_by: ctx.user.id,
    })
    .select('*')
    .single()

  if (reqErr) {
    return NextResponse.json({ error: reqErr.message }, { status: 500 })
  }
  const requestId = (request as { id: string }).id

  // Insert line items
  const itemRows = lineItems.map((li: any, i: number) => ({
    approval_request_id: requestId,
    description: String(li.description).trim(),
    estimated_cost: numericOrZero(li.estimated_cost),
    labor_hours:    numericOrZero(li.labor_hours),
    parts_cost:     numericOrZero(li.parts_cost),
    photo_urls:     Array.isArray(li.photo_urls) ? li.photo_urls.map(String) : [],
    work_order_line_id: li.work_order_line_id ?? null,
    sort_order: Number.isFinite(li.sort_order) ? Number(li.sort_order) : i,
  }))

  const { error: itemsErr } = await supabase
    .from('approval_line_items')
    .insert(itemRows)
  if (itemsErr) {
    await supabase.from('approval_requests').delete().eq('id', requestId)
    return NextResponse.json({ error: itemsErr.message }, { status: 500 })
  }

  // Re-read full shape
  const { data: full } = await supabase
    .from('approval_requests')
    .select(SELECT_REQUEST)
    .eq('id', requestId)
    .maybeSingle()

  return NextResponse.json({ request: full ? sortLineItems(full) : request }, { status: 201 })
}

function numericOrZero(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
