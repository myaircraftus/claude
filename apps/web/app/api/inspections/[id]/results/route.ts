/**
 * /api/inspections/[id]/results (Spec 1.3)
 *
 * PUT  → upsert a single inspection result. Body:
 *        {
 *          procedure_item_id: string,
 *          value?: string | boolean | number | null,
 *          passed?: boolean | null,
 *          photo_urls?: string[],
 *          comments?: string | null,
 *        }
 *        Idempotent on (inspection_id, procedure_item_id) thanks to the
 *        unique index on inspection_results. Sets completed_by + completed_at
 *        on every save (the latest save is what counts).
 *
 * GET  → list every result row for this inspection.
 *
 * Caller is whoever can write the inspection (owner|admin|mechanic|pilot
 * via RLS). Inspection-level status changes happen via the parent PATCH
 * or the dedicated /complete endpoint.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()

  // Existence + org-scope check on the parent inspection
  const { data: insp } = await supabase
    .from('inspections')
    .select('id')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (!insp) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('inspection_results')
    .select('*')
    .eq('inspection_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ results: data ?? [] })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const procedureItemId = String(body?.procedure_item_id ?? '').trim()
  if (!procedureItemId) {
    return NextResponse.json({ error: 'procedure_item_id required' }, { status: 400 })
  }

  const supabase = createServerSupabase()

  // Verify the parent inspection is in our org. (RLS would block the upsert,
  // but a clean 404 is friendlier to the UI.) Also flip status from 'draft'
  // to 'in-progress' on the first answered item.
  const { data: insp } = await supabase
    .from('inspections')
    .select('id, status')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (!insp) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })

  const value = body.value
  const passed = typeof body.passed === 'boolean' ? body.passed : null
  const photoUrls = Array.isArray(body.photo_urls)
    ? body.photo_urls.map(String).slice(0, 20)
    : []
  const comments = typeof body.comments === 'string' ? body.comments : null

  const { data, error } = await supabase
    .from('inspection_results')
    .upsert(
      {
        inspection_id: params.id,
        procedure_item_id: procedureItemId,
        value: value ?? null,
        passed,
        photo_urls: photoUrls,
        comments,
        completed_by: ctx.user.id,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'inspection_id,procedure_item_id' },
    )
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-flip status from draft -> in-progress on first answer
  const status = (insp as { status: string }).status
  if (status === 'draft') {
    await supabase
      .from('inspections')
      .update({
        status: 'in-progress',
        start_date: new Date().toISOString(),
      })
      .eq('id', params.id)
  }

  return NextResponse.json({ result: data })
}
