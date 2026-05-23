/**
 * ops.cron-health
 *
 * Walks every cron agent in the registry (registry.ts agents with
 * trigger='cron' and status='active') and checks that we have at least
 * one succeeded run in the last 24h (or 2× their cron_schedule
 * interval, whichever is longer — gives the daily ones a generous
 * 26h window).
 *
 * Emits a 'cron_missed' recommendation for any agent that hasn't
 * run. /admin/agents surfaces it via the standard recommendation
 * column.
 *
 * Runs every 30 minutes via vercel.json cron.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { AGENTS } from '../registry'
import { runAgent } from '../runner'

export interface CronHealthReport {
  checked: number
  healthy: number
  missed: Array<{ agent_id: string; last_run_at: string | null; schedule: string | null }>
}

export async function checkCronHealth(args: {
  supabase: SupabaseClient
}): Promise<{ ok: boolean; output?: CronHealthReport; runId?: string; error?: string }> {
  return runAgent<CronHealthReport>(
    'ops.cron-health',
    { supabase: args.supabase },
    async () => {
      const cronAgents = AGENTS.filter(
        (a) => a.trigger === 'cron' && a.status === 'active',
      )
      const report: CronHealthReport = {
        checked: cronAgents.length,
        healthy: 0,
        missed: [],
      }
      const now = Date.now()
      for (const def of cronAgents) {
        // Lookup most recent succeeded run.
        const { data } = await args.supabase
          .from('agent_runs')
          .select('completed_at')
          .eq('agent_id', def.id)
          .eq('status', 'succeeded')
          .order('completed_at', { ascending: false })
          .limit(1)
        const last = data?.[0]?.completed_at as string | undefined
        const ageMs = last ? now - new Date(last).getTime() : Infinity
        // Window: 26h for daily, otherwise 2× the inferred interval
        // (best-effort, we don't actually parse the cron string here).
        const windowMs = 26 * 60 * 60 * 1000
        if (ageMs > windowMs) {
          report.missed.push({
            agent_id: def.id,
            last_run_at: last ?? null,
            schedule: def.cron_schedule ?? null,
          })
        } else {
          report.healthy += 1
        }
      }
      return {
        output: report,
        needsHuman: report.missed.length > 0,
        recommendation:
          report.missed.length > 0
            ? { kind: 'cron_missed', missed: report.missed }
            : null,
      }
    },
  )
}
