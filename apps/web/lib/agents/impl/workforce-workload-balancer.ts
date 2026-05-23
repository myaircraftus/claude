/**
 * workforce.workload-balancer
 *
 * Daily 08:00 UTC. Scores open-work-order distribution across each
 * shop's mechanics. Flags imbalance where one mechanic's open count
 * exceeds 2× the team median.
 *
 * Emits 'workload_imbalance' recommendation per organization with the
 * top-loaded mechanic + a recommended redistribution count. Pure SQL.
 *
 * Skips single-mechanic shops (no balancing to do).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

interface MechanicLoad {
  user_id: string
  open_work_orders: number
}

export interface WorkloadIssue {
  organization_id: string
  team_size: number
  team_median: number
  top_loaded_user_id: string
  top_load: number
  imbalance_ratio: number
  suggested_redistribute: number
}

export interface WorkloadReport {
  organizations_scanned: number
  imbalanced_count: number
  issues: WorkloadIssue[]
}

const OPEN_STATUSES = ['open', 'in_progress', 'awaiting_parts', 'blocked', 'ready_for_signoff']

export async function detectWorkloadImbalance(args: {
  supabase: SupabaseClient
}): Promise<{ ok: boolean; output?: WorkloadReport; runId?: string; error?: string }> {
  return runAgent<WorkloadReport>(
    'workforce.workload-balancer',
    { supabase: args.supabase, input: {} },
    async () => {
      const { data, error } = await args.supabase
        .from('work_orders')
        .select('organization_id, assigned_mechanic_id, status')
        .in('status', OPEN_STATUSES)
        .not('assigned_mechanic_id', 'is', null)
        .limit(20000)
      if (error) {
        return {
          output: { organizations_scanned: 0, imbalanced_count: 0, issues: [] },
          recommendation: { kind: 'workload_scan_failed', reason: error.message },
        }
      }
      type Row = {
        organization_id: string | null
        assigned_mechanic_id: string | null
        status: string | null
      }
      const rows = (data ?? []) as Row[]
      // Group: org → mechanic → count
      const byOrg = new Map<string, Map<string, number>>()
      for (const r of rows) {
        if (!r.organization_id || !r.assigned_mechanic_id) continue
        const orgMap = byOrg.get(r.organization_id) ?? new Map<string, number>()
        orgMap.set(r.assigned_mechanic_id, (orgMap.get(r.assigned_mechanic_id) ?? 0) + 1)
        byOrg.set(r.organization_id, orgMap)
      }
      const issues: WorkloadIssue[] = []
      for (const [orgId, mechMap] of byOrg.entries()) {
        const loads: MechanicLoad[] = Array.from(mechMap.entries()).map(
          ([user_id, open_work_orders]) => ({ user_id, open_work_orders }),
        )
        if (loads.length < 2) continue // single-mechanic shop — nothing to balance
        loads.sort((a, b) => b.open_work_orders - a.open_work_orders)
        const sorted = [...loads].sort((a, b) => a.open_work_orders - b.open_work_orders)
        const mid = Math.floor(sorted.length / 2)
        const median =
          sorted.length % 2 === 0
            ? (sorted[mid - 1].open_work_orders + sorted[mid].open_work_orders) / 2
            : sorted[mid].open_work_orders
        const top = loads[0]
        if (median === 0) continue
        const ratio = top.open_work_orders / median
        if (ratio < 2) continue
        const suggested = Math.max(1, Math.floor(top.open_work_orders - median))
        issues.push({
          organization_id: orgId,
          team_size: loads.length,
          team_median: median,
          top_loaded_user_id: top.user_id,
          top_load: top.open_work_orders,
          imbalance_ratio: Number(ratio.toFixed(2)),
          suggested_redistribute: suggested,
        })
      }
      issues.sort((a, b) => b.imbalance_ratio - a.imbalance_ratio)
      return {
        output: {
          organizations_scanned: byOrg.size,
          imbalanced_count: issues.length,
          issues,
        },
        needsHuman: issues.length > 0,
        recommendation:
          issues.length > 0
            ? { kind: 'workload_imbalance', count: issues.length, issues: issues.slice(0, 25) }
            : null,
      }
    },
  )
}
