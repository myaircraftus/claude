/**
 * POST /api/tools/[id]/calibrations
 *      Body: { performed_at?, performed_by, certificate_number?, result?, cost?,
 *              notes?, certificate_url?, next_due_date? }
 *
 * If next_due_date isn't provided, it's auto-computed from
 * performed_at + tool.calibration_interval_months (default 12). The
 * AFTER INSERT trigger then writes last_calibration_* + next_calibration_date
 * back to the tool row.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { computeNextDueDate } from '@/lib/tools/queries'
import type { CalibrationEvent, Tool } from '@/types'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data: tool } = await supabase
    .from('tools')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (!tool) return NextResponse.json({ error: 'Tool not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as Partial<CalibrationEvent>
  const performedAt = typeof body.performed_at === 'string' ? body.performed_at : new Date().toISOString().slice(0, 10)
  const performedBy = typeof body.performed_by === 'string' ? body.performed_by.trim() : ''
  if (!performedBy) return NextResponse.json({ error: 'performed_by required (vendor name or "in-house")' }, { status: 400 })

  const result = body.result === 'pass' || body.result === 'fail' || body.result === 'adjusted' ? body.result : 'pass'
  const nextDue = typeof body.next_due_date === 'string' && body.next_due_date
    ? body.next_due_date
    : computeNextDueDate(performedAt, (tool as Tool).calibration_interval_months)

  const { data, error } = await supabase
    .from('calibration_events')
    .insert({
      organization_id: ctx.organizationId,
      tool_id: params.id,
      performed_at: performedAt,
      performed_by: performedBy,
      certificate_number: typeof body.certificate_number === 'string' ? body.certificate_number : null,
      result,
      cost: typeof body.cost === 'number' ? body.cost : null,
      notes: typeof body.notes === 'string' ? body.notes : null,
      certificate_url: typeof body.certificate_url === 'string' ? body.certificate_url : null,
      next_due_date: nextDue,
      logged_by: ctx.user.id,
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Re-read tool so the client gets the updated next_calibration_date.
  const { data: updatedTool } = await supabase
    .from('tools').select('*').eq('id', params.id).eq('organization_id', ctx.organizationId).maybeSingle()

  return NextResponse.json({ event: data as CalibrationEvent, tool: updatedTool as Tool }, { status: 201 })
}
