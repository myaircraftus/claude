/**
 * Compliance recompute (Spec 1.2).
 *
 * `recomputeCompliance(supabase, aircraftId)`:
 *   1. Loads the aircraft's current Hobbs / cycles (via lib/meters/current).
 *   2. Loads every compliance_items row for that aircraft.
 *   3. For each item, calls computeDue() and stores back next_due_* + status.
 *   4. For items whose status FLIPPED to 'overdue' or 'due-soon', emits a
 *      `compliance-due` AISignal (Sprint 0c) so the orchestrator can produce
 *      ActionCards and the notification system (Sprint 0d) can surface them.
 *
 * Idempotent: items whose computed status matches the stored value are
 * not written. Avoids spurious updated_at churn.
 *
 * Wired in:
 *   - POST /api/meter-readings (after the new reading is stored — Sprint 1.1
 *     cross-wire). One reading triggers a recompute for that aircraft only.
 *   - PATCH/POST on /api/compliance-items[/:id] (after the item itself
 *     changes — fresh interval / completion / etc.).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { computeDue, type AircraftCurrentValues } from './compute'
import { emitSignal } from '@/lib/ai/signals'
import { getCurrentMeterReadings } from '@/lib/meters/current'
import type { ComplianceItem } from '@/types'

export interface RecomputeResult {
  items_processed: number
  items_updated: number
  /** Items whose status flipped TO 'overdue' or 'due-soon'. */
  flipped_to_due: ComplianceItem[]
  errors: string[]
}

export async function recomputeCompliance(
  supabase: SupabaseClient,
  aircraftId: string,
  options: { userId?: string | null } = {},
): Promise<RecomputeResult> {
  const result: RecomputeResult = {
    items_processed: 0,
    items_updated: 0,
    flipped_to_due: [],
    errors: [],
  }

  // 1. Load the aircraft's current values. We approximate "current_hours" as
  //    the latest reading on a meter named "Hobbs" or "Tach" (Hobbs preferred,
  //    Tach as fallback). Cycles → meter named "Cycles". This is loose by
  //    design — operators name meters differently; the heuristic gives the
  //    right answer for ~90% of fleets and the lookup is quick to override
  //    when we add per-profile "primary meter" config in a follow-up sprint.
  const meters = await getCurrentMeterReadings(supabase, aircraftId)
  const currentHours = pickCurrentValue(meters, ['hobbs', 'tach'])
  const currentCycles = pickCurrentValue(meters, ['cycles'])
  const aircraft: AircraftCurrentValues = {
    current_hours: currentHours,
    current_cycles: currentCycles,
  }

  // 2. Load items for this aircraft.
  const { data: items, error: itemsErr } = await supabase
    .from('compliance_items')
    .select('*')
    .eq('aircraft_id', aircraftId)

  if (itemsErr) {
    result.errors.push(`fetch items: ${itemsErr.message}`)
    return result
  }
  if (!items || items.length === 0) return result

  let organizationId: string | null = null

  for (const raw of items as ComplianceItem[]) {
    if (!organizationId) organizationId = raw.organization_id
    result.items_processed += 1

    const computed = computeDue(raw, aircraft)
    const same =
      raw.next_due_date   === computed.next_due_date   &&
      raw.next_due_hours  === computed.next_due_hours  &&
      raw.next_due_cycles === computed.next_due_cycles &&
      raw.status          === computed.status

    if (same) continue

    const { error: updErr } = await supabase
      .from('compliance_items')
      .update({
        next_due_date:   computed.next_due_date,
        next_due_hours:  computed.next_due_hours,
        next_due_cycles: computed.next_due_cycles,
        status:          computed.status,
      })
      .eq('id', raw.id)

    if (updErr) {
      result.errors.push(`update ${raw.id}: ${updErr.message}`)
      continue
    }
    result.items_updated += 1

    // Status-flip detection: only signal when the item *just became* due/overdue.
    const wasActionable =
      raw.status === 'overdue' || raw.status === 'due-soon'
    const isActionable =
      computed.status === 'overdue' || computed.status === 'due-soon'

    if (!wasActionable && isActionable) {
      result.flipped_to_due.push({ ...raw, ...computed })
    }
  }

  // 3. Emit a single 'compliance-due' signal per flipped item. The
  //    orchestrator (Sprint 0c) routes these to ActionCards + the
  //    notification system fans out per-user × per-channel preferences.
  if (organizationId) {
    for (const flipped of result.flipped_to_due) {
      emitSignal(supabase, organizationId, options.userId ?? null, {
        type: 'compliance-due',
        payload: {
          compliance_item_id: flipped.id,
          aircraft_id: flipped.aircraft_id,
          title: flipped.title,
          status: flipped.status,
          next_due_date: flipped.next_due_date,
          next_due_hours: flipped.next_due_hours,
          requires_rii: flipped.requires_rii,
          source: flipped.source,
        },
        source: 'system',
      }).catch((e) =>
        result.errors.push(`emit signal for ${flipped.id}: ${e?.message ?? e}`),
      )
    }
  }

  return result
}

/**
 * Heuristic: from the bulk meter readings on an aircraft, pick the latest
 * value for the first meter whose name (case-insensitive) matches one of
 * the candidate keywords. Hobbs > Tach > anything else.
 */
function pickCurrentValue(
  meters: Array<{ definition: { name: string }; current: { value: number } | null }>,
  candidates: string[],
): number | null {
  for (const candidate of candidates) {
    const match = meters.find(
      (m) => m.definition.name.toLowerCase().includes(candidate),
    )
    if (match?.current) return Number(match.current.value)
  }
  return null
}
