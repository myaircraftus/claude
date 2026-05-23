/**
 * workforce.shift-summary-drafter
 *
 * Daily 17:00 UTC: per mechanic, pulls the WOs they touched in the
 * trailing 24h and assembles a 3-bullet shift summary:
 *
 *   • Closed today: WO-1234 (annual on N12AB), WO-1240 (oil change)
 *   • Open / blocked: WO-1241 awaiting parts (P/N 12345-001)
 *   • Tomorrow: 1 scheduled, 0 on hold
 *
 * No LLM. We aggregate from work_orders + work_order_events. The
 * summary is emitted as a `shift_summary` recommendation that lands
 * in the mechanic's inbox via the in-app launcher — they tap to
 * acknowledge, which flips work_order_events.acknowledged_at.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface ShiftSummary {
  user_id: string
  closed_today: Array<{ wo_id: string; wo_number: string | null; aircraft_tail: string | null }>
  open_blocked: Array<{ wo_id: string; wo_number: string | null; status: string | null }>
  scheduled_tomorrow: number
  hours_logged_today: number
}

export interface ShiftSummaryReport {
  generated_at: string
  mechanic_count: number
  summaries: ShiftSummary[]
}

const DAY_MS = 24 * 60 * 60 * 1000

export async function draftShiftSummaries(args: {
  supabase: SupabaseClient
  /** Override "today" for replay / debug. */
  asOf?: Date
}): Promise<{ ok: boolean; output?: ShiftSummaryReport; runId?: string; error?: string }> {
  const asOf = args.asOf ?? new Date()
  return runAgent<ShiftSummaryReport>(
    'workforce.shift-summary-drafter',
    { supabase: args.supabase, input: { as_of: asOf.toISOString() } },
    async () => {
      const since = new Date(asOf.getTime() - DAY_MS).toISOString()
      const tomorrowEnd = new Date(asOf.getTime() + DAY_MS).toISOString()
      // Pull WO updates from the last 24h with the assigned mechanic.
      const { data: wos } = await args.supabase
        .from('work_orders')
        .select(
          'id, wo_number, assigned_to, status, closed_at, updated_at, scheduled_for, aircraft_id, total_hours_logged',
        )
        .gte('updated_at', since)
        .not('assigned_to', 'is', null)
        .limit(2000)
      type Wo = {
        id: string
        wo_number: string | null
        assigned_to: string
        status: string | null
        closed_at: string | null
        updated_at: string
        scheduled_for: string | null
        aircraft_id: string | null
        total_hours_logged: number | null
      }
      const woRows = (wos ?? []) as Wo[]
      const aircraftIds = Array.from(
        new Set(woRows.map((w) => w.aircraft_id).filter((x): x is string => Boolean(x))),
      )
      const tailMap = new Map<string, string | null>()
      if (aircraftIds.length > 0) {
        const { data: acs } = await args.supabase
          .from('aircraft')
          .select('id, tail_number')
          .in('id', aircraftIds)
        for (const a of (acs ?? []) as Array<{ id: string; tail_number: string | null }>) {
          tailMap.set(a.id, a.tail_number)
        }
      }
      const byMechanic = new Map<string, ShiftSummary>()
      const get = (uid: string): ShiftSummary => {
        const existing = byMechanic.get(uid)
        if (existing) return existing
        const fresh: ShiftSummary = {
          user_id: uid,
          closed_today: [],
          open_blocked: [],
          scheduled_tomorrow: 0,
          hours_logged_today: 0,
        }
        byMechanic.set(uid, fresh)
        return fresh
      }
      for (const w of woRows) {
        const s = get(w.assigned_to)
        const closedToday = w.closed_at && w.closed_at >= since
        if (closedToday) {
          s.closed_today.push({
            wo_id: w.id,
            wo_number: w.wo_number,
            aircraft_tail: w.aircraft_id ? tailMap.get(w.aircraft_id) ?? null : null,
          })
        } else if (w.status === 'blocked' || w.status === 'awaiting_parts' || w.status === 'open') {
          s.open_blocked.push({ wo_id: w.id, wo_number: w.wo_number, status: w.status })
        }
        if (
          w.scheduled_for &&
          w.scheduled_for >= asOf.toISOString() &&
          w.scheduled_for < tomorrowEnd
        ) {
          s.scheduled_tomorrow += 1
        }
        s.hours_logged_today += w.total_hours_logged ?? 0
      }
      const summaries = Array.from(byMechanic.values())
        .filter(
          (s) =>
            s.closed_today.length > 0 ||
            s.open_blocked.length > 0 ||
            s.scheduled_tomorrow > 0 ||
            s.hours_logged_today > 0,
        )
        .sort((a, b) => b.closed_today.length - a.closed_today.length)
      return {
        output: {
          generated_at: asOf.toISOString(),
          mechanic_count: summaries.length,
          summaries,
        },
        needsHuman: summaries.length > 0,
        recommendation:
          summaries.length > 0
            ? { kind: 'shift_summaries', count: summaries.length, summaries }
            : null,
      }
    },
  )
}
