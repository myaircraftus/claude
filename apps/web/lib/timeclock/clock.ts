/**
 * Time clock server helpers (Spec 2.3).
 *
 * `clockIn()`  — refuses if the technician already has an open entry
 * `clockOut()` — closes a specific entry; refuses if already closed
 * `getOpenEntryForUser()` — returns the user's currently-open entry, if any
 * `aggregateWorkOrderHours()` — sums time_entries + work_order_lines.hours
 *   for a single WO, with cost rollup. Used by the WO panel and any
 *   future invoice/billing path.
 *
 * The DB has a partial UNIQUE index on (technician_id) WHERE end_time IS NULL
 * as the safety net; clockIn() checks first to give a friendly error.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TimeEntry, TimeEntryWorkType } from '@/types'

export interface ClockInInput {
  work_order_id: string
  work_order_line_id?: string | null
  hourly_rate: number
  work_type?: TimeEntryWorkType
  is_overtime?: boolean
  notes?: string | null
}

export interface ClockResult {
  ok: boolean
  entry: TimeEntry | null
  error?: string
}

export async function getOpenEntryForUser(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
): Promise<TimeEntry | null> {
  const { data } = await supabase
    .from('time_entries')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('technician_id', userId)
    .is('end_time', null)
    .order('start_time', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data ?? null) as TimeEntry | null
}

export async function clockIn(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
  input: ClockInInput,
): Promise<ClockResult> {
  if (!input.work_order_id) return { ok: false, entry: null, error: 'work_order_id required' }
  const rate = Number(input.hourly_rate)
  if (!Number.isFinite(rate) || rate < 0) {
    return { ok: false, entry: null, error: 'hourly_rate must be a non-negative number' }
  }

  // Refuse if there's already an open entry for this user. Better UX than
  // tripping the partial UNIQUE index error.
  const existing = await getOpenEntryForUser(supabase, organizationId, userId)
  if (existing) {
    return {
      ok: false,
      entry: existing,
      error: `You're already clocked in (entry started ${existing.start_time}). Clock out first.`,
    }
  }

  // Verify WO is in this org. Friendly 404 vs RLS denial.
  const { data: wo } = await supabase
    .from('work_orders')
    .select('id')
    .eq('id', input.work_order_id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!wo) return { ok: false, entry: null, error: 'Work order not found in this organization' }

  const { data, error } = await supabase
    .from('time_entries')
    .insert({
      organization_id: organizationId,
      work_order_id: input.work_order_id,
      work_order_line_id: input.work_order_line_id ?? null,
      technician_id: userId,
      start_time: new Date().toISOString(),
      hourly_rate: rate,
      work_type: input.work_type ?? 'labor',
      is_overtime: Boolean(input.is_overtime),
      notes: input.notes ?? null,
    })
    .select('*')
    .single()

  if (error) return { ok: false, entry: null, error: error.message }
  return { ok: true, entry: data as TimeEntry }
}

export async function clockOut(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
  entryId: string,
  options: { notes?: string | null } = {},
): Promise<ClockResult> {
  // Service-role context bypasses ownership. RLS prevents cross-org via the
  // organization_id WHERE clause regardless.
  const { data: existing } = await supabase
    .from('time_entries')
    .select('id, technician_id, end_time')
    .eq('id', entryId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!existing) return { ok: false, entry: null, error: 'Entry not found' }
  const row = existing as { id: string; technician_id: string; end_time: string | null }
  if (row.end_time) {
    return { ok: false, entry: null, error: 'Entry already closed' }
  }
  if (row.technician_id !== userId) {
    // Owners/admins can close other people's entries via PATCH directly.
    // The /stop endpoint is for the technician themselves.
    return { ok: false, entry: null, error: 'You can only stop your own entry. Owners + admins can close other entries via PATCH.' }
  }

  const updates: Record<string, unknown> = { end_time: new Date().toISOString() }
  if (options.notes !== undefined) updates.notes = options.notes

  const { data, error } = await supabase
    .from('time_entries')
    .update(updates)
    .eq('id', entryId)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error) return { ok: false, entry: null, error: error.message }
  return { ok: true, entry: data as TimeEntry }
}

/**
 * Compute aggregate labor hours + cost for a WO.
 *
 * Sums:
 *   - Closed time_entries: (end_time - start_time) * hourly_rate
 *   - Open time_entries:   (now - start_time) * hourly_rate (live running)
 *   - work_order_lines where line_type='labor': hours * rate (manual)
 *
 * Returns the raw breakdown so the caller can render whatever subset
 * they want.
 */
export interface WoLaborAggregate {
  closed_hours: number
  closed_cost: number
  open_entries: number
  open_running_hours: number
  open_running_cost: number
  manual_lines_hours: number
  manual_lines_cost: number
  total_hours: number
  total_cost: number
}

export async function aggregateWorkOrderHours(
  supabase: SupabaseClient,
  organizationId: string,
  workOrderId: string,
  options: { now?: Date } = {},
): Promise<WoLaborAggregate> {
  const now = options.now ?? new Date()

  const [{ data: entries }, { data: lines }] = await Promise.all([
    supabase
      .from('time_entries')
      .select('start_time, end_time, hourly_rate')
      .eq('organization_id', organizationId)
      .eq('work_order_id', workOrderId),
    supabase
      .from('work_order_lines')
      .select('hours, rate, line_type')
      .eq('organization_id', organizationId)
      .eq('work_order_id', workOrderId)
      .eq('line_type', 'labor'),
  ])

  let closed_hours = 0
  let closed_cost = 0
  let open_entries = 0
  let open_running_hours = 0
  let open_running_cost = 0

  for (const e of (entries ?? []) as Array<{ start_time: string; end_time: string | null; hourly_rate: number }>) {
    const startMs = new Date(e.start_time).getTime()
    if (!Number.isFinite(startMs)) continue
    const rate = Number(e.hourly_rate) || 0
    if (e.end_time) {
      const endMs = new Date(e.end_time).getTime()
      if (!Number.isFinite(endMs)) continue
      const hours = Math.max(0, (endMs - startMs) / 3_600_000)
      closed_hours += hours
      closed_cost  += hours * rate
    } else {
      open_entries += 1
      const hours = Math.max(0, (now.getTime() - startMs) / 3_600_000)
      open_running_hours += hours
      open_running_cost  += hours * rate
    }
  }

  let manual_lines_hours = 0
  let manual_lines_cost = 0
  for (const l of (lines ?? []) as Array<{ hours: number | null; rate: number | null }>) {
    const h = Number(l.hours) || 0
    const r = Number(l.rate)  || 0
    manual_lines_hours += h
    manual_lines_cost  += h * r
  }

  return {
    closed_hours,
    closed_cost,
    open_entries,
    open_running_hours,
    open_running_cost,
    manual_lines_hours,
    manual_lines_cost,
    total_hours: closed_hours + open_running_hours + manual_lines_hours,
    total_cost:  closed_cost  + open_running_cost  + manual_lines_cost,
  }
}
