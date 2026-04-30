import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(_req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const { data, error } = await supabase
    .from('work_order_checklist_items')
    .select(`
      id,
      template_key,
      template_label,
      section,
      item_key,
      item_label,
      item_description,
      source,
      source_reference,
      required,
      completed,
      completed_at,
      completed_by,
      sort_order
    `)
    .eq('organization_id', orgId)
    .eq('work_order_id', params.id)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ items: data ?? [] })
}

/**
 * POST /api/work-orders/[id]/checklist
 *
 * Adds a single checklist item to a work order. Used by the AD/SB Manager
 * "Add to Work Order" button — creates an item with source='ad' so the
 * mechanic sees the AD as a required step alongside the templated checklist.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const { data: wo } = await supabase
    .from('work_orders')
    .select('id, aircraft_id')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const itemLabel = typeof body?.item_label === 'string' ? body.item_label.trim() : ''
  if (!itemLabel) return NextResponse.json({ error: 'item_label required' }, { status: 400 })

  const { data: maxSortRow } = await supabase
    .from('work_order_checklist_items')
    .select('sort_order')
    .eq('work_order_id', params.id)
    .eq('organization_id', orgId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextSort = (maxSortRow?.sort_order ?? 0) + 10

  const { data, error } = await supabase
    .from('work_order_checklist_items')
    .insert({
      organization_id: orgId,
      work_order_id: params.id,
      aircraft_id: wo.aircraft_id ?? null,
      template_key: body?.template_key ?? null,
      template_label: body?.template_label ?? null,
      section: body?.section ?? 'Compliance',
      item_key: body?.item_key ?? null,
      item_label: itemLabel,
      item_description: body?.item_description ?? null,
      source: body?.source ?? 'manual',
      source_reference: body?.source_reference ?? null,
      required: body?.required ?? true,
      sort_order: nextSort,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data }, { status: 201 })
}
