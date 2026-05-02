/**
 * POST /api/compliance-items/[id]/complete (Spec 1.2)
 *
 * Mark a compliance item complete. Sets last_completed_* and re-runs the
 * recompute → next_due_* updates → status flips back to 'current' (or
 * stays 'due-soon'/'overdue' if the new last_completed values still don't
 * cover the next interval, e.g. backdated completion).
 *
 * Body:
 *   {
 *     completed_date?: ISO date (default: today),
 *     completed_hours?: number,
 *     completed_cycles?: number,
 *     work_order_id?: string,    // adds to linked_work_orders
 *     notes?: string,
 *   }
 *
 * Permission: mechanic+ (matches RLS write policy).
 *
 * Mark-complete is also exposed as the `markComplianceComplete` AI tool
 * (lib/ai/tool-registry.ts) — once that tool's handler is wired (Phase 1.x
 * follow-up), the SuggestedAction button on Sprint 0c compliance-due
 * ActionCards will trigger this same flow.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { recomputeCompliance } from '@/lib/compliance/recompute'
import { getCurrentMeterReadings } from '@/lib/meters/current'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import type { OrgRole } from '@/types'

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

  const supabase = createServerSupabase()

  // Load the item so we know its aircraft + current linked WOs.
  const { data: existing, error: fetchErr } = await supabase
    .from('compliance_items')
    .select('id, aircraft_id, linked_work_orders')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const aircraftId = (existing as { aircraft_id: string }).aircraft_id

  // Default completed_hours / cycles to the aircraft's current meter
  // readings if the caller didn't specify. Saves a step in the UI.
  let completedHours: number | null = numericOrNull(body.completed_hours)
  let completedCycles: number | null = numericOrNull(body.completed_cycles)
  if (completedHours == null || completedCycles == null) {
    const meters = await getCurrentMeterReadings(supabase, aircraftId)
    if (completedHours == null) {
      const hobbs = meters.find((m) => /hobbs|tach/i.test(m.definition.name))
      if (hobbs?.current) completedHours = Number(hobbs.current.value)
    }
    if (completedCycles == null) {
      const cycles = meters.find((m) => /cycles/i.test(m.definition.name))
      if (cycles?.current) completedCycles = Number(cycles.current.value)
    }
  }

  // linked_work_orders: prepend the new WO id, dedupe.
  const woId = typeof body.work_order_id === 'string' ? body.work_order_id.trim() : ''
  const existingLinked = (existing as { linked_work_orders: string[] }).linked_work_orders ?? []
  const linked = woId
    ? [woId, ...existingLinked.filter((id) => id !== woId)]
    : existingLinked

  const completedDate =
    typeof body.completed_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.completed_date)
      ? body.completed_date
      : new Date().toISOString().slice(0, 10)

  const updates: Record<string, unknown> = {
    last_completed_date: completedDate,
    last_completed_hours: completedHours,
    last_completed_cycles: completedCycles,
    linked_work_orders: linked,
    // Reset to current here; the recompute below may flip it again.
    status: 'current',
  }
  if (typeof body.notes === 'string') updates.notes = body.notes

  const { error: updErr } = await supabase
    .from('compliance_items')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  // Recompute the aircraft's items — this item's next_due_* gets refreshed
  // and any other items that share recompute state get reflected too.
  const recomputed = await recomputeCompliance(supabase, aircraftId, { userId: ctx.user.id })

  // Re-read this specific item with the fresh values.
  const { data: refreshed } = await supabase
    .from('compliance_items')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  return NextResponse.json({
    ok: true,
    item: refreshed,
    recompute: recomputed,
  })
}

function numericOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
