/**
 * /api/serial-components  (Spec 3.2)
 *
 *   GET  ?aircraft_id= ?status= → org-scoped list
 *   POST → create new component (mechanic+)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import type { ComponentClass, ComponentStatus, SerialComponent } from '@/types'

export const dynamic = 'force-dynamic'

const VALID_CLASS = new Set<ComponentClass>(['engine', 'propeller', 'magneto', 'alternator', 'starter', 'other'])
const VALID_STATUS = new Set<ComponentStatus>(['installed', 'in-stock', 'in-overhaul', 'scrapped'])
const WRITE_ROLES = new Set(['owner', 'admin', 'mechanic'])

interface CreateBody {
  part_number?: string
  serial_number?: string
  description?: string | null
  component_class?: ComponentClass
  installed_on_aircraft?: string | null
  installed_date?: string | null
  installed_hours?: number | null
  hours_since_overhaul?: number
  hours_since_new?: number
  status?: ComponentStatus
  notes?: string | null
}

export async function GET(req: NextRequest) {
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

  const url = new URL(req.url)
  const aircraftId = url.searchParams.get('aircraft_id')
  const status = url.searchParams.get('status')

  let q = supabase
    .from('serial_components')
    .select('*')
    .eq('organization_id', membership.organization_id)
  if (aircraftId) q = q.eq('installed_on_aircraft', aircraftId)
  if (status && VALID_STATUS.has(status as ComponentStatus)) q = q.eq('status', status)

  const { data, error } = await q.order('updated_at', { ascending: false }).limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ components: (data as SerialComponent[]) ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })
  if (!WRITE_ROLES.has(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let body: CreateBody
  try { body = (await req.json()) as CreateBody } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.part_number || !body.serial_number) {
    return NextResponse.json({ error: 'part_number and serial_number required' }, { status: 400 })
  }
  if (!body.component_class || !VALID_CLASS.has(body.component_class)) {
    return NextResponse.json({ error: 'component_class must be one of engine|propeller|magneto|alternator|starter|other' }, { status: 400 })
  }
  if (body.status && !VALID_STATUS.has(body.status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 })
  }

  const initialStatus: ComponentStatus = body.status ?? (body.installed_on_aircraft ? 'installed' : 'in-stock')
  const initialMove = {
    date: new Date().toISOString().slice(0, 10),
    from_aircraft_id: null,
    to_aircraft_id: body.installed_on_aircraft ?? null,
    from_status: null,
    to_status: initialStatus,
    work_order_id: null,
    notes: 'Initial registration',
  }

  const { data, error } = await supabase
    .from('serial_components')
    .insert({
      organization_id: membership.organization_id,
      part_number: body.part_number,
      serial_number: body.serial_number,
      description: body.description ?? null,
      component_class: body.component_class,
      installed_on_aircraft: body.installed_on_aircraft ?? null,
      installed_date: body.installed_date ?? null,
      installed_hours: body.installed_hours ?? null,
      hours_since_overhaul: body.hours_since_overhaul ?? 0,
      hours_since_new: body.hours_since_new ?? 0,
      removal_history: [initialMove],
      status: initialStatus,
      notes: body.notes ?? null,
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ component: data as SerialComponent }, { status: 201 })
}
