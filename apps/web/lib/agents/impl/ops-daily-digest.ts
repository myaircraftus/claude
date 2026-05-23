/**
 * ops.daily-digest
 *
 * Daily 07:00 UTC: founder-facing morning brief. Aggregates every
 * recommendation that hit `needs_human` (and is still un-acknowledged)
 * across the last 24 hours, groups by category, and assembles a
 * top-line summary so the founder doesn't have to click through 12
 * categories on /admin/agents to find what's actually important.
 *
 *   "Yesterday's recommendations:
 *     safety: 1 (cross_tenant_chunks=1 — CRITICAL)
 *     ops: 3 (cron_missed=2, cost_anomaly=1)
 *     sales: 5 trial_conversion_outreach
 *     compliance: 1 dpa_anniversary_due
 *     data-quality: 8 tail_number_issues, 2 duplicate_documents"
 *
 * Pure SQL — no LLM. Severity is derived from the agent_id prefix
 * (safety.* / security.* / compliance.audit-event-watchdog → critical,
 * everything else → routine). The digest is emitted as a single
 * `daily_digest` recommendation that itself surfaces on /admin/agents
 * (and counts toward the topbar chip until acknowledged).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

interface RecGroup {
  agent_id: string
  count: number
  example_kind: string | null
  severity: 'critical' | 'routine'
}

export interface DigestReport {
  window_hours: number
  total_open_recommendations: number
  critical_count: number
  routine_count: number
  groups: RecGroup[]
  /** A human-readable 5-8 line summary so the founder can read it at a glance. */
  summary: string[]
}

const CRITICAL_PREFIXES = ['safety.', 'security.', 'compliance.audit-event-watchdog']

function isCritical(agentId: string): boolean {
  return CRITICAL_PREFIXES.some((p) => agentId.startsWith(p) || agentId === p)
}

export async function buildDailyDigest(args: {
  supabase: SupabaseClient
  asOf?: Date
}): Promise<{ ok: boolean; output?: DigestReport; runId?: string; error?: string }> {
  const asOf = args.asOf ?? new Date()
  return runAgent<DigestReport>(
    'ops.daily-digest',
    { supabase: args.supabase, input: { as_of: asOf.toISOString() } },
    async () => {
      const since = new Date(asOf.getTime() - 24 * 60 * 60 * 1000).toISOString()
      const { data } = await args.supabase
        .from('agent_runs')
        .select('agent_id, recommendation')
        .eq('status', 'needs_human')
        .is('acknowledged_at', null)
        .gte('created_at', since)
        .limit(2000)
      type Row = {
        agent_id: string
        recommendation: { kind?: string } | null
      }
      const rows = (data ?? []) as Row[]
      const byAgent = new Map<string, RecGroup>()
      for (const r of rows) {
        const id = r.agent_id
        const kind = r.recommendation?.kind ?? null
        const existing = byAgent.get(id)
        if (existing) {
          existing.count += 1
          if (!existing.example_kind && kind) existing.example_kind = kind
        } else {
          byAgent.set(id, {
            agent_id: id,
            count: 1,
            example_kind: kind,
            severity: isCritical(id) ? 'critical' : 'routine',
          })
        }
      }
      const groups = Array.from(byAgent.values()).sort((a, b) => {
        // critical first, then by count desc
        if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1
        return b.count - a.count
      })
      const critical = groups.filter((g) => g.severity === 'critical')
      const routine = groups.filter((g) => g.severity === 'routine')
      const summary: string[] = []
      if (groups.length === 0) {
        summary.push('No open recommendations from the last 24 hours — fleet clean.')
      } else {
        if (critical.length > 0) {
          summary.push(`🚨 ${critical.length} critical issue${critical.length === 1 ? '' : 's'} need eyes:`)
          for (const g of critical.slice(0, 5)) {
            summary.push(
              `  • ${g.agent_id} — ${g.count} run${g.count === 1 ? '' : 's'}${g.example_kind ? ` (${g.example_kind})` : ''}`,
            )
          }
        }
        if (routine.length > 0) {
          summary.push(`${critical.length > 0 ? 'Plus' : ''} ${routine.length} routine queue${routine.length === 1 ? '' : 's'}:`)
          for (const g of routine.slice(0, 8)) {
            summary.push(
              `  • ${g.agent_id} — ${g.count}${g.example_kind ? ` (${g.example_kind})` : ''}`,
            )
          }
        }
      }
      const output: DigestReport = {
        window_hours: 24,
        total_open_recommendations: rows.length,
        critical_count: critical.reduce((a, g) => a + g.count, 0),
        routine_count: routine.reduce((a, g) => a + g.count, 0),
        groups,
        summary,
      }
      // Don't fire-and-forget — the digest IS the recommendation, and
      // it should always count on the topbar so the founder reads it.
      return {
        output,
        needsHuman: rows.length > 0,
        recommendation:
          rows.length > 0
            ? {
                kind: 'daily_digest',
                window_hours: 24,
                critical_count: output.critical_count,
                routine_count: output.routine_count,
                summary,
              }
            : null,
      }
    },
  )
}
