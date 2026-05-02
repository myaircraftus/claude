/**
 * /api/procedures (Spec 1.3)
 *
 * GET  → list every procedure in the active org with sections + items
 *        embedded (single round-trip).
 * POST → create a procedure + initial sections + items in one call.
 *        Body: {
 *          name, description?, applies_to?,
 *          sections: Array<{
 *            title,
 *            items: Array<{ text, input_type, reference?, requires_photo? }>
 *          }>
 *        }
 *
 * Mechanic+ writes (matches RLS).
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import type { OrgRole, ProcedureItemInputType } from '@/types'

const VALID_INPUT_TYPES: ReadonlySet<ProcedureItemInputType> = new Set([
  'checkbox', 'pass-fail', 'value', 'photo', 'signature',
])

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('procedures')
    .select(`
      id, organization_id, name, description, applies_to, is_archived,
      created_by, created_at, updated_at,
      sections:procedure_sections (
        id, procedure_id, title, sort_order, created_at, updated_at,
        items:procedure_items (
          id, procedure_section_id, text, input_type, reference,
          requires_photo, sort_order, created_at, updated_at
        )
      )
    `)
    .eq('organization_id', ctx.organizationId)
    .eq('is_archived', false)
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sort sections + nested items by sort_order — Supabase doesn't enforce
  // it through the embed.
  const procedures = (data ?? []).map((p: any) => ({
    ...p,
    sections: Array.isArray(p.sections)
      ? [...p.sections]
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((s: any) => ({
            ...s,
            items: Array.isArray(s.items)
              ? [...s.items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
              : [],
          }))
      : [],
  }))

  return NextResponse.json({ procedures })
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

  const sections = Array.isArray(body?.sections) ? body.sections : []
  if (sections.length === 0) {
    return NextResponse.json({ error: 'at least one section required' }, { status: 400 })
  }

  // Validate sections + items shape up-front so we can fail fast before
  // partial inserts.
  for (const s of sections) {
    if (!s?.title || typeof s.title !== 'string') {
      return NextResponse.json({ error: 'each section needs a title' }, { status: 400 })
    }
    const items = Array.isArray(s.items) ? s.items : []
    for (const it of items) {
      if (!it?.text || typeof it.text !== 'string') {
        return NextResponse.json({ error: 'each item needs text' }, { status: 400 })
      }
      const t = it.input_type ?? 'checkbox'
      if (!VALID_INPUT_TYPES.has(t)) {
        return NextResponse.json(
          { error: `invalid input_type "${t}"; must be one of ${[...VALID_INPUT_TYPES].join(', ')}` },
          { status: 400 },
        )
      }
    }
  }

  const supabase = createServerSupabase()

  // 1. Insert procedure
  const { data: proc, error: procErr } = await supabase
    .from('procedures')
    .insert({
      organization_id: ctx.organizationId,
      name,
      description: body.description ?? null,
      applies_to: Array.isArray(body.applies_to) ? body.applies_to.map(String) : [],
      created_by: ctx.user.id,
    })
    .select('*')
    .single()

  if (procErr) {
    if ((procErr as any).code === '23505') {
      return NextResponse.json(
        { error: 'A procedure with that name already exists in this organization.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: procErr.message }, { status: 500 })
  }
  const procId = (proc as { id: string }).id

  // 2. Insert sections (in order)
  const sectionRows = sections.map((s: any, i: number) => ({
    procedure_id: procId,
    title: String(s.title).trim(),
    sort_order: i,
  }))
  const { data: insertedSections, error: secErr } = await supabase
    .from('procedure_sections')
    .insert(sectionRows)
    .select('*')

  if (secErr) {
    await supabase.from('procedures').delete().eq('id', procId)
    return NextResponse.json({ error: secErr.message }, { status: 500 })
  }

  // 3. Insert items per section. Match by sort_order to the input.
  const allItemRows: any[] = []
  ;(insertedSections as any[]).forEach((sec) => {
    const inputSection = sections[sec.sort_order]
    const inputItems = Array.isArray(inputSection?.items) ? inputSection.items : []
    inputItems.forEach((it: any, i: number) => {
      allItemRows.push({
        procedure_section_id: sec.id,
        text: String(it.text).trim(),
        input_type: it.input_type ?? 'checkbox',
        reference: it.reference ?? null,
        requires_photo: Boolean(it.requires_photo),
        sort_order: i,
      })
    })
  })

  if (allItemRows.length > 0) {
    const { error: itemErr } = await supabase
      .from('procedure_items')
      .insert(allItemRows)
    if (itemErr) {
      // best-effort cleanup
      await supabase.from('procedures').delete().eq('id', procId)
      return NextResponse.json({ error: itemErr.message }, { status: 500 })
    }
  }

  // Re-read the full shape so the response is identical to what GET returns.
  const { data: full } = await supabase
    .from('procedures')
    .select(`
      id, organization_id, name, description, applies_to, is_archived,
      created_by, created_at, updated_at,
      sections:procedure_sections (
        id, procedure_id, title, sort_order, created_at, updated_at,
        items:procedure_items (
          id, procedure_section_id, text, input_type, reference,
          requires_photo, sort_order, created_at, updated_at
        )
      )
    `)
    .eq('id', procId)
    .maybeSingle()

  return NextResponse.json({ procedure: full ?? proc }, { status: 201 })
}
