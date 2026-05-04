/**
 * /api/approval-requests/[id] (Spec 1.5)
 *
 * GET    → single request + line items + customer/aircraft/WO lookups.
 * PATCH  → operator updates: subject / message / expires_at / status
 *          (only 'draft' / 'expired' allowed via PATCH; 'sent' goes
 *          through /send; 'partially-responded' / 'completed' are owned
 *          by /respond).
 * DELETE → remove (mechanic+).
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import type { OrgRole } from '@/types'

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

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('approval_requests')
    .select(SELECT_REQUEST)
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ request: sortLineItems(data) })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
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

  const updates: Record<string, unknown> = {}
  if ('subject'    in body) updates.subject    = body.subject    ?? null
  if ('message'    in body) updates.message    = body.message    ?? null
  if ('expires_at' in body) updates.expires_at = body.expires_at ?? null
  if (body.status !== undefined) {
    if (body.status !== 'draft' && body.status !== 'expired') {
      return NextResponse.json(
        { error: "PATCH only accepts status='draft' or 'expired'. Use /send or /respond for other transitions." },
        { status: 400 },
      )
    }
    updates.status = body.status
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('approval_requests')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ request: data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!MECHANIC_AND_ABOVE.includes(ctx.role as OrgRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  // Spec polish.cross-rollout — soft-delete via deleted_at; trash + 30d purge.
  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('approval_requests')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, soft: true })
}
