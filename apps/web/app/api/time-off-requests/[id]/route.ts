/**
 * GET    /api/time-off-requests/[id]   — read (any org member)
 * PATCH  /api/time-off-requests/[id]   — requester edits own pending; admin edits any
 * DELETE /api/time-off-requests/[id]   — requester withdraws own pending; admin removes
 *
 * Spec 2.5.2. Decision (approve/deny) goes through ./decide so the
 * status-flip path is explicit + can carry manager_comment.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import type { TimeOffRequest } from '@/types'

const EDITABLE_FIELDS = ['request_type', 'start_date', 'end_date', 'reason', 'notify_user_ids', 'status'] as const

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('time_off_requests')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ request: data as TimeOffRequest })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data: existing } = await supabase
    .from('time_off_requests')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = ['owner', 'admin'].includes(ctx.role)
  const isRequester = (existing as TimeOffRequest).employee_id === ctx.user.id
  if (!isAdmin && !(isRequester && (existing as TimeOffRequest).status === 'pending')) {
    return NextResponse.json({ error: 'Only requester (pending) or admin can edit' }, { status: 403 })
  }

  // Requester can only flip pending → cancelled via PATCH; status approve/deny
  // goes through ./decide. Block other status transitions for non-admins.
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  if (!isAdmin && typeof body.status === 'string' && body.status !== 'cancelled') {
    return NextResponse.json({ error: 'Use ./decide to approve/deny' }, { status: 403 })
  }

  const updates: Record<string, unknown> = {}
  for (const field of EDITABLE_FIELDS) if (field in body) updates[field] = body[field]
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No editable fields' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('time_off_requests')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ request: data as TimeOffRequest })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('time_off_requests')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
