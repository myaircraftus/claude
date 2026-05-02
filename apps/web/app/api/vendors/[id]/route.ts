/**
 * /api/vendors/[id] (Spec 2.2)
 *
 * GET    → single vendor + usage counts (parts / POs / WO lines).
 * PATCH  → update fields (mechanic+).
 * DELETE → archive (default) or hard-delete with ?hard=1. Hard-delete
 *          is allowed (FKs SET NULL on referrers preserves history),
 *          but archive is recommended.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import type { OrgRole, VendorType } from '@/types'

const VALID_TYPES: ReadonlySet<VendorType> = new Set(['parts', 'osr', 'service', 'freight', 'other'])

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data: vendor, error } = await supabase
    .from('vendors')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

  if (error)  return NextResponse.json({ error: error.message }, { status: 500 })
  if (!vendor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Usage counts
  const [partsRes, posRes, wolRes] = await Promise.all([
    supabase.from('inventory_parts')  .select('id', { count: 'exact', head: true }).eq('vendor_id', params.id),
    supabase.from('purchase_orders')  .select('id', { count: 'exact', head: true }).eq('vendor_id', params.id),
    supabase.from('work_order_lines') .select('id', { count: 'exact', head: true }).eq('vendor_id', params.id),
  ])

  return NextResponse.json({
    vendor: {
      ...vendor,
      usage: {
        parts:    partsRes.count ?? 0,
        pos:      posRes.count   ?? 0,
        wo_lines: wolRes.count   ?? 0,
      },
    },
  })
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
  if (typeof body.name === 'string') {
    const trimmed = body.name.trim()
    if (!trimmed) return NextResponse.json({ error: 'name cannot be blank' }, { status: 400 })
    updates.name = trimmed
  }
  if (body.vendor_type) {
    if (!VALID_TYPES.has(body.vendor_type)) {
      return NextResponse.json({ error: `vendor_type must be one of ${[...VALID_TYPES].join(', ')}` }, { status: 400 })
    }
    updates.vendor_type = body.vendor_type
  }
  if (typeof body.approved === 'boolean')    updates.approved      = body.approved
  if (typeof body.is_archived === 'boolean') updates.is_archived   = body.is_archived
  if ('address'       in body)                updates.address        = body.address       ?? null
  if ('phone'         in body)                updates.phone          = body.phone         ?? null
  if ('website'       in body)                updates.website        = body.website       ?? null
  if ('contact_name'  in body)                updates.contact_name   = body.contact_name  ?? null
  if ('contact_email' in body)                updates.contact_email  = body.contact_email ?? null
  if ('description'   in body)                updates.description    = body.description   ?? null

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('vendors')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .select('*')
    .maybeSingle()

  if (error) {
    if ((error as any).code === '23505') {
      return NextResponse.json(
        { error: 'A vendor with that name already exists.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ vendor: data })
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

  const supabase = createServerSupabase()
  const hard = req.nextUrl.searchParams.get('hard') === '1'

  if (hard) {
    // FKs are ON DELETE SET NULL, so referrers preserve history.
    const { error } = await supabase
      .from('vendors')
      .delete()
      .eq('id', params.id)
      .eq('organization_id', ctx.organizationId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase
      .from('vendors')
      .update({ is_archived: true })
      .eq('id', params.id)
      .eq('organization_id', ctx.organizationId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
