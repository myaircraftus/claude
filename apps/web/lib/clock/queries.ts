/**
 * Daily clock-event helpers (Spec 2.5.3).
 *
 * The DB partial-UNIQUE on (employee_id) WHERE clock_out_at IS NULL is
 * the safety net for "one open ClockEvent per employee." Helpers below
 * check first to give a friendly error before tripping the constraint.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClockEvent, BreakInterval } from '@/types'

/** Spec helper: getCurrentClockState(empId) → ClockEvent | null. */
export async function getCurrentClockState(
  supabase: SupabaseClient,
  organizationId: string,
  employeeId: string,
): Promise<ClockEvent | null> {
  const { data, error } = await supabase
    .from('clock_events')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('employee_id', employeeId)
    .is('clock_out_at', null)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as ClockEvent | null
}

interface ClockInArgs {
  organizationId: string
  employeeId: string
  shiftId?: string | null
  notes?: string | null
  imageUrl?: string | null
}

/** Spec helper: clockInEmployee(empId, shiftId?). */
export async function clockInEmployee(
  supabase: SupabaseClient,
  args: ClockInArgs,
): Promise<{ ok: boolean; event: ClockEvent | null; error?: string }> {
  const open = await getCurrentClockState(supabase, args.organizationId, args.employeeId)
  if (open) {
    return { ok: false, event: open, error: `Already clocked in (started ${open.clock_in_at}).` }
  }

  const { data, error } = await supabase
    .from('clock_events')
    .insert({
      organization_id: args.organizationId,
      employee_id: args.employeeId,
      status: 'clocked-in',
      clock_in_at: new Date().toISOString(),
      shift_id: args.shiftId ?? null,
      notes: args.notes ?? null,
      image_url: args.imageUrl ?? null,
    })
    .select('*')
    .single()
  if (error) return { ok: false, event: null, error: error.message }
  return { ok: true, event: data as ClockEvent }
}

/** Spec helper: startBreak(eventId). Appends an open BreakInterval. */
export async function startBreak(
  supabase: SupabaseClient,
  eventId: string,
  reason?: string | null,
): Promise<{ ok: boolean; event: ClockEvent | null; error?: string }> {
  const { data: existing, error: readErr } = await supabase
    .from('clock_events')
    .select('*')
    .eq('id', eventId)
    .maybeSingle()
  if (readErr) return { ok: false, event: null, error: readErr.message }
  if (!existing) return { ok: false, event: null, error: 'Clock event not found' }

  const event = existing as ClockEvent
  if (event.clock_out_at) return { ok: false, event, error: 'Already clocked out' }
  if (event.status === 'on-break') return { ok: false, event, error: 'Already on break' }

  const breaks: BreakInterval[] = Array.isArray(event.breaks) ? [...event.breaks] : []
  breaks.push({ start: new Date().toISOString(), reason: reason?.trim() || null })

  const { data, error } = await supabase
    .from('clock_events')
    .update({ status: 'on-break', breaks })
    .eq('id', eventId)
    .eq('status', 'clocked-in')
    .select('*')
    .maybeSingle()
  if (error) return { ok: false, event: null, error: error.message }
  if (!data) return { ok: false, event: null, error: 'State changed — try again' }
  return { ok: true, event: data as ClockEvent }
}

/** Spec helper: endBreak(eventId). Closes the most recent open break. */
export async function endBreak(
  supabase: SupabaseClient,
  eventId: string,
): Promise<{ ok: boolean; event: ClockEvent | null; error?: string }> {
  const { data: existing } = await supabase
    .from('clock_events')
    .select('*')
    .eq('id', eventId)
    .maybeSingle()
  if (!existing) return { ok: false, event: null, error: 'Not found' }

  const event = existing as ClockEvent
  if (event.status !== 'on-break') return { ok: false, event, error: 'Not on break' }

  const breaks = Array.isArray(event.breaks) ? [...event.breaks] : []
  // Close the LAST open break.
  for (let i = breaks.length - 1; i >= 0; i--) {
    if (!breaks[i].end) {
      breaks[i] = { ...breaks[i], end: new Date().toISOString() }
      break
    }
  }

  const { data, error } = await supabase
    .from('clock_events')
    .update({ status: 'clocked-in', breaks })
    .eq('id', eventId)
    .eq('status', 'on-break')
    .select('*')
    .maybeSingle()
  if (error) return { ok: false, event: null, error: error.message }
  if (!data) return { ok: false, event: null, error: 'State changed — try again' }
  return { ok: true, event: data as ClockEvent }
}

/**
 * Spec helper: clockOutEmployee(eventId).
 *
 * 1. Closes any open break.
 * 2. Sets clock_out_at + computes total_hours = (clock_out − clock_in − break_total).
 * 3. Auto-closes ANY running per-WO TimeEntry (sprint 2.3) for this
 *    employee — spec: "Clocking out auto-closes any running per-WO timer."
 */
export async function clockOutEmployee(
  supabase: SupabaseClient,
  eventId: string,
): Promise<{ ok: boolean; event: ClockEvent | null; closedTimeEntries: number; error?: string }> {
  const { data: existing } = await supabase
    .from('clock_events')
    .select('*')
    .eq('id', eventId)
    .maybeSingle()
  if (!existing) return { ok: false, event: null, closedTimeEntries: 0, error: 'Not found' }

  const event = existing as ClockEvent
  if (event.clock_out_at) return { ok: false, event, closedTimeEntries: 0, error: 'Already clocked out' }

  const now = new Date()
  const nowIso = now.toISOString()

  // Close any open break first.
  const breaks: BreakInterval[] = Array.isArray(event.breaks) ? [...event.breaks] : []
  for (let i = breaks.length - 1; i >= 0; i--) {
    if (!breaks[i].end) {
      breaks[i] = { ...breaks[i], end: nowIso }
      break
    }
  }

  // Compute total_hours = clocked-in time minus break time.
  const clockInMs = new Date(event.clock_in_at).getTime()
  const grossMs = now.getTime() - clockInMs
  let breakMs = 0
  for (const b of breaks) {
    if (!b.end) continue
    breakMs += new Date(b.end).getTime() - new Date(b.start).getTime()
  }
  const totalHours = Math.max(0, (grossMs - breakMs) / (1000 * 60 * 60))

  const { data: updated, error } = await supabase
    .from('clock_events')
    .update({
      status: 'clocked-out',
      clock_out_at: nowIso,
      breaks,
      total_hours: Number(totalHours.toFixed(2)),
    })
    .eq('id', eventId)
    .is('clock_out_at', null)
    .select('*')
    .maybeSingle()
  if (error) return { ok: false, event: null, closedTimeEntries: 0, error: error.message }
  if (!updated) return { ok: false, event: null, closedTimeEntries: 0, error: 'State changed — try again' }

  // Bridge to sprint 2.3: close any open per-WO time_entries for this
  // employee. Only entries linked to THIS clock_event_id (or this
  // employee's open ones) get closed — we don't reach across to a
  // different daily session.
  const { data: openEntries } = await supabase
    .from('time_entries')
    .select('id')
    .eq('organization_id', event.organization_id)
    .eq('technician_id', event.employee_id)
    .is('end_time', null)

  let closed = 0
  if (openEntries && openEntries.length > 0) {
    const ids = (openEntries as Array<{ id: string }>).map((r) => r.id)
    const { error: bulkErr } = await supabase
      .from('time_entries')
      .update({ end_time: nowIso })
      .in('id', ids)
    if (!bulkErr) closed = ids.length
  }

  return { ok: true, event: updated as ClockEvent, closedTimeEntries: closed }
}
