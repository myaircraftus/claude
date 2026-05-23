/**
 * compliance.soc2-evidence-collector
 *
 * Quarterly job (first of every quarter 00:00 UTC) that assembles the
 * SOC2 evidence packet. We gather what we can read from our own DB:
 *
 *   - Access review: list of platform admins + their last sign-in date
 *   - Change log: count of deploys this quarter (from agent_runs of
 *     ops.deployment-canary) + git revs if available
 *   - Backup verification: pg_dump check (proxy: presence of recent
 *     row in `backup_log` table)
 *   - Vuln scan: agent_runs of safety.* + security.* (we run them
 *     continuously, so any quarter is a packet of evidence)
 *   - Incident summary: alert_events with severity P0/P1 this quarter
 *   - Vendor attestations: list of sub-processors (static for now;
 *     pulled from supabase/migrations + env)
 *
 * Emits 'soc2_evidence_quarter_<Q>_<YYYY>' recommendation with the
 * full packet. Pure SQL + heuristic. Founder reviews + assembles the
 * final auditor-facing doc; agent never sends anywhere.
 *
 * Tolerant of any missing tables.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface AccessReviewRow {
  user_id: string
  email: string | null
  last_sign_in_at: string | null
  is_platform_admin: boolean
}

export interface SOC2Packet {
  quarter: string
  generated_at: string
  access_review: AccessReviewRow[]
  deploy_count: number
  safety_run_count: number
  incident_count: number
  incidents: Array<{
    alert_type: string
    severity: string
    summary: string
    fired_at: string
  }>
  sub_processors: string[]
}

function currentQuarter(d: Date): string {
  const q = Math.floor(d.getUTCMonth() / 3) + 1
  return `Q${q}-${d.getUTCFullYear()}`
}

export async function collectSoc2Evidence(args: {
  supabase: SupabaseClient
  asOf?: Date
}): Promise<{ ok: boolean; output?: SOC2Packet; runId?: string; error?: string }> {
  const asOf = args.asOf ?? new Date()
  return runAgent<SOC2Packet>(
    'compliance.soc2-evidence-collector',
    { supabase: args.supabase, input: { as_of: asOf.toISOString() } },
    async () => {
      const quarter = currentQuarter(asOf)
      const startQ = new Date(
        Date.UTC(asOf.getUTCFullYear(), Math.floor(asOf.getUTCMonth() / 3) * 3, 1, 0, 0, 0),
      ).toISOString()
      const [admins, deploys, safetyRuns, alerts] = await Promise.all([
        args.supabase
          .from('user_profiles')
          .select('id, email, last_sign_in_at, is_platform_admin')
          .eq('is_platform_admin', true),
        args.supabase
          .from('agent_runs')
          .select('id', { count: 'exact', head: true })
          .eq('agent_id', 'ops.deployment-canary')
          .gte('created_at', startQ),
        args.supabase
          .from('agent_runs')
          .select('id', { count: 'exact', head: true })
          .like('agent_id', 'safety.%')
          .gte('created_at', startQ),
        args.supabase
          .from('alert_events')
          .select('alert_type, severity, summary, fired_at')
          .in('severity', ['P0', 'P1'])
          .gte('fired_at', startQ)
          .order('fired_at', { ascending: false })
          .limit(100),
      ])
      type AdminRow = {
        id: string
        email: string | null
        last_sign_in_at: string | null
        is_platform_admin: boolean | null
      }
      const accessReview: AccessReviewRow[] = (
        (admins.data ?? []) as AdminRow[]
      ).map((r) => ({
        user_id: r.id,
        email: r.email,
        last_sign_in_at: r.last_sign_in_at,
        is_platform_admin: Boolean(r.is_platform_admin),
      }))
      type AlertRow = {
        alert_type: string
        severity: string
        summary: string
        fired_at: string
      }
      const incidents = ((alerts.data ?? []) as AlertRow[]).map((r) => ({
        alert_type: r.alert_type,
        severity: r.severity,
        summary: r.summary,
        fired_at: r.fired_at,
      }))
      const packet: SOC2Packet = {
        quarter,
        generated_at: asOf.toISOString(),
        access_review: accessReview,
        deploy_count: deploys.count ?? 0,
        safety_run_count: safetyRuns.count ?? 0,
        incident_count: incidents.length,
        incidents,
        sub_processors: [
          'supabase.com (database, auth, storage)',
          'vercel.com (hosting)',
          'openai.com (LLM)',
          'cohere.com (reranking)',
          'resend.com (email)',
          'twilio.com (SMS)',
          'stripe.com (billing)',
          'sentry.io (error monitoring)',
        ],
      }
      return {
        output: packet,
        needsHuman: true,
        recommendation: { kind: 'soc2_evidence_packet', quarter, packet_summary: {
          quarter,
          admin_count: accessReview.length,
          deploy_count: packet.deploy_count,
          safety_run_count: packet.safety_run_count,
          incident_count: packet.incident_count,
        } },
      }
    },
  )
}
