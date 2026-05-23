/**
 * compliance.audit-event-watchdog
 *
 * Hourly check on the integrity of the audit_event chain. We look for
 * three failure modes:
 *
 *   1. gap: monotonically-increasing audit_event.sequence has a hole
 *      (e.g. 1003 → 1005 with nothing at 1004)
 *   2. stale: no audit_event row in the last 6 hours when the system
 *      has had OTHER activity (logbook entries, ask logs) in that
 *      window — suggests the audit emitter is silently broken
 *   3. backdated: an audit_event with created_at significantly before
 *      the previous row's created_at (suggests a malicious row insert
 *      with crafted timestamps)
 *
 * Pure SQL — emits 'audit_integrity_break' recommendations marked
 * CRITICAL when any fault is found. No auto-action.
 *
 * Tolerant of an absent audit_event table — returns empty report.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface AuditFinding {
  kind: 'gap' | 'stale' | 'backdated'
  detail: string
  span_from: string | null
  span_to: string | null
}

export interface AuditReport {
  scanned: number
  finding_count: number
  findings: AuditFinding[]
  last_event_at: string | null
}

const STALE_MS = 6 * 60 * 60 * 1000

export async function watchAuditChain(args: {
  supabase: SupabaseClient
}): Promise<{ ok: boolean; output?: AuditReport; runId?: string; error?: string }> {
  return runAgent<AuditReport>(
    'compliance.audit-event-watchdog',
    { supabase: args.supabase, input: { window_hours: 6 } },
    async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await args.supabase
        .from('audit_event')
        .select('id, sequence, kind, created_at')
        .gte('created_at', since)
        .order('sequence', { ascending: true })
        .limit(5000)
      if (error) {
        // Table likely doesn't exist yet — no-op cleanly.
        return {
          output: { scanned: 0, finding_count: 0, findings: [], last_event_at: null },
          recommendation: {
            kind: 'audit_table_unavailable',
            reason: error.message.slice(0, 120),
          },
        }
      }
      type Row = { id: string; sequence: number; kind: string; created_at: string }
      const rows = (data ?? []) as Row[]
      const findings: AuditFinding[] = []
      let lastEventAt: string | null = null

      // Gap + backdated detection
      for (let i = 1; i < rows.length; i++) {
        const prev = rows[i - 1]
        const cur = rows[i]
        if (cur.sequence - prev.sequence > 1) {
          findings.push({
            kind: 'gap',
            detail: `audit sequence jumps ${prev.sequence} → ${cur.sequence} (missing ${cur.sequence - prev.sequence - 1} row(s))`,
            span_from: prev.created_at,
            span_to: cur.created_at,
          })
        }
        if (Date.parse(cur.created_at) + 60_000 < Date.parse(prev.created_at)) {
          findings.push({
            kind: 'backdated',
            detail: `event sequence=${cur.sequence} created_at ${cur.created_at} is >60s BEFORE its predecessor (${prev.created_at})`,
            span_from: prev.created_at,
            span_to: cur.created_at,
          })
        }
      }
      if (rows.length > 0) lastEventAt = rows[rows.length - 1].created_at

      // Stale detection — only fire if other tables had recent rows
      if (
        lastEventAt &&
        Date.now() - Date.parse(lastEventAt) > STALE_MS
      ) {
        const sixHoursAgo = new Date(Date.now() - STALE_MS).toISOString()
        const [askRes, lbRes] = await Promise.all([
          args.supabase
            .from('ask_logs')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', sixHoursAgo),
          args.supabase
            .from('logbook_entries')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', sixHoursAgo),
        ])
        const otherActivity = (askRes.count ?? 0) + (lbRes.count ?? 0)
        if (otherActivity > 0) {
          findings.push({
            kind: 'stale',
            detail: `no audit_event in last ${(STALE_MS / 3600000).toFixed(0)}h despite ${otherActivity} other recent rows`,
            span_from: lastEventAt,
            span_to: new Date().toISOString(),
          })
        }
      }
      return {
        output: {
          scanned: rows.length,
          finding_count: findings.length,
          findings,
          last_event_at: lastEventAt,
        },
        needsHuman: findings.length > 0,
        recommendation:
          findings.length > 0
            ? {
                kind: 'audit_integrity_break',
                severity: 'critical',
                finding_count: findings.length,
                findings: findings.slice(0, 25),
              }
            : null,
      }
    },
  )
}
