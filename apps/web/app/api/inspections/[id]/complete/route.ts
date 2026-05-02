/**
 * POST /api/inspections/[id]/complete (Spec 1.3)
 *
 * Mark the inspection complete. Walks the procedure items + results,
 * derives status (`complete` vs `complete-requires-attention`) via the
 * shared lib/inspections/status helper, sets completed_date.
 *
 * Refuses to complete if any items remain unanswered (returns 409 with
 * the count) — pass `?force=1` to mark anyway as
 * complete-requires-attention.
 *
 * Logged follow-up: when complete, mark linked compliance_items complete
 * via Sprint 1.2's /api/compliance-items/[id]/complete. Currently we only
 * record linked_compliance_items[] for audit; the auto-mark wire is the
 * next sprint that needs it.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { computeInspectionProgress, deriveInspectionStatus } from '@/lib/inspections/status'
import type { OrgRole, ProcedureItem, InspectionResult } from '@/types'

const INSPECTION_WRITE_ROLES: readonly OrgRole[] = ['owner', 'admin', 'mechanic', 'pilot'] as const

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!INSPECTION_WRITE_ROLES.includes(ctx.role as OrgRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const supabase = createServerSupabase()

  const { data: inspection } = await supabase
    .from('inspections')
    .select('id, procedure_id')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (!inspection) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })

  // Pull procedure items + existing results
  const procedureId = (inspection as { procedure_id: string }).procedure_id
  const [{ data: sections }, { data: results }] = await Promise.all([
    supabase
      .from('procedure_sections')
      .select('id, items:procedure_items ( id, procedure_section_id, text, input_type, reference, requires_photo, sort_order, created_at, updated_at )')
      .eq('procedure_id', procedureId),
    supabase
      .from('inspection_results')
      .select('*')
      .eq('inspection_id', params.id),
  ])

  const items: ProcedureItem[] = []
  for (const sec of (sections ?? []) as any[]) {
    for (const it of (sec.items ?? []) as ProcedureItem[]) items.push(it)
  }
  const progress = computeInspectionProgress(items, (results ?? []) as InspectionResult[])
  const force = req.nextUrl.searchParams.get('force') === '1'

  if (progress.pending_items.length > 0 && !force) {
    return NextResponse.json(
      {
        error: 'Inspection has unanswered items. Pass ?force=1 to complete anyway.',
        pending_count: progress.pending_items.length,
        pending_item_ids: progress.pending_items.map((i) => i.id),
      },
      { status: 409 },
    )
  }

  const derived = deriveInspectionStatus(progress)
  const finalStatus = force && progress.pending_items.length > 0
    ? 'complete-requires-attention'
    : derived

  const { data, error } = await supabase
    .from('inspections')
    .update({
      status: finalStatus,
      completed_date: new Date().toISOString(),
    })
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    inspection: data,
    progress,
  })
}
