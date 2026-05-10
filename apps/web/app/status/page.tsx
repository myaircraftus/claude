/**
 * /status — Phase 16 Sprint 16.10 public system status page.
 *
 * Anonymous-readable. Pulls from active alert_events + recent
 * error_events via lib/ops/status-check.ts. Sub-system health is
 * derived from route prefixes matched against errors and alerts.
 */
import type { Metadata } from 'next'
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { PublicLayout } from '@/components/marketing/vite/PublicLayout'
import { createServiceSupabase } from '@/lib/supabase/server'
import { getSystemStatus, getRecentIncidents } from '@/lib/ops/status-check'

export const metadata: Metadata = {
  title: 'System status · aircraft.us',
  description: 'Live system status for aircraft.us — document upload, AI search, vision processing, billing.',
  alternates: { canonical: 'https://www.myaircraft.us/status' },
}

// Refresh every minute for the public page.
export const revalidate = 60

const HEADLINE: Record<string, { copy: string; cls: string; Icon: typeof CheckCircle2 }> = {
  operational: { copy: 'All systems operational', cls: 'bg-emerald-50 text-emerald-900 border-emerald-200', Icon: CheckCircle2 },
  degraded: { copy: 'Some systems degraded', cls: 'bg-amber-50 text-amber-900 border-amber-200', Icon: AlertTriangle },
  down: { copy: 'Major outage', cls: 'bg-red-50 text-red-900 border-red-200', Icon: XCircle },
}

export default async function StatusPage() {
  const service = createServiceSupabase()

  let status: Awaited<ReturnType<typeof getSystemStatus>>
  let incidents: Awaited<ReturnType<typeof getRecentIncidents>>
  try {
    [status, incidents] = await Promise.all([
      getSystemStatus(service),
      getRecentIncidents(service),
    ])
  } catch {
    // If alert_events / error_events aren't yet populated the queries
    // succeed but return empty; if some backing table is missing the
    // page falls back to "operational" rather than 500ing.
    status = {
      overall: 'operational',
      subsystems: [
        { id: 'document_upload', label: 'Document upload', health: 'operational', detail: 'No data' },
        { id: 'ai_search', label: 'AI search', health: 'operational', detail: 'No data' },
        { id: 'vision_processing', label: 'Vision processing', health: 'operational', detail: 'No data' },
        { id: 'billing', label: 'Billing', health: 'operational', detail: 'No data' },
      ],
      active_incidents: [],
      uptime_90d: {},
    }
    incidents = []
  }

  const headline = HEADLINE[status.overall]
  const HeadlineIcon = headline.Icon

  return (
    <PublicLayout>
      <main className="max-w-4xl mx-auto px-6 py-12 space-y-10">
        <div>
          <h1 className="text-3xl tracking-tight" style={{ fontWeight: 700 }}>System status</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live state of the aircraft.us platform. Updates every minute.
          </p>
        </div>

        <div className={`flex items-center gap-3 rounded-2xl border ${headline.cls} px-5 py-4`}>
          <HeadlineIcon className="h-6 w-6 shrink-0" />
          <div className="flex-1">
            <p className="text-lg" style={{ fontWeight: 700 }}>{headline.copy}</p>
            <p className="text-xs opacity-80">As of {new Date().toLocaleString()}.</p>
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="text-base" style={{ fontWeight: 600 }}>Sub-systems</h2>
          <div className="rounded-2xl border border-border bg-white divide-y divide-border">
            {status.subsystems.map((s) => {
              const Icon =
                s.health === 'operational' ? CheckCircle2 :
                s.health === 'degraded' ? AlertTriangle : XCircle
              const tint =
                s.health === 'operational' ? 'text-emerald-600' :
                s.health === 'degraded' ? 'text-amber-600' : 'text-red-600'
              return (
                <div key={s.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Icon className={`h-4 w-4 ${tint}`} />
                    <span className="text-sm" style={{ fontWeight: 500 }}>{s.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{s.detail}</span>
                </div>
              )
            })}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-base" style={{ fontWeight: 600 }}>Active incidents</h2>
          {status.active_incidents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active incidents.</p>
          ) : (
            <ul className="rounded-2xl border border-border bg-white divide-y divide-border">
              {status.active_incidents.map((i) => (
                <li key={i.id} className="px-4 py-3">
                  <p className="text-sm" style={{ fontWeight: 500 }}>{i.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {i.severity} · {i.alert_type} · started {new Date(i.fired_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-base" style={{ fontWeight: 600 }}>Recent incidents (30d)</h2>
          {incidents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No incidents in the last 30 days.</p>
          ) : (
            <ul className="rounded-2xl border border-border bg-white divide-y divide-border">
              {incidents.slice(0, 10).map((i) => (
                <li key={i.id} className="px-4 py-3">
                  <p className="text-sm" style={{ fontWeight: 500 }}>{i.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {i.severity} · {i.alert_type} · {new Date(i.fired_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-xs text-muted-foreground">
          Subscribe to status updates by email — coming soon. For now, follow {' '}
          <a href="https://www.myaircraft.us/support" className="text-primary hover:underline">our support page</a>
          {' '}to open a ticket if something looks wrong.
        </p>
      </main>
    </PublicLayout>
  )
}
