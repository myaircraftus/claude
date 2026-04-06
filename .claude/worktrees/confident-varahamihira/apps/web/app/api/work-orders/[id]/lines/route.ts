import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

// POST /api/work-orders/[id]/lines — add a line item
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })

  const body = await req.json() as {
    line_type: string
    description: string
    quantity?: number
    unit_price?: number
    hours?: number
    rate?: number
    part_number?: string
    vendor?: string
    condition?: string
    notes?: string
    sort_order?: number
  }

  const { data, error } = await supabase
    .from('work_order_lines')
    .insert({
      work_order_id: params.id,
      organization_id: membership.organization_id,
      line_type: body.line_type,
      description: body.description,
      quantity: body.quantity ?? 1,
      unit_price: body.unit_price ?? 0,
      hours: body.hours ?? null,
      rate: body.rate ?? null,
      part_number: body.part_number ?? null,
      vendor: body.vendor ?? null,
      condition: body.condition ?? null,
      notes: body.notes ?? null,
      sort_order: body.sort_order ?? 0,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Recalculate totals
  await recalcTotals(supabase, params.id)

  // Save to saved_parts if it's a part line
  if (body.line_type === 'part' && body.part_number) {
    await supabase.from('saved_parts').upsert({
      organization_id: membership.organization_id,
      part_number: body.part_number.toUpperCase(),
      description: body.description,
      vendor: body.vendor ?? null,
      unit_price: body.unit_price ?? null,
      condition: body.condition ?? null,
      use_count: 1,
    }, {
      onConflict: 'organization_id,part_number',
      ignoreDuplicates: false,
    }).then(() => {
      // Increment use_count if already exists — best effort
      supabase.rpc('increment_saved_part_use_count', {
        p_org_id: membership.organization_id,
        p_part_number: body.part_number!.toUpperCase(),
      }).then(() => {})
    })
  }

  return NextResponse.json(data)
}

// DELETE /api/work-orders/[id]/lines?line_id=xxx
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const lineId = new URL(req.url).searchParams.get('line_id')
  if (!lineId) return NextResponse.json({ error: 'line_id required' }, { status: 400 })

  const { error } = await supabase
    .from('work_order_lines')
    .delete()
    .eq('id', lineId)
    .eq('work_order_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recalcTotals(supabase, params.id)
  return NextResponse.json({ ok: true })
}

async function recalcTotals(supabase: ReturnType<typeof import('@/lib/supabase/server').createServerSupabase>, workOrderId: string) {
  const { data: lines } = await supabase
    .from('work_order_lines')
    .select('line_type, line_total, hours, rate')
    .eq('work_order_id', workOrderId)

  if (!lines) return

  let laborTotal = 0
  let partsTotal = 0
  let outsideTotal = 0

  for (const line of lines) {
    const lineTotal = line.line_total ?? 0
    if (line.line_type === 'labor') {
      // For labor: hours * rate if both present, else quantity * unit_price
      const laborAmt = (line.hours && line.rate) ? (line.hours * line.rate) : lineTotal
      laborTotal += laborAmt
    } else if (line.line_type === 'part') {
      partsTotal += lineTotal
    } else if (line.line_type === 'outside_service') {
      outsideTotal += lineTotal
    }
  }

  const total = laborTotal + partsTotal + outsideTotal
  await supabase
    .from('work_orders')
    .update({
      labor_total: laborTotal,
      parts_total: partsTotal,
      outside_services_total: outsideTotal,
      total: total,
      updated_at: new Date().toISOString(),
    })
    .eq('id', workOrderId)
}
