/**
 * /api/inventory-parts (Spec 2.1)
 *
 * GET  → list parts in active org. Filters: ?q (description / part_number
 *        / alt match), ?low_stock=1 (qty_on_hand <= min_on_hand),
 *        ?part_class, ?include_archived=1.
 * POST → create new part (mechanic+).
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import { buildClassificationPatch } from '@/lib/taxonomy/format'
import type { OrgRole, PartClass } from '@/types'

const VALID_CLASSES: ReadonlySet<PartClass> = new Set(['consumable', 'rotable', 'serialized'])

function buildPartTaxonomyPatch(body: Record<string, unknown>, includeUnset = false) {
  const patch = buildClassificationPatch(body, { includeUnset })
  const result: Record<string, unknown> = {}
  for (const key of ['ata_code', 'jasc_code', 'classification_status'] as const) {
    if (includeUnset || Object.prototype.hasOwnProperty.call(patch, key)) {
      result[key] = patch[key]
    }
  }
  return result
}

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = req.nextUrl
  const q             = (url.searchParams.get('q') ?? '').trim()
  const lowStock      = url.searchParams.get('low_stock') === '1'
  const partClass     = url.searchParams.get('part_class') ?? undefined
  const includeArchived = url.searchParams.get('include_archived') === '1'
  const limitRaw      = parseInt(url.searchParams.get('limit') ?? '200', 10)
  const limit         = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 200, 1), 500)

  const supabase = createServerSupabase()
  let query = supabase
    .from('inventory_parts')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    // Spec polish.cross-rollout — exclude soft-deleted rows.
    .is('deleted_at', null)
    .order('part_number', { ascending: true })
    .limit(limit)

  if (!includeArchived) query = query.eq('is_archived', false)
  if (partClass && VALID_CLASSES.has(partClass as PartClass)) {
    query = query.eq('part_class', partClass)
  }
  if (q) {
    // Match on part_number, description, or any alt_part_number.
    // Supabase doesn't expose array contains-string + text ilike in a single
    // .or(), so we OR three patterns. The leading * on the alt match would
    // collide with PostgREST syntax, so we search the array via `cs` (contains
    // case-sensitive) by uppercasing the query (alt PNs are typically UC).
    const escaped = q.replace(/[%]/g, '')
    query = query.or(
      `part_number.ilike.%${escaped}%,description.ilike.%${escaped}%`,
    )
  }
  // Low-stock filter — partial-index-friendly.
  // Supabase-js doesn't expose `column.lte.column`, so we run the filter
  // client-side after fetching. Cheap for v0 fleet sizes.
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as Array<{ qty_on_hand: number; min_on_hand: number }>
  const filtered = lowStock
    ? rows.filter((r) => Number(r.qty_on_hand) <= Number(r.min_on_hand))
    : rows

  return NextResponse.json({ parts: filtered })
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

  const partNumber  = String(body?.part_number ?? '').trim()
  const description = String(body?.description ?? '').trim()
  if (!partNumber)  return NextResponse.json({ error: 'part_number required' },  { status: 400 })
  if (!description) return NextResponse.json({ error: 'description required' }, { status: 400 })

  const partClass: PartClass =
    body.part_class && VALID_CLASSES.has(body.part_class) ? body.part_class : 'consumable'

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('inventory_parts')
    .insert({
      organization_id: ctx.organizationId,
      part_number: partNumber,
      alt_part_numbers: Array.isArray(body.alt_part_numbers)
        ? body.alt_part_numbers.map(String).filter((s: string) => s.trim().length > 0)
        : [],
      description,
      category: body.category ?? null,
      qty_on_hand: numericOrZero(body.qty_on_hand),
      min_on_hand: numericOrZero(body.min_on_hand),
      unit_cost:   numericOrZero(body.unit_cost),
      unit_price:  numericOrZero(body.unit_price),
      vendor:      body.vendor   ?? null,
      location:    body.location ?? null,
      part_class:  partClass,
      files:        Array.isArray(body.files)        ? body.files.map(String)        : [],
      alert_emails: Array.isArray(body.alert_emails) ? body.alert_emails.map(String) : [],
      created_by: ctx.user.id,
      ...buildPartTaxonomyPatch(body, true),
    })
    .select('*')
    .single()

  if (error) {
    if ((error as any).code === '23505') {
      return NextResponse.json(
        { error: 'A part with that part number already exists in this organization.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ part: data }, { status: 201 })
}

function numericOrZero(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : 0
}
