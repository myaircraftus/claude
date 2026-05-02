/**
 * GET  /api/tools
 *      ?status=enum (repeatable) | ?category=enum (repeatable)
 *      ?due_in_days=N (calibration due within N days)
 *      ?overdue=1 (past calibration date)
 *      ?checked_out=1
 * POST /api/tools — create. All active org members can register tools.
 *
 * Spec 2.6.1.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import type { Tool, ToolStatus, ToolCategory } from '@/types'

const STATUSES: ToolStatus[] = ['in-use', 'available', 'out-for-calibration', 'out-of-service', 'lost', 'retired']
const CATEGORIES: ToolCategory[] = ['torque', 'measuring', 'test-equipment', 'jig', 'lift', 'borescope', 'other']

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { searchParams } = new URL(req.url)

  let query = supabase
    .from('tools')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .order('next_calibration_date', { ascending: true, nullsFirst: false })
    .limit(500)

  const statuses = searchParams.getAll('status').filter((s): s is ToolStatus => (STATUSES as string[]).includes(s))
  if (statuses.length > 0) query = query.in('status', statuses)

  const categories = searchParams.getAll('category').filter((s): s is ToolCategory => (CATEGORIES as string[]).includes(s))
  if (categories.length > 0) query = query.in('category', categories)

  const today = new Date().toISOString().slice(0, 10)
  if (searchParams.get('overdue') === '1') {
    query = query.eq('calibration_required', true).lt('next_calibration_date', today)
  }
  const dueInDays = searchParams.get('due_in_days')
  if (dueInDays) {
    const n = Math.max(0, parseInt(dueInDays, 10) || 0)
    const horizon = new Date(); horizon.setDate(horizon.getDate() + n)
    query = query.eq('calibration_required', true)
      .gte('next_calibration_date', today)
      .lte('next_calibration_date', horizon.toISOString().slice(0, 10))
  }
  if (searchParams.get('checked_out') === '1') query = query.eq('status', 'in-use')

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tools: (data ?? []) as Tool[] })
}

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as Partial<Tool> | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const serial = typeof body.serial_number === 'string' ? body.serial_number.trim() : ''
  if (!serial) return NextResponse.json({ error: 'serial_number required' }, { status: 400 })
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const category: ToolCategory =
    typeof body.category === 'string' && (CATEGORIES as string[]).includes(body.category)
      ? (body.category as ToolCategory)
      : 'other'

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('tools')
    .insert({
      organization_id: ctx.organizationId,
      location_id: typeof body.location_id === 'string' ? body.location_id : null,
      serial_number: serial,
      name,
      category,
      manufacturer: typeof body.manufacturer === 'string' ? body.manufacturer : null,
      model: typeof body.model === 'string' ? body.model : null,
      purchase_date: typeof body.purchase_date === 'string' ? body.purchase_date : null,
      purchase_cost: typeof body.purchase_cost === 'number' ? body.purchase_cost : null,
      storage_location: typeof body.storage_location === 'string' ? body.storage_location : null,
      status: typeof body.status === 'string' && (STATUSES as string[]).includes(body.status) ? body.status : 'available',
      calibration_required: body.calibration_required !== false,
      calibration_interval_months: typeof body.calibration_interval_months === 'number' ? body.calibration_interval_months : null,
      calibration_interval_uses: typeof body.calibration_interval_uses === 'number' ? body.calibration_interval_uses : null,
      tolerance_days: typeof body.tolerance_days === 'number' ? body.tolerance_days : 0,
      certificate_urls: Array.isArray(body.certificate_urls) ? body.certificate_urls : [],
      manual_url: typeof body.manual_url === 'string' ? body.manual_url : null,
      notes: typeof body.notes === 'string' ? body.notes : null,
    })
    .select('*')
    .single()

  if (error) {
    if ((error as any).code === '23505') {
      return NextResponse.json({ error: `A tool with serial "${serial}" already exists in this org` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ tool: data as Tool }, { status: 201 })
}
