/**
 * /api/meter-profiles (Spec 1.1)
 *
 * GET  → list every meter profile in the active org with its meter
 *        definitions inlined (one round-trip).
 * POST → create a new profile + initial meter definitions.
 *        Body: { name, description?, meters: Array<{ name, unit, decimal_places, sort_order? }> }
 *
 * Org-member read; mechanic+ write (mirrors locations CRUD pattern from 0a).
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import type { OrgRole, MeterUnit } from '@/types'

const VALID_UNITS: ReadonlySet<MeterUnit> = new Set([
  'hours', 'cycles', 'landings', 'minutes', 'starts',
])

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('meter_profiles')
    .select(`
      id, organization_id, name, description, is_template, created_at, updated_at,
      meters:meter_definitions ( id, meter_profile_id, name, unit, decimal_places, sort_order, created_at, updated_at )
    `)
    .eq('organization_id', ctx.organizationId)
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sort the meters child array by sort_order — Supabase can't enforce that
  // through the embed and we don't want a 2nd query.
  const profiles = (data ?? []).map((p: any) => ({
    ...p,
    meters: Array.isArray(p.meters)
      ? [...p.meters].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      : [],
  }))

  return NextResponse.json({ profiles })
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

  const meters = Array.isArray(body?.meters) ? body.meters : []
  if (meters.length === 0) {
    return NextResponse.json({ error: 'at least one meter required' }, { status: 400 })
  }
  for (const m of meters) {
    if (!m?.name || typeof m.name !== 'string') {
      return NextResponse.json({ error: 'each meter needs a name' }, { status: 400 })
    }
    if (!VALID_UNITS.has(m.unit)) {
      return NextResponse.json(
        { error: `meter ${m.name}: unit must be one of ${[...VALID_UNITS].join(', ')}` },
        { status: 400 },
      )
    }
  }

  const supabase = createServerSupabase()

  // Insert profile
  const { data: profile, error: profErr } = await supabase
    .from('meter_profiles')
    .insert({
      organization_id: ctx.organizationId,
      name,
      description: body.description ?? null,
      is_template: false,
    })
    .select('*')
    .single()

  if (profErr) {
    if ((profErr as any).code === '23505') {
      return NextResponse.json(
        { error: 'A meter profile with that name already exists in this organization.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: profErr.message }, { status: 500 })
  }

  const profileId = (profile as { id: string }).id
  const meterRows = meters.map((m: any, i: number) => ({
    meter_profile_id: profileId,
    name: String(m.name).trim(),
    unit: m.unit,
    decimal_places: Number.isFinite(m.decimal_places) ? Math.min(4, Math.max(0, Number(m.decimal_places))) : 1,
    sort_order: Number.isFinite(m.sort_order) ? Number(m.sort_order) : i,
  }))

  const { data: defs, error: defsErr } = await supabase
    .from('meter_definitions')
    .insert(meterRows)
    .select('*')

  if (defsErr) {
    // Best effort cleanup — rolling back the profile keeps the table tidy.
    await supabase.from('meter_profiles').delete().eq('id', profileId)
    return NextResponse.json({ error: defsErr.message }, { status: 500 })
  }

  return NextResponse.json({ profile: { ...profile, meters: defs ?? [] } }, { status: 201 })
}
