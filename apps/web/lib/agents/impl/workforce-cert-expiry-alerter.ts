/**
 * workforce.cert-expiry-alerter
 *
 * Daily sweep over public.mechanic_certificates. For each row whose
 * expiration_date is within the next 60 days, emit a 'cert_expiry_soon'
 * recommendation. The /admin/agents page surfaces these so the shop
 * owner can ping the mechanic to renew (IA / A&P / medical).
 *
 * Tiered urgency:
 *   - days <=  7 : critical (sets needsHuman=true)
 *   - days <= 30 : warning
 *   - days <= 60 : info
 *
 * Skips rows with renewal_reminder = false (mechanic opted out).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface CertAlert {
  certificate_id: string
  mechanic_name: string | null
  certificate_type: string | null
  certificate_number: string | null
  expiration_date: string
  days_until_expiry: number
  severity: 'critical' | 'warning' | 'info'
  organization_id: string | null
  user_id: string | null
}

export interface CertExpiryReport {
  scanned: number
  alerts: CertAlert[]
}

export async function alertCertExpiries(args: {
  supabase: SupabaseClient
}): Promise<{ ok: boolean; output?: CertExpiryReport; runId?: string; error?: string }> {
  return runAgent<CertExpiryReport>(
    'workforce.cert-expiry-alerter',
    { supabase: args.supabase },
    async () => {
      const now = new Date()
      const horizon = new Date(now)
      horizon.setDate(horizon.getDate() + 60)
      const horizonIso = horizon.toISOString().slice(0, 10)
      const todayIso = now.toISOString().slice(0, 10)

      const { data: rows } = await args.supabase
        .from('mechanic_certificates')
        .select(
          'id, organization_id, user_id, mechanic_name, certificate_type, certificate_number, expiration_date, renewal_reminder',
        )
        .gte('expiration_date', todayIso)
        .lte('expiration_date', horizonIso)
        .eq('renewal_reminder', true)

      const alerts: CertAlert[] = []
      for (const row of rows ?? []) {
        if (!row.expiration_date) continue
        const exp = new Date(row.expiration_date as string)
        const days = Math.ceil((exp.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        const severity: CertAlert['severity'] =
          days <= 7 ? 'critical' : days <= 30 ? 'warning' : 'info'
        alerts.push({
          certificate_id: row.id as string,
          mechanic_name: (row.mechanic_name as string) ?? null,
          certificate_type: (row.certificate_type as string) ?? null,
          certificate_number: (row.certificate_number as string) ?? null,
          expiration_date: row.expiration_date as string,
          days_until_expiry: days,
          severity,
          organization_id: (row.organization_id as string) ?? null,
          user_id: (row.user_id as string) ?? null,
        })
      }

      // Sort: critical first, then by days_until_expiry ascending
      alerts.sort((a, b) => {
        const order = { critical: 0, warning: 1, info: 2 } as const
        if (order[a.severity] !== order[b.severity]) {
          return order[a.severity] - order[b.severity]
        }
        return a.days_until_expiry - b.days_until_expiry
      })

      const critical = alerts.filter((a) => a.severity === 'critical').length

      return {
        output: { scanned: (rows ?? []).length, alerts },
        needsHuman: critical > 0,
        recommendation:
          alerts.length > 0
            ? {
                kind: 'cert_expiry_soon',
                critical_count: critical,
                warning_count: alerts.filter((a) => a.severity === 'warning').length,
                info_count: alerts.filter((a) => a.severity === 'info').length,
                alerts: alerts.slice(0, 50),
              }
            : null,
      }
    },
  )
}
