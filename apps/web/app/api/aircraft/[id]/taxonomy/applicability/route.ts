import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { normalizeAtaCode, normalizeJascCode } from '@/lib/taxonomy/format'

const WRITE_ROLES = new Set(['owner', 'admin', 'mechanic'])

interface ApplicabilityInput {
  ata_code?: unknown
  jasc_code?: unknown
  applicable?: unknown
  visible_default?: unknown
  reason?: unknown
  manufacturer_label?: unknown
  notes?: unknown
}

function textOrNull(value: unknown) {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text.length > 0 ? text : null
}

async function verifyAircraft(supabase: any, aircraftId: string, organizationId: string) {
  const { data, error } = await supabase
    .from('aircraft')
    .select('id, organization_id')
    .eq('id', aircraftId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = createServerSupabase()
    const aircraft = await verifyAircraft(supabase, params.id, ctx.organizationId)
    if (!aircraft) return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })

    const { data, error } = await supabase
      .from('aircraft_taxonomy_applicability')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('aircraft_id', params.id)
      .order('ata_code', { ascending: true })
      .order('jasc_code', { ascending: true, nullsFirst: true })

    if (error) throw new Error(error.message)
    return NextResponse.json({ overrides: data ?? [] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load applicability overrides' },
      { status: 500 },
    )
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!WRITE_ROLES.has(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const inputs: ApplicabilityInput[] = Array.isArray(body?.overrides)
    ? body.overrides
    : [body]

  try {
    const supabase = createServerSupabase()
    const aircraft = await verifyAircraft(supabase, params.id, ctx.organizationId)
    if (!aircraft) return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })

    const saved = []
    for (const input of inputs) {
      const ataCode = normalizeAtaCode(input.ata_code)
      const jascCode = normalizeJascCode(input.jasc_code)
      if (!ataCode) {
        return NextResponse.json({ error: 'ata_code is required' }, { status: 400 })
      }

      const patch = {
        applicable: input.applicable === undefined ? true : Boolean(input.applicable),
        visible_default: input.visible_default === undefined ? true : Boolean(input.visible_default),
        reason: textOrNull(input.reason),
        manufacturer_label: textOrNull(input.manufacturer_label),
        notes: textOrNull(input.notes),
        updated_at: new Date().toISOString(),
      }

      let lookup = supabase
        .from('aircraft_taxonomy_applicability')
        .select('id')
        .eq('organization_id', ctx.organizationId)
        .eq('aircraft_id', params.id)
        .eq('ata_code', ataCode)

      lookup = jascCode ? lookup.eq('jasc_code', jascCode) : lookup.is('jasc_code', null)
      const { data: existing, error: lookupError } = await lookup.maybeSingle()
      if (lookupError) throw new Error(lookupError.message)

      if (existing) {
        const { data, error } = await supabase
          .from('aircraft_taxonomy_applicability')
          .update(patch)
          .eq('id', existing.id)
          .select('*')
          .single()
        if (error) throw new Error(error.message)
        saved.push(data)
      } else {
        const { data, error } = await supabase
          .from('aircraft_taxonomy_applicability')
          .insert({
            organization_id: ctx.organizationId,
            aircraft_id: params.id,
            ata_code: ataCode,
            jasc_code: jascCode,
            ...patch,
          })
          .select('*')
          .single()
        if (error) throw new Error(error.message)
        saved.push(data)
      }
    }

    return NextResponse.json({ overrides: saved })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save applicability override' },
      { status: 500 },
    )
  }
}
