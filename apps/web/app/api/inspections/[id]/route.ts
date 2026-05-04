/**
 * /api/inspections/[id] (Spec 1.3)
 *
 * GET    → single inspection + the procedure's sections+items + every
 *          existing inspection_results row, in one round-trip. Drives
 *          ProcedureRunner without N+1 fetches.
 * PATCH  → update status / assignee / due_date / notes / linked_work_order /
 *          linked_compliance_items. Status is callable directly here for
 *          'draft' | 'in-progress' overrides; 'complete' /
 *          'complete-requires-attention' should go through the dedicated
 *          /complete endpoint (POST) which records completed_date.
 *          Setting status='complete' here is allowed for backward
 *          compatibility but does NOT set completed_date.
 * DELETE → remove (mechanic+).
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import type { OrgRole, InspectionStatus } from '@/types'

const VALID_STATUSES: ReadonlySet<InspectionStatus> = new Set([
  'draft', 'in-progress', 'complete', 'complete-requires-attention',
])

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data: inspection, error } = await supabase
    .from('inspections')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!inspection) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Procedure (with sections+items) — RLS already restricts to the same org.
  const procedureId = (inspection as { procedure_id: string }).procedure_id
  const { data: procedure } = await supabase
    .from('procedures')
    .select(`
      id, organization_id, name, description, applies_to, is_archived,
      created_by, created_at, updated_at,
      sections:procedure_sections (
        id, procedure_id, title, sort_order, created_at, updated_at,
        items:procedure_items (
          id, procedure_section_id, text, input_type, reference,
          requires_photo, sort_order, created_at, updated_at
        )
      )
    `)
    .eq('id', procedureId)
    .maybeSingle()

  const sortedProcedure = procedure
    ? {
        ...(procedure as any),
        sections: Array.isArray((procedure as any).sections)
          ? [...(procedure as any).sections]
              .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
              .map((s: any) => ({
                ...s,
                items: Array.isArray(s.items)
                  ? [...s.items].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                  : [],
              }))
          : [],
      }
    : null

  // Results
  const { data: results } = await supabase
    .from('inspection_results')
    .select('*')
    .eq('inspection_id', params.id)

  return NextResponse.json({
    inspection,
    procedure: sortedProcedure,
    results: results ?? [],
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (body.status && !VALID_STATUSES.has(body.status)) {
    return NextResponse.json(
      { error: `status must be one of: ${[...VALID_STATUSES].join(', ')}` },
      { status: 400 },
    )
  }
  if (body.status) updates.status = body.status
  if ('assignee'                in body) updates.assignee                = body.assignee ?? null
  if ('due_date'                in body) updates.due_date                = body.due_date ?? null
  if ('notes'                   in body) updates.notes                   = body.notes ?? null
  if ('linked_work_order'       in body) updates.linked_work_order       = body.linked_work_order ?? null
  if (Array.isArray(body.linked_compliance_items)) {
    updates.linked_compliance_items = body.linked_compliance_items.map(String)
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('inspections')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ inspection: data })
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

  // Spec polish.cross-rollout — soft-delete: stamps deleted_at instead of
  // physical DELETE. Restore via /api/trash. Cron purges after 30 days.
  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('inspections')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, soft: true })
}
