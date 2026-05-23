/**
 * workforce.clock-anomaly
 *
 * Daily 06:00 UTC: sweeps time_clock_entries from the last 7 days
 * and flags four classes of suspicious rows:
 *
 *   1. shift_too_long: clock-out − clock-in > 16h
 *   2. open_shift: clock-in > 14h ago with no clock-out
 *   3. overlapping_shifts: two entries for the same user with
 *      overlapping time windows
 *   4. zero_hour_shift: clock-out < clock-in (data integrity)
 *
 * Pure SQL — no LLM. Emits 'clock_anomaly_review' recommendation
 * listing the affected (user_id, entry_id, reason) tuples. The
 * mechanic / their manager corrects manually; the agent never
 * auto-edits the time clock.
 *
 * Safe to run with no time_clock_entries table — returns an empty
 * report.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

type AnomalyReason = 'shift_too_long' | 'open_shift' | 'overlapping_shifts' | 'zero_hour_shift'

export interface ClockAnomaly {
  entry_id: string
  user_id: string | null
  organization_id: string | null
  clock_in: string
  clock_out: string | null
  duration_minutes: number | null
  reason: AnomalyReason
  detail: string
}

export interface ClockAnomalyReport {
  scanned: number
  anomaly_count: number
  anomalies: ClockAnomaly[]
}

const MAX_SHIFT_MS = 16 * 60 * 60 * 1000
const STALE_OPEN_MS = 14 * 60 * 60 * 1000

export async function detectClockAnomalies(args: {
  supabase: SupabaseClient
}): Promise<{ ok: boolean; output?: ClockAnomalyReport; runId?: string; error?: string }> {
  return runAgent<ClockAnomalyReport>(
    'workforce.clock-anomaly',
    { supabase: args.supabase, input: { window_days: 7 } },
    async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await args.supabase
        .from('time_clock_entries')
        .select('id, user_id, organization_id, clock_in, clock_out')
        .gte('clock_in', since)
        .order('user_id')
        .order('clock_in')
        .limit(5000)
      if (error) {
        // Table doesn't exist or other read error — no-op silently.
        return {
          output: { scanned: 0, anomaly_count: 0, anomalies: [] },
          recommendation: { kind: 'clock_table_unavailable', reason: error.message.slice(0, 120) },
        }
      }
      type Row = {
        id: string
        user_id: string | null
        organization_id: string | null
        clock_in: string
        clock_out: string | null
      }
      const rows = (data ?? []) as Row[]
      const now = Date.now()
      const anomalies: ClockAnomaly[] = []
      const byUser = new Map<string, Row[]>()
      for (const r of rows) {
        if (!r.user_id) continue
        const list = byUser.get(r.user_id) ?? []
        list.push(r)
        byUser.set(r.user_id, list)
        const inMs = Date.parse(r.clock_in)
        if (!r.clock_out) {
          if (now - inMs > STALE_OPEN_MS) {
            anomalies.push({
              entry_id: r.id,
              user_id: r.user_id,
              organization_id: r.organization_id,
              clock_in: r.clock_in,
              clock_out: null,
              duration_minutes: Math.round((now - inMs) / 60000),
              reason: 'open_shift',
              detail: `${Math.round((now - inMs) / 3600000)}h since clock-in, no clock-out yet`,
            })
          }
          continue
        }
        const outMs = Date.parse(r.clock_out)
        const dur = outMs - inMs
        if (dur < 0) {
          anomalies.push({
            entry_id: r.id,
            user_id: r.user_id,
            organization_id: r.organization_id,
            clock_in: r.clock_in,
            clock_out: r.clock_out,
            duration_minutes: Math.round(dur / 60000),
            reason: 'zero_hour_shift',
            detail: `clock-out is BEFORE clock-in`,
          })
          continue
        }
        if (dur > MAX_SHIFT_MS) {
          anomalies.push({
            entry_id: r.id,
            user_id: r.user_id,
            organization_id: r.organization_id,
            clock_in: r.clock_in,
            clock_out: r.clock_out,
            duration_minutes: Math.round(dur / 60000),
            reason: 'shift_too_long',
            detail: `${(dur / 3600000).toFixed(1)}h shift exceeds 16h cap`,
          })
        }
      }
      // Per-user overlap detection
      for (const [uid, list] of byUser.entries()) {
        const closed = list
          .filter((r) => r.clock_out)
          .sort((a, b) => Date.parse(a.clock_in) - Date.parse(b.clock_in))
        for (let i = 1; i < closed.length; i++) {
          const prev = closed[i - 1]
          const cur = closed[i]
          if (!prev.clock_out) continue
          const prevOut = Date.parse(prev.clock_out)
          const curIn = Date.parse(cur.clock_in)
          if (curIn < prevOut) {
            anomalies.push({
              entry_id: cur.id,
              user_id: uid,
              organization_id: cur.organization_id,
              clock_in: cur.clock_in,
              clock_out: cur.clock_out,
              duration_minutes: null,
              reason: 'overlapping_shifts',
              detail: `overlaps with prior entry ${prev.id} ending at ${prev.clock_out}`,
            })
          }
        }
      }
      return {
        output: {
          scanned: rows.length,
          anomaly_count: anomalies.length,
          anomalies,
        },
        needsHuman: anomalies.length > 0,
        recommendation:
          anomalies.length > 0
            ? {
                kind: 'clock_anomaly_review',
                count: anomalies.length,
                anomalies: anomalies.slice(0, 100),
              }
            : null,
      }
    },
  )
}
