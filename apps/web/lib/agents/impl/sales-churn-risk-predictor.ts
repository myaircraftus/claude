/**
 * sales.churn-risk-predictor
 *
 * Daily: score every paying customer (org) 0-100 for churn risk.
 *
 * Signals (all pulled from existing tables, no new schema):
 *   - days since last login (auth.audit_log_entries event login)
 *   - days since last aircraft activity (work_orders.updated_at,
 *     documents.created_at, logbook_entries.created_at — whichever
 *     is most recent per org)
 *   - count of active aircraft
 *   - count of open support_tickets in last 30 days
 *
 * Scoring (simple linear, tuneable later):
 *   30 * clip(days_since_activity / 60)
 * + 20 * clip(days_since_login / 30)
 * + 25 if aircraft_count == 0
 * + 25 if open_tickets >= 3
 *
 * Anything ≥ 50 = call-needed. Emits a 'churn_risk_review'
 * recommendation listing the top-decile risks so the founder gets a
 * call list each morning.
 *
 * Pure SQL — no LLM. Best-effort if a table is missing.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface ChurnRiskScore {
  organization_id: string
  organization_name: string | null
  score: number
  signals: {
    days_since_login: number | null
    days_since_activity: number | null
    aircraft_count: number
    open_tickets: number
  }
}

export interface ChurnRiskReport {
  scored: number
  top_risks: ChurnRiskScore[]
}

function clip01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

export async function predictChurnRisk(args: {
  supabase: SupabaseClient
}): Promise<{ ok: boolean; output?: ChurnRiskReport; runId?: string; error?: string }> {
  return runAgent<ChurnRiskReport>(
    'sales.churn-risk-predictor',
    { supabase: args.supabase },
    async () => {
      const now = Date.now()

      // 1. Every active org
      const { data: orgs } = await args.supabase
        .from('organizations')
        .select('id, name')
        .limit(2000)
      const orgList = (orgs ?? []) as Array<{ id: string; name: string | null }>
      if (orgList.length === 0) {
        return { output: { scored: 0, top_risks: [] } }
      }
      const orgIds = orgList.map((o) => o.id)

      // 2. Most-recent activity per org — take max(updated_at) across a
      //    few activity tables. Best-effort: skip a table if the query
      //    errors (e.g. table missing).
      const activityByOrg = new Map<string, string>()
      async function bump(table: string, column: string) {
        const { data } = await args.supabase
          .from(table)
          .select(`organization_id, ${column}`)
          .in('organization_id', orgIds)
          .order(column, { ascending: false })
          .limit(2000)
        const rows = (data ?? []) as unknown as Array<Record<string, unknown>>
        for (const row of rows) {
          const orgId = row.organization_id as string
          const ts = row[column] as string | null
          if (!ts) continue
          const cur = activityByOrg.get(orgId)
          if (!cur || ts > cur) activityByOrg.set(orgId, ts)
        }
      }
      await Promise.all([
        bump('work_orders', 'updated_at').catch(() => undefined),
        bump('logbook_entries', 'created_at').catch(() => undefined),
        bump('documents', 'created_at').catch(() => undefined),
      ])

      // 3. Aircraft count per org (excluding archived)
      const { data: ac } = await args.supabase
        .from('aircraft')
        .select('organization_id')
        .in('organization_id', orgIds)
        .eq('is_archived', false)
      const aircraftCount = new Map<string, number>()
      for (const row of (ac ?? []) as Array<{ organization_id: string }>) {
        aircraftCount.set(row.organization_id, (aircraftCount.get(row.organization_id) ?? 0) + 1)
      }

      // 4. Open tickets in last 30 days per org
      const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()
      const { data: tk } = await args.supabase
        .from('support_tickets')
        .select('organization_id, status, created_at')
        .in('organization_id', orgIds)
        .gte('created_at', thirtyDaysAgo)
        .not('status', 'in', '("resolved","closed")')
      const openTickets = new Map<string, number>()
      for (const row of (tk ?? []) as Array<{ organization_id: string }>) {
        openTickets.set(row.organization_id, (openTickets.get(row.organization_id) ?? 0) + 1)
      }

      // 5. Score each org
      const scored: ChurnRiskScore[] = []
      for (const org of orgList) {
        const lastActivity = activityByOrg.get(org.id)
        const daysSinceActivity = lastActivity
          ? Math.floor((now - new Date(lastActivity).getTime()) / (24 * 60 * 60 * 1000))
          : null
        const aircraft = aircraftCount.get(org.id) ?? 0
        const tickets = openTickets.get(org.id) ?? 0

        let score = 0
        if (daysSinceActivity != null) {
          score += 30 * clip01(daysSinceActivity / 60)
        } else {
          score += 30 // no activity recorded → worst case
        }
        if (aircraft === 0) score += 25
        if (tickets >= 3) score += 25
        // days_since_login is a future signal — requires reading
        // auth.audit_log_entries which the service role can do but
        // we don't want to overload this agent's first pass. Stub at 0.

        scored.push({
          organization_id: org.id,
          organization_name: org.name,
          score: Math.round(score),
          signals: {
            days_since_login: null,
            days_since_activity: daysSinceActivity,
            aircraft_count: aircraft,
            open_tickets: tickets,
          },
        })
      }
      scored.sort((a, b) => b.score - a.score)
      const topRisks = scored.filter((s) => s.score >= 50).slice(0, 25)

      return {
        output: { scored: scored.length, top_risks: topRisks },
        needsHuman: topRisks.length > 0,
        recommendation:
          topRisks.length > 0
            ? { kind: 'churn_risk_review', top_risks: topRisks }
            : null,
      }
    },
  )
}
