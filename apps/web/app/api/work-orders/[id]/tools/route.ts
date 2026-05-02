/**
 * GET  /api/work-orders/[id]/tools  — list tools used on this WO.
 * POST /api/work-orders/[id]/tools  — add a tool use. SERVER-SIDE GUARD:
 *      refuses with 409 if the tool is overdue on calibration past its
 *      tolerance window. Spec 2.6.1 acceptance clause 4: "After
 *      expiration, attempting to add it to a WO blocks save."
 *
 * Body: { tool_id, notes?, force?: bool (admin override) }
 *
 * DELETE /api/work-orders/[id]/tools  — Body: { use_id } removes a use.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { assertToolCalibrated } from '@/lib/tools/queries'
import type { WorkOrderToolUse } from '@/types'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('work_order_tool_uses')
    .select('*, tools:tool_id (id, name, serial_number, category, status, next_calibration_date)')
    .eq('work_order_id', params.id)
    .eq('organization_id', ctx.organizationId)
    .order('used_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ uses: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { tool_id?: unknown; notes?: unknown; force?: unknown }
  const toolId = typeof body.tool_id === 'string' ? body.tool_id : ''
  if (!toolId) return NextResponse.json({ error: 'tool_id required' }, { status: 400 })

  const supabase = createServerSupabase()

  // Confirm WO is in this org.
  const { data: wo } = await supabase
    .from('work_orders').select('id').eq('id', params.id).eq('organization_id', ctx.organizationId).maybeSingle()
  if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

  // ── The calibration guard (spec acceptance clause 4) ──────────
  const guard = await assertToolCalibrated(supabase, ctx.organizationId, toolId)
  const isAdmin = ['owner', 'admin'].includes(ctx.role)
  let wasOverdue = false
  if (!guard.ok) {
    if (!body.force || !isAdmin) {
      return NextResponse.json(
        { error: guard.reason, code: 'TOOL_REQUIRES_CALIBRATION', tool: guard.tool },
        { status: 409 },
      )
    }
    // Admin override — record was_overdue=true so the audit trail tells the truth.
    wasOverdue = true
  }

  const { data, error } = await supabase
    .from('work_order_tool_uses')
    .insert({
      organization_id: ctx.organizationId,
      work_order_id: params.id,
      tool_id: toolId,
      was_overdue: wasOverdue,
      used_at: new Date().toISOString(),
      used_by: ctx.user.id,
      notes: typeof body.notes === 'string' ? body.notes : null,
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ use: data as WorkOrderToolUse }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { use_id?: unknown }
  const useId = typeof body.use_id === 'string' ? body.use_id : ''
  if (!useId) return NextResponse.json({ error: 'use_id required' }, { status: 400 })

  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('work_order_tool_uses').delete()
    .eq('id', useId)
    .eq('work_order_id', params.id)
    .eq('organization_id', ctx.organizationId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
