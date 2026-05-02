import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import type { Tool, CalibrationEvent, ToolCheckout } from '@/types'

const EDITABLE_FIELDS = [
  'serial_number', 'name', 'category', 'manufacturer', 'model', 'purchase_date',
  'purchase_cost', 'storage_location', 'status', 'calibration_required',
  'calibration_interval_months', 'calibration_interval_uses', 'tolerance_days',
  'certificate_urls', 'manual_url', 'notes', 'location_id',
] as const

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const [toolRes, calRes, coRes] = await Promise.all([
    supabase.from('tools').select('*').eq('id', params.id).eq('organization_id', ctx.organizationId).maybeSingle(),
    supabase.from('calibration_events').select('*').eq('tool_id', params.id).order('performed_at', { ascending: false }).limit(50),
    supabase.from('tool_checkouts').select('*').eq('tool_id', params.id).order('checked_out_at', { ascending: false }).limit(50),
  ])
  if (toolRes.error) return NextResponse.json({ error: toolRes.error.message }, { status: 500 })
  if (!toolRes.data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({
    tool: toolRes.data as Tool,
    calibrations: (calRes.data ?? []) as CalibrationEvent[],
    checkouts: (coRes.data ?? []) as ToolCheckout[],
  })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  for (const f of EDITABLE_FIELDS) if (f in body) updates[f] = body[f]
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No editable fields' }, { status: 400 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('tools').update(updates).eq('id', params.id).eq('organization_id', ctx.organizationId)
    .select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tool: data as Tool })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Only owner/admin can delete tools' }, { status: 403 })
  }
  const supabase = createServerSupabase()
  const { error } = await supabase.from('tools').delete().eq('id', params.id).eq('organization_id', ctx.organizationId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
