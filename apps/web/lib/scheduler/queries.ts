/**
 * Scheduler query helpers (Spec 2.5.1).
 *
 * Server-side helpers used by:
 *   - /api/shifts routes (list / read)
 *   - /api/me/active-shift  (sidebar / Dashboard widget)
 *   - WO assignee picker cross-wire (when the picker UI exists — see
 *     §8 follow-up; the helper ships now so the consumer is unblocked)
 *
 * All helpers respect organization_id RLS by relying on the caller
 * passing a tenant-scoped Supabase client (createServerSupabase()).
 * Use createServiceSupabase() only for cross-org / system jobs.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Shift, ShiftCover } from '@/types'

export interface ShiftsForTechRange {
  /** Inclusive ISO start. */
  fromIso: string
  /** Exclusive ISO end. */
  toIso: string
}

/**
 * Spec helper: getShiftsForTechnician(techId, dateRange) → Shift[].
 *
 * Returns shifts where the tech is the assignee AND the shift's
 * [start_time, end_time) interval overlaps the requested range.
 * Ordered by start_time ascending so the consumer can render a
 * straight calendar/list without re-sorting.
 */
export async function getShiftsForTechnician(
  supabase: SupabaseClient,
  technicianId: string,
  range: ShiftsForTechRange,
): Promise<Shift[]> {
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('technician_id', technicianId)
    // Overlap test: shift.start < range.to AND shift.end > range.from
    .lt('start_time', range.toIso)
    .gt('end_time', range.fromIso)
    .order('start_time', { ascending: true })

  if (error) throw error
  return (data ?? []) as Shift[]
}

/**
 * Spec helper: getActiveTechniciansAt(timestamp) → string[] (user ids).
 *
 * Returns the tech ids whose currently-scheduled shift covers `timestamp`
 * AND whose status is not 'missed'/'swapped' (those don't count as
 * present even if the time window matches). Used by the Work Order
 * assignee picker to badge techs as "on shift now" / "off shift" /
 * "scheduled later today".
 */
export async function getActiveTechniciansAt(
  supabase: SupabaseClient,
  organizationId: string,
  timestamp: string = new Date().toISOString(),
): Promise<string[]> {
  const { data, error } = await supabase
    .from('shifts')
    .select('technician_id')
    .eq('organization_id', organizationId)
    .lte('start_time', timestamp)
    .gt('end_time', timestamp)
    // 'in-progress' / 'scheduled' / 'completed' all count as "the tech
    // was supposed to be here." Only 'missed' and 'swapped' get filtered.
    .not('status', 'in', '("missed","swapped")')

  if (error) throw error
  // De-dup (a tech could in theory have overlapping shifts; we still
  // only want one entry per tech).
  return Array.from(
    new Set(((data ?? []) as Array<{ technician_id: string }>).map((r) => r.technician_id)),
  )
}

/**
 * Returns a richer "shift status snapshot" for a list of techs at a
 * given moment. Used by the assignee picker once that UI lands — for
 * each tech, says: on-shift, off-shift, or scheduled-later-today.
 *
 * Pulls one query covering "today" so the cost is one round-trip
 * regardless of how many techs the caller has in the picker.
 */
export type TechShiftStatus =
  | { state: 'on-shift'; shift: Shift }
  | { state: 'scheduled-later'; shift: Shift }
  | { state: 'off-shift' }

export async function getTechShiftStatusMap(
  supabase: SupabaseClient,
  organizationId: string,
  technicianIds: string[],
  at: Date = new Date(),
): Promise<Record<string, TechShiftStatus>> {
  if (technicianIds.length === 0) return {}

  // Window: today's local-day boundaries. Server-side we don't know the
  // org's tz; use UTC day. The picker uses the result for human-readable
  // chips ("on shift", "scheduled 4pm-8pm"), so a few-hour tz drift is
  // tolerable — exact times come from the shift row itself.
  const dayStart = new Date(at)
  dayStart.setUTCHours(0, 0, 0, 0)
  const dayEnd = new Date(at)
  dayEnd.setUTCHours(23, 59, 59, 999)

  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('organization_id', organizationId)
    .in('technician_id', technicianIds)
    .lt('start_time', dayEnd.toISOString())
    .gt('end_time', dayStart.toISOString())
    .not('status', 'in', '("missed","swapped")')
    .order('start_time', { ascending: true })

  if (error) throw error
  const shifts = (data ?? []) as Shift[]
  const nowIso = at.toISOString()

  const out: Record<string, TechShiftStatus> = {}
  for (const tech of technicianIds) {
    const techShifts = shifts.filter((s) => s.technician_id === tech)
    if (techShifts.length === 0) {
      out[tech] = { state: 'off-shift' }
      continue
    }
    const onShift = techShifts.find((s) => s.start_time <= nowIso && s.end_time > nowIso)
    if (onShift) {
      out[tech] = { state: 'on-shift', shift: onShift }
      continue
    }
    const upcoming = techShifts.find((s) => s.start_time > nowIso)
    if (upcoming) {
      out[tech] = { state: 'scheduled-later', shift: upcoming }
      continue
    }
    out[tech] = { state: 'off-shift' }
  }
  return out
}

/**
 * Spec helper: requestShiftCover(shiftId, reason) — creates a cover
 * request for an existing shift. The DB partial-UNIQUE on
 * (original_shift_id) WHERE status IN ('open','claimed') prevents
 * duplicate live requests for the same shift; a 23505 unique-violation
 * surfaces here as a conflict so the caller can return 409.
 */
export async function requestShiftCover(
  supabase: SupabaseClient,
  args: {
    organizationId: string
    shiftId: string
    requestedBy: string
    reason?: string | null
  },
): Promise<ShiftCover> {
  const { data, error } = await supabase
    .from('shift_covers')
    .insert({
      organization_id: args.organizationId,
      original_shift_id: args.shiftId,
      requested_by: args.requestedBy,
      reason: args.reason ?? null,
      status: 'open',
    })
    .select('*')
    .single()

  if (error) throw error
  return data as ShiftCover
}

/**
 * Spec helper: claimShiftCover(coverId) — a teammate volunteers to take
 * the shift. Sets covering_tech_id + status='claimed'. Manager still
 * has to approve via PATCH /api/shift-covers/[id] with status='approved'
 * — at which point we also flip the original shift's assignee +
 * status='swapped'.
 */
export async function claimShiftCover(
  supabase: SupabaseClient,
  args: { coverId: string; coveringTechId: string },
): Promise<ShiftCover> {
  // Only an 'open' cover can be claimed. Use eq() in the WHERE so a
  // race where two techs click claim simultaneously results in one
  // success + one zero-rows-affected (handled by the caller as 409).
  const { data, error } = await supabase
    .from('shift_covers')
    .update({
      covering_tech_id: args.coveringTechId,
      status: 'claimed',
    })
    .eq('id', args.coverId)
    .eq('status', 'open')
    .select('*')
    .maybeSingle()

  if (error) throw error
  if (!data) {
    throw new Error('Cover request is no longer available to claim')
  }
  return data as ShiftCover
}
