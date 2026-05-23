/**
 * security.failed-login-anomaly
 *
 * Reads auth.audit_log_entries every 10 minutes. For any user account
 * that saw >=10 failed sign-in events in the last 15 minutes from >=3
 * distinct IPs, emit a 'failed_login_burst' recommendation marked
 * severity='critical' and disable_account=true. Founder gets paged via
 * the standard recommendation surface; manual unlock from /admin/users.
 *
 * Pure SQL. The audit table is read-only from our side; we don't
 * write into auth. If we want to actually disable the account, that
 * lives in a separate human-confirmed step.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface FailedLoginBurst {
  user_email: string
  failed_attempts: number
  distinct_ips: number
  first_seen: string
  last_seen: string
}

export interface FailedLoginAnomalyReport {
  scanned_window_minutes: number
  bursts: FailedLoginBurst[]
}

export async function detectFailedLoginAnomalies(args: {
  supabase: SupabaseClient
  /** Lookback window. Default 15 minutes. */
  windowMinutes?: number
  /** Min failed attempts in window to flag. Default 10. */
  minAttempts?: number
  /** Min distinct IPs to consider it a real burst (vs single fat-finger). Default 3. */
  minDistinctIps?: number
}): Promise<{ ok: boolean; output?: FailedLoginAnomalyReport; runId?: string; error?: string }> {
  const windowMinutes = args.windowMinutes ?? 15
  const minAttempts = args.minAttempts ?? 10
  const minIps = args.minDistinctIps ?? 3

  return runAgent<FailedLoginAnomalyReport>(
    'security.failed-login-anomaly',
    {
      supabase: args.supabase,
      input: {
        window_minutes: windowMinutes,
        min_attempts: minAttempts,
        min_distinct_ips: minIps,
      },
    },
    async () => {
      const sinceIso = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()
      // Supabase exposes auth.audit_log_entries via the service role.
      // Events have payload.action — login_failed when a sign-in fails.
      const { data, error } = await args.supabase
        .schema('auth')
        .from('audit_log_entries')
        .select('id, payload, ip_address, created_at')
        .gte('created_at', sinceIso)
        .limit(5000)
      if (error) {
        // If the schema isn't exposed (some Supabase project configs),
        // return an empty report rather than failing the agent run.
        return {
          output: { scanned_window_minutes: windowMinutes, bursts: [] },
          recommendation: { kind: 'audit_log_unreadable', reason: error.message },
        }
      }
      type Row = {
        id: string
        ip_address: string | null
        created_at: string
        payload: Record<string, unknown> | null
      }
      const rows = (data ?? []) as unknown as Row[]
      // Bucket by actor (email) of failed login events.
      const buckets = new Map<
        string,
        { count: number; ips: Set<string>; first: string; last: string }
      >()
      for (const row of rows) {
        const payload = row.payload ?? {}
        const action = (payload['action'] as string | undefined) ?? ''
        if (!action.includes('login') || !action.includes('fail')) continue
        const actor =
          (payload['actor_username'] as string | undefined) ??
          (payload['actor_email'] as string | undefined) ??
          (payload['email'] as string | undefined) ??
          'unknown'
        const slot = buckets.get(actor) ?? {
          count: 0,
          ips: new Set<string>(),
          first: row.created_at,
          last: row.created_at,
        }
        slot.count += 1
        if (row.ip_address) slot.ips.add(row.ip_address)
        if (row.created_at < slot.first) slot.first = row.created_at
        if (row.created_at > slot.last) slot.last = row.created_at
        buckets.set(actor, slot)
      }
      const bursts: FailedLoginBurst[] = []
      for (const [email, slot] of buckets.entries()) {
        if (slot.count >= minAttempts && slot.ips.size >= minIps) {
          bursts.push({
            user_email: email,
            failed_attempts: slot.count,
            distinct_ips: slot.ips.size,
            first_seen: slot.first,
            last_seen: slot.last,
          })
        }
      }
      bursts.sort((a, b) => b.failed_attempts - a.failed_attempts)
      return {
        output: { scanned_window_minutes: windowMinutes, bursts },
        needsHuman: bursts.length > 0,
        recommendation:
          bursts.length > 0
            ? {
                kind: 'failed_login_burst',
                severity: 'critical',
                window_minutes: windowMinutes,
                bursts,
              }
            : null,
      }
    },
  )
}
