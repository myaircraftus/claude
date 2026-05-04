/**
 * /api/inspections (Spec 1.3)
 *
 * GET  → list inspections in active org. Filter by ?aircraft_id, ?status,
 *        ?procedure_id. Newest first.
 * POST → create an inspection from a procedure. Body:
 *        {
 *          aircraft_id, procedure_id,
 *          assignee?, due_date?, linked_work_order?,
 *          linked_compliance_items?: string[]
 *        }
 *        Snapshots procedure_name into procedure_name_snapshot.
 *
 * Mechanic+ + pilot can create (matches RLS — mirrors meter readings;
 * pilots run pre-flight inspections).
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import type { OrgRole, InspectionStatus } from '@/types'

const VALID_STATUSES: ReadonlySet<InspectionStatus> = new Set([
  'draft', 'in-progress', 'complete', 'complete-requires-attention',
])

const INSPECTION_WRITE_ROLES: readonly OrgRole[] = ['owner', 'admin', 'mechanic', 'pilot'] as const

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = req.nextUrl
  const aircraftId  = url.searchParams.get('aircraft_id') ?? undefined
  const statusParam = url.searchParams.get('status') ?? undefined
  const procedureId = url.searchParams.get('procedure_id') ?? undefined
  const limitRaw    = parseInt(url.searchParams.get('limit') ?? '100', 10)
  const limit       = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 100, 1), 500)

  const supabase = createServerSupabase()
  let q = supabase
    .from('inspections')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    // Spec polish.cross-rollout — exclude soft-deleted rows.
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (aircraftId)  q = q.eq('aircraft_id', aircraftId)
  if (procedureId) q = q.eq('procedure_id', procedureId)
  if (statusParam) {
    const wanted = statusParam.split(',').map((s) => s.trim()).filter(Boolean)
    if (wanted.length > 0) q = q.in('status', wanted)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ inspections: data ?? [] })
}

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!INSPECTION_WRITE_ROLES.includes(ctx.role as OrgRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const aircraftId  = String(body?.aircraft_id  ?? '').trim()
  const procedureId = String(body?.procedure_id ?? '').trim()
  if (!aircraftId)  return NextResponse.json({ error: 'aircraft_id required' },  { status: 400 })
  if (!procedureId) return NextResponse.json({ error: 'procedure_id required' }, { status: 400 })

  const supabase = createServerSupabase()

  // Sanity-check aircraft + procedure are in this org (cleaner errors than RLS denials).
  const [{ data: aircraft }, { data: proc }] = await Promise.all([
    supabase.from('aircraft').select('id').eq('id', aircraftId).eq('organization_id', ctx.organizationId).maybeSingle(),
    supabase.from('procedures').select('id, name').eq('id', procedureId).eq('organization_id', ctx.organizationId).maybeSingle(),
  ])
  if (!aircraft) return NextResponse.json({ error: 'Aircraft not found in this organization' }, { status: 404 })
  if (!proc)     return NextResponse.json({ error: 'Procedure not found in this organization' }, { status: 404 })

  const status: InspectionStatus =
    body.status && VALID_STATUSES.has(body.status) ? body.status : 'draft'

  const { data, error } = await supabase
    .from('inspections')
    .insert({
      organization_id: ctx.organizationId,
      aircraft_id: aircraftId,
      procedure_id: procedureId,
      procedure_name_snapshot: (proc as { name: string }).name,
      status,
      assignee: body.assignee ?? null,
      due_date: body.due_date ?? null,
      linked_work_order: body.linked_work_order ?? null,
      linked_compliance_items: Array.isArray(body.linked_compliance_items)
        ? body.linked_compliance_items.map(String)
        : [],
      notes: body.notes ?? null,
      created_by: ctx.user.id,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ inspection: data }, { status: 201 })
}
