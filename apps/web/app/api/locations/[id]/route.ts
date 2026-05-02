/**
 * /api/locations/[id] — per-location read / update / delete.
 *
 * GET    → single location
 * PATCH  → update fields (mechanic+)
 * DELETE → remove (mechanic+; on-delete-set-null on referencing rows)
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import type { LocationType, OrgRole } from '@/types'

const VALID_LOCATION_TYPES: LocationType[] = ['hangar', 'tie-down', 'ramp', 'shop', 'office']

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('locations')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!MECHANIC_AND_ABOVE.includes(ctx.role as OrgRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let body: {
    name?: string
    airport_code?: string | null
    location_type?: LocationType
    address?: string | null
    parent_location_id?: string | null
  }
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
  if ('airport_code' in body) {
    updates.airport_code = body.airport_code ? String(body.airport_code).toUpperCase().trim() : null
  }
  if (body.location_type) {
    if (!VALID_LOCATION_TYPES.includes(body.location_type)) {
      return NextResponse.json(
        { error: `location_type must be one of: ${VALID_LOCATION_TYPES.join(', ')}` },
        { status: 400 },
      )
    }
    updates.location_type = body.location_type
  }
  if ('address' in body) updates.address = body.address ?? null
  if ('parent_location_id' in body) {
    if (body.parent_location_id === params.id) {
      return NextResponse.json({ error: 'A location cannot be its own parent' }, { status: 400 })
    }
    updates.parent_location_id = body.parent_location_id ?? null
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('locations')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .select()
    .single()

  if (error) {
    if ((error as any).code === '23505') {
      return NextResponse.json(
        { error: 'A location with that name already exists in this organization.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!MECHANIC_AND_ABOVE.includes(ctx.role as OrgRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('locations')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
