/**
 * POST /api/continued-items/[id]/resolve (Spec 1.4)
 *
 * Mark a continued item resolved. Sets status='completed' (or 'wont-fix' if
 * the body says so) and stamps the resolution metadata: resolved_at,
 * resolved_by, resolved_on_work_order.
 *
 * Body:
 *   {
 *     work_order_id?: string,    // the WO that closed the item
 *     status?: 'completed' | 'wont-fix' (default: 'completed')
 *     notes?: string,            // appended to existing notes
 *   }
 *
 * Spec 1.4 mentions a future hook: when a new WO closes, auto-resolve any
 * continued items that were "pulled into" that WO (TODO follow-up — needs
 * a WO-close hook on the legacy WO surface).
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import type { OrgRole, ContinuedItemStatus } from '@/types'

const RESOLVABLE_STATUSES: ReadonlySet<ContinuedItemStatus> = new Set(['completed', 'wont-fix'])

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!MECHANIC_AND_ABOVE.includes(ctx.role as OrgRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let body: any = {}
  try {
    body = await req.json().catch(() => ({}))
  } catch { /* body optional */ }

  const status: ContinuedItemStatus =
    body.status && RESOLVABLE_STATUSES.has(body.status) ? body.status : 'completed'

  const supabase = createServerSupabase()

  // Verify item exists in this org first.
  const { data: existing } = await supabase
    .from('continued_items')
    .select('id, notes')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // If a WO is supplied, sanity-check it belongs to this org.
  let woId: string | null = null
  if (typeof body.work_order_id === 'string' && body.work_order_id.trim()) {
    woId = body.work_order_id.trim()
    const { data: wo } = await supabase
      .from('work_orders')
      .select('id')
      .eq('id', woId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle()
    if (!wo) {
      return NextResponse.json(
        { error: 'work_order_id does not exist in this organization' },
        { status: 400 },
      )
    }
  }

  // Append the resolution note instead of replacing prior notes.
  const appendNote = typeof body.notes === 'string' && body.notes.trim()
    ? body.notes.trim()
    : null
  const mergedNotes = appendNote
    ? [
        (existing as { notes: string | null }).notes ?? '',
        `[${new Date().toISOString().slice(0, 10)} resolve] ${appendNote}`,
      ]
        .filter(Boolean)
        .join('\n\n')
    : (existing as { notes: string | null }).notes ?? null

  const { data, error } = await supabase
    .from('continued_items')
    .update({
      status,
      resolved_at: new Date().toISOString(),
      resolved_by: ctx.user.id,
      resolved_on_work_order: woId,
      notes: mergedNotes,
    })
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, item: data })
}
