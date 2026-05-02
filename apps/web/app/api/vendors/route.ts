/**
 * /api/vendors (Spec 2.2)
 *
 * GET  → list vendors. Filters: ?q (name match), ?vendor_type, ?approved=1,
 *        ?include_archived=1. Returns usage counts (parts / POs / WO lines)
 *        for the operator's overview.
 * POST → create vendor (mechanic+).
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import type { OrgRole, VendorType } from '@/types'

const VALID_TYPES: ReadonlySet<VendorType> = new Set(['parts', 'osr', 'service', 'freight', 'other'])

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = req.nextUrl
  const q             = (url.searchParams.get('q') ?? '').trim()
  const vendorType    = url.searchParams.get('vendor_type') ?? undefined
  const onlyApproved  = url.searchParams.get('approved') === '1'
  const includeArchived = url.searchParams.get('include_archived') === '1'
  const limitRaw      = parseInt(url.searchParams.get('limit') ?? '200', 10)
  const limit         = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 200, 1), 500)

  const supabase = createServerSupabase()
  let query = supabase
    .from('vendors')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .order('name', { ascending: true })
    .limit(limit)

  if (!includeArchived) query = query.eq('is_archived', false)
  if (vendorType && VALID_TYPES.has(vendorType as VendorType)) {
    query = query.eq('vendor_type', vendorType)
  }
  if (onlyApproved) query = query.eq('approved', true)
  if (q) {
    const escaped = q.replace(/[%]/g, '')
    query = query.or(
      `name.ilike.%${escaped}%,contact_name.ilike.%${escaped}%,contact_email.ilike.%${escaped}%`,
    )
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Per-vendor usage counts. Cheap aggregate queries (head:true returns count
  // without rows). Done in parallel for the listed vendors.
  const vendors = (data ?? []) as Array<{ id: string }>
  const ids = vendors.map((v) => v.id)
  if (ids.length === 0) return NextResponse.json({ vendors: [] })

  // Three count queries: parts / POs / WO lines.
  const [partsRes, posRes, wolRes] = await Promise.all([
    supabase.from('inventory_parts').select('vendor_id', { count: 'exact', head: false }).in('vendor_id', ids),
    supabase.from('purchase_orders').select('vendor_id', { count: 'exact', head: false }).in('vendor_id', ids),
    supabase.from('work_order_lines').select('vendor_id', { count: 'exact', head: false }).in('vendor_id', ids),
  ])

  const partsByVendor: Record<string, number> = {}
  for (const r of (partsRes.data ?? []) as Array<{ vendor_id: string }>) {
    partsByVendor[r.vendor_id] = (partsByVendor[r.vendor_id] ?? 0) + 1
  }
  const posByVendor: Record<string, number> = {}
  for (const r of (posRes.data ?? []) as Array<{ vendor_id: string }>) {
    posByVendor[r.vendor_id] = (posByVendor[r.vendor_id] ?? 0) + 1
  }
  const wolByVendor: Record<string, number> = {}
  for (const r of (wolRes.data ?? []) as Array<{ vendor_id: string }>) {
    wolByVendor[r.vendor_id] = (wolByVendor[r.vendor_id] ?? 0) + 1
  }

  return NextResponse.json({
    vendors: vendors.map((v) => ({
      ...v,
      usage: {
        parts:     partsByVendor[v.id] ?? 0,
        pos:       posByVendor[v.id]   ?? 0,
        wo_lines:  wolByVendor[v.id]   ?? 0,
      },
    })),
  })
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

  const name = String(body?.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const vendorType: VendorType =
    body.vendor_type && VALID_TYPES.has(body.vendor_type) ? body.vendor_type : 'parts'

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('vendors')
    .insert({
      organization_id: ctx.organizationId,
      name,
      vendor_type: vendorType,
      approved: Boolean(body.approved),
      address:       body.address       ?? null,
      phone:         body.phone         ?? null,
      website:       body.website       ?? null,
      contact_name:  body.contact_name  ?? null,
      contact_email: body.contact_email ?? null,
      description:   body.description   ?? null,
      created_by: ctx.user.id,
    })
    .select('*')
    .single()

  if (error) {
    if ((error as any).code === '23505') {
      return NextResponse.json(
        { error: 'A vendor with that name already exists in this organization.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ vendor: data }, { status: 201 })
}
