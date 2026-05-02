/**
 * GET /api/public/approvals/[token]  (Spec 1.5 — PUBLIC, no auth)
 *
 * Customer-facing read endpoint. Token is the auth: anyone with the
 * unguessable public_token can see the approval request + line items
 * + minimal context (aircraft tail, customer name, sender org name).
 *
 * Uses createServiceSupabase() to bypass RLS — RLS is org-scoped and
 * customers don't have a Supabase auth session.
 *
 * Note: token shape is validated client-side and the DB has a UNIQUE
 * index on public_token, so the only realistic ways this returns 404
 * are: (a) the operator hasn't sent the request yet, (b) the request
 * has been deleted, or (c) someone is fishing for tokens.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { isValidTokenShape } from '@/lib/approvals/token'

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } },
) {
  if (!isValidTokenShape(params.token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  }

  const supabase = createServiceSupabase()

  const { data: request, error } = await supabase
    .from('approval_requests')
    .select(`
      id, organization_id, work_order_id, customer_id, aircraft_id,
      status, subject, message, sent_date, responded_date, expires_at,
      created_at, updated_at,
      line_items:approval_line_items (
        id, approval_request_id, description, estimated_cost, labor_hours,
        parts_cost, photo_urls, customer_response, customer_comment,
        responded_at, sort_order
      )
    `)
    .eq('public_token', params.token)
    .maybeSingle()

  if (error)   return NextResponse.json({ error: error.message }, { status: 500 })
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Don't expose drafts via public link — operator hasn't actually sent.
  if ((request as { status: string }).status === 'draft') {
    return NextResponse.json(
      { error: 'This approval request has not been sent yet.' },
      { status: 404 },
    )
  }
  // Expired requests get a friendlier message + status code.
  const expiresAt = (request as { expires_at: string | null }).expires_at
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
    return NextResponse.json(
      { error: 'This approval request has expired.', status: 'expired' },
      { status: 410 },
    )
  }

  // Pull a minimal lookup payload for the customer view. Each is org-data
  // exposed only via the token — same trust boundary as the line items.
  const r = request as any
  const [{ data: org }, { data: aircraft }, { data: customer }] = await Promise.all([
    supabase.from('organizations').select('name').eq('id', r.organization_id).maybeSingle(),
    r.aircraft_id
      ? supabase.from('aircraft').select('tail_number, make, model').eq('id', r.aircraft_id).maybeSingle()
      : Promise.resolve({ data: null }),
    r.customer_id
      ? supabase.from('customers').select('name').eq('id', r.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return NextResponse.json({
    request: {
      ...r,
      line_items: Array.isArray(r.line_items)
        ? [...r.line_items].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        : [],
    },
    organization: org,
    aircraft,
    customer,
  })
}
