/**
 * /api/locations
 *
 * CRUD entry points for the Spec 0.1 `locations` table. Org-scoped via
 * organization_memberships RLS — server queries also explicitly filter by
 * the active org as defense-in-depth.
 *
 * GET    → list locations in active org
 * POST   → create a new location (mechanic / admin / owner only)
 *
 * Per-id PATCH/DELETE live in `[id]/route.ts`.
 *
 * Spec contract: addLocation(payload: Omit<Location, 'id'|'createdAt'|'updatedAt'>) → Location
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import type { LocationType, OrgRole } from '@/types'

const VALID_LOCATION_TYPES: LocationType[] = ['hangar', 'tie-down', 'ramp', 'shop', 'office']

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { searchParams } = new URL(req.url)
  const parentId = searchParams.get('parent_location_id')
  const airport = searchParams.get('airport_code')

  let query = supabase
    .from('locations')
    .select('id, organization_id, name, airport_code, location_type, address, parent_location_id, created_at, updated_at')
    .eq('organization_id', ctx.organizationId)
    .order('name', { ascending: true })

  if (parentId === 'null') query = query.is('parent_location_id', null)
  else if (parentId) query = query.eq('parent_location_id', parentId)
  if (airport) query = query.eq('airport_code', airport.toUpperCase())

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ locations: data ?? [] })
}

export async function POST(req: NextRequest) {
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

  const name = (body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const location_type: LocationType =
    body.location_type && VALID_LOCATION_TYPES.includes(body.location_type)
      ? body.location_type
      : 'hangar'

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('locations')
    .insert({
      organization_id: ctx.organizationId,
      name,
      airport_code: body.airport_code ? String(body.airport_code).toUpperCase().trim() : null,
      location_type,
      address: body.address ?? null,
      parent_location_id: body.parent_location_id ?? null,
    })
    .select()
    .single()

  if (error) {
    // Friendly message for the unique (org, name) violation.
    if ((error as any).code === '23505') {
      return NextResponse.json(
        { error: `A location named "${name}" already exists in this organization.` },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
