/**
 * /api/compliance-items (Spec 1.2)
 *
 * GET  → list items in active org. Filter by ?aircraft_id= and/or
 *        ?status= (comma-separated).
 * POST → create a new item; runs recomputeCompliance() for the aircraft
 *        right after insert so next_due_* + status are populated before
 *        the response goes back to the client.
 *
 * Mechanic+ writes (matches RLS).
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { recomputeCompliance } from '@/lib/compliance/recompute'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import type {
  OrgRole,
  ComplianceItemType,
  ComplianceSource,
} from '@/types'

const VALID_TYPES: ReadonlySet<ComplianceItemType> = new Set(['inspection', 'component'])
const VALID_SOURCES: ReadonlySet<ComplianceSource> = new Set([
  'AD', 'SB', 'Manufacturer', 'Custom', 'Life-Limited',
])

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = req.nextUrl
  const aircraftId = url.searchParams.get('aircraft_id') ?? undefined
  const statusParam = url.searchParams.get('status') ?? undefined
  const limitRaw = parseInt(url.searchParams.get('limit') ?? '200', 10)
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 200, 1), 500)

  const supabase = createServerSupabase()
  let q = supabase
    .from('compliance_items')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    // Spec polish.cross-rollout — exclude soft-deleted rows.
    .is('deleted_at', null)
    .order('next_due_date', { ascending: true, nullsFirst: false })
    .limit(limit)

  if (aircraftId) q = q.eq('aircraft_id', aircraftId)
  if (statusParam) {
    const wanted = statusParam.split(',').map((s) => s.trim()).filter(Boolean)
    if (wanted.length > 0) q = q.in('status', wanted)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
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

  const aircraftId = String(body?.aircraft_id ?? '').trim()
  const title = String(body?.title ?? '').trim()
  const itemType: ComplianceItemType =
    body.item_type && VALID_TYPES.has(body.item_type) ? body.item_type : 'inspection'
  const source: ComplianceSource =
    body.source && VALID_SOURCES.has(body.source) ? body.source : 'Custom'

  if (!aircraftId) return NextResponse.json({ error: 'aircraft_id required' }, { status: 400 })
  if (!title)      return NextResponse.json({ error: 'title required' },        { status: 400 })

  // At least one interval must be set (otherwise the item never recomputes).
  const hasInterval =
    body.interval_calendar_months || body.interval_hours || body.interval_cycles
  if (!hasInterval) {
    return NextResponse.json(
      { error: 'At least one of interval_calendar_months / interval_hours / interval_cycles is required' },
      { status: 400 },
    )
  }

  const supabase = createServerSupabase()

  // Verify the aircraft belongs to the active org (clean 404 vs RLS denial).
  const { data: ac } = await supabase
    .from('aircraft')
    .select('id')
    .eq('id', aircraftId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (!ac) return NextResponse.json({ error: 'Aircraft not found in this organization' }, { status: 404 })

  const { data, error } = await supabase
    .from('compliance_items')
    .insert({
      organization_id: ctx.organizationId,
      aircraft_id: aircraftId,
      title,
      item_type: itemType,
      source,
      source_reference: body.source_reference ?? null,
      interval_calendar_months: numericOrNull(body.interval_calendar_months),
      interval_hours:           numericOrNull(body.interval_hours),
      interval_cycles:          numericOrNull(body.interval_cycles),
      tolerance_calendar_days:  numericOrNull(body.tolerance_calendar_days),
      tolerance_hours:          numericOrNull(body.tolerance_hours),
      last_completed_date:    body.last_completed_date ?? null,
      last_completed_hours:   numericOrNull(body.last_completed_hours),
      last_completed_cycles:  numericOrNull(body.last_completed_cycles),
      requires_rii: Boolean(body.requires_rii),
      notes: body.notes ?? null,
      created_by: ctx.user.id,
    })
    .select('*')
    .single()

  if (error) {
    if ((error as any).code === '23505') {
      return NextResponse.json(
        { error: 'A compliance item with the same title and source already exists for this aircraft.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Run recompute so next_due_* + status are populated before the client
  // sees the row. Best-effort — if recompute fails the row is still valid;
  // the next meter reading will retry.
  await recomputeCompliance(supabase, aircraftId, { userId: ctx.user.id }).catch(() => null)

  // Re-read to get the recomputed values
  const { data: refreshed } = await supabase
    .from('compliance_items')
    .select('*')
    .eq('id', (data as { id: string }).id)
    .maybeSingle()

  return NextResponse.json({ item: refreshed ?? data }, { status: 201 })
}

function numericOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
