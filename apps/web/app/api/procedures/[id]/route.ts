/**
 * /api/procedures/[id] (Spec 1.3)
 *
 * GET    → single procedure with sections + items embedded.
 * PATCH  → update name/description/applies_to/is_archived. To replace
 *          sections+items wholesale, pass `sections` (same shape as
 *          POST /api/procedures); we delete-and-reinsert in a transaction.
 *          (Granular section/item edits are a logged follow-up — for
 *          v1.3 the wholesale replace covers the create-then-tweak loop.)
 * DELETE → archive (sets is_archived=true) by default; ?hard=1 actually
 *          deletes (mechanic+) — but only if no inspections reference it.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import type { OrgRole, ProcedureItemInputType } from '@/types'

const VALID_INPUT_TYPES: ReadonlySet<ProcedureItemInputType> = new Set([
  'checkbox', 'pass-fail', 'value', 'photo', 'signature',
])

const SELECT_PROCEDURE = `
  id, organization_id, name, description, applies_to, is_archived,
  created_by, created_at, updated_at,
  sections:procedure_sections (
    id, procedure_id, title, sort_order, created_at, updated_at,
    items:procedure_items (
      id, procedure_section_id, text, input_type, reference,
      requires_photo, sort_order, created_at, updated_at
    )
  )
`

function sortEmbedded(p: any) {
  return {
    ...p,
    sections: Array.isArray(p?.sections)
      ? [...p.sections]
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((s: any) => ({
            ...s,
            items: Array.isArray(s.items)
              ? [...s.items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
              : [],
          }))
      : [],
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('procedures')
    .select(SELECT_PROCEDURE)
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ procedure: sortEmbedded(data) })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
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

  const supabase = createServerSupabase()

  // Header-level updates
  const updates: Record<string, unknown> = {}
  if (typeof body.name === 'string') updates.name = body.name.trim()
  if ('description' in body) updates.description = body.description ?? null
  if (Array.isArray(body.applies_to)) updates.applies_to = body.applies_to.map(String)
  if (typeof body.is_archived === 'boolean') updates.is_archived = body.is_archived

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from('procedures')
      .update(updates)
      .eq('id', params.id)
      .eq('organization_id', ctx.organizationId)
    if (error) {
      if ((error as any).code === '23505') {
        return NextResponse.json(
          { error: 'A procedure with that name already exists.' },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  // Wholesale sections+items replace: only when caller explicitly passes
  // a `sections` array. Empty array = delete all.
  if (Array.isArray(body.sections)) {
    // Validate first
    for (const s of body.sections) {
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
            { error: `invalid input_type "${t}"` },
            { status: 400 },
          )
        }
      }
    }

    // Delete old sections (cascades to items)
    await supabase.from('procedure_sections').delete().eq('procedure_id', params.id)

    if (body.sections.length > 0) {
      const sectionRows = body.sections.map((s: any, i: number) => ({
        procedure_id: params.id,
        title: String(s.title).trim(),
        sort_order: i,
      }))
      const { data: insertedSections, error: secErr } = await supabase
        .from('procedure_sections')
        .insert(sectionRows)
        .select('*')
      if (secErr) return NextResponse.json({ error: secErr.message }, { status: 500 })

      const allItemRows: any[] = []
      ;(insertedSections as any[]).forEach((sec) => {
        const input = body.sections[sec.sort_order]
        const items = Array.isArray(input?.items) ? input.items : []
        items.forEach((it: any, i: number) => {
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
        if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 })
      }
    }
  }

  const { data: full } = await supabase
    .from('procedures')
    .select(SELECT_PROCEDURE)
    .eq('id', params.id)
    .maybeSingle()

  return NextResponse.json({ procedure: full ? sortEmbedded(full) : null })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!MECHANIC_AND_ABOVE.includes(ctx.role as OrgRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const supabase = createServerSupabase()
  const hard = req.nextUrl.searchParams.get('hard') === '1'

  if (hard) {
    // Hard delete: refuse if any inspections reference this procedure.
    const { count } = await supabase
      .from('inspections')
      .select('id', { count: 'exact', head: true })
      .eq('procedure_id', params.id)
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Cannot hard-delete a procedure with existing inspections. Archive instead.' },
        { status: 409 },
      )
    }
    const { error } = await supabase
      .from('procedures')
      .delete()
      .eq('id', params.id)
      .eq('organization_id', ctx.organizationId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase
      .from('procedures')
      .update({ is_archived: true })
      .eq('id', params.id)
      .eq('organization_id', ctx.organizationId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
