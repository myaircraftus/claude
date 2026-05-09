/**
 * /(app)/admin/vision/telemetry  (Phase 8 Sprint 8.8)
 *
 * Vision retrieval telemetry — last 7 days. Owner/admin only.
 * Shows total requests, fallback rate, p50/p95 latency, average raw
 * vs calibrated confidence, and the top low-confidence queries.
 *
 * Read-only — no mutations on this page.
 */
import { redirect } from 'next/navigation'
import { Topbar } from '@/components/shared/topbar'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { getTelemetrySummary, getLowConfidenceQueries } from '@/lib/vision/telemetry'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Vision Telemetry (Admin)' }

export default async function AdminVisionTelemetryPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .maybeSingle()

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) redirect('/login')
  if (!['owner', 'admin'].includes(membership.role)) redirect('/')

  const service = createServiceSupabase()
  const orgId = membership.organization_id

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const window = { since }

  // Both queries can fail if migration 101 isn't applied yet — render
  // a graceful empty state.
  let summary: Awaited<ReturnType<typeof getTelemetrySummary>> | null = null
  let lowConf: Awaited<ReturnType<typeof getLowConfidenceQueries>> = []
  let migrationMissing = false
  try {
    ;[summary, lowConf] = await Promise.all([
      getTelemetrySummary(service, orgId, window),
      getLowConfidenceQueries(service, orgId, window, 20),
    ])
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('vision_retrieval_log') || msg.includes('relation') || msg.includes('does not exist')) {
      migrationMissing = true
    } else {
      throw err
    }
  }

  const profileForTopbar = {
    id: user.id,
    email: user.email ?? '',
    full_name: profile?.full_name ?? user.email ?? '',
    avatar_url: null,
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profileForTopbar as any}
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Vision Index', href: '/admin/vision' },
          { label: 'Telemetry' },
        ]}
      />
      <main className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full space-y-6">
        <div>
          <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Vision Telemetry — last 7 days
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Retrieval calls to /api/vision/search and /api/vision/answer.
            Calibrated confidence folds in reviewer verdicts and end-user
            feedback for the same (query × page) pair.
          </p>
        </div>

        {migrationMissing ? (
          <div className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
            <div style={{ fontWeight: 600 }}>Migration 101 not applied.</div>
            Run <code className="font-mono text-[12px]">apps/web/scripts/apply-101.ts</code>{' '}
            (or psql migration 101_vision_retrieval_log.sql) to start collecting
            telemetry.
          </div>
        ) : null}

        {summary ? (
          <>
            <section className="rounded-2xl border border-border bg-white p-5">
              <h2 className="text-[14px] tracking-tight mb-4" style={{ fontWeight: 700 }}>
                Volume + outcome
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Total requests" value={summary.totalRequests.toString()} />
                <Stat label="Search calls" value={(summary.byRoute.search ?? 0).toString()} />
                <Stat label="Answer calls" value={(summary.byRoute.answer ?? 0).toString()} />
                <Stat
                  label="Fallback rate (answer)"
                  value={pct(summary.fallbackRate)}
                />
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-white p-5">
              <h2 className="text-[14px] tracking-tight mb-4" style={{ fontWeight: 700 }}>
                Confidence
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <Stat
                  label="Avg raw"
                  value={summary.avgRawConfidence === null ? '—' : summary.avgRawConfidence.toFixed(3)}
                />
                <Stat
                  label="Avg calibrated"
                  value={summary.avgCalibratedConfidence === null ? '—' : summary.avgCalibratedConfidence.toFixed(3)}
                />
              </div>
              <p className="text-[11.5px] text-muted-foreground mt-3">
                Calibrated &gt; raw means reviewer verdicts and end-user feedback
                are net-positive for the org's queries; calibrated &lt; raw means
                the opposite — investigate via the review queue.
              </p>
            </section>

            <section className="rounded-2xl border border-border bg-white p-5">
              <h2 className="text-[14px] tracking-tight mb-4" style={{ fontWeight: 700 }}>
                Latency
              </h2>
              <div className="grid grid-cols-3 gap-3">
                <Stat
                  label="p50 (ms)"
                  value={summary.p50LatencyMs === null ? '—' : Math.round(summary.p50LatencyMs).toString()}
                />
                <Stat
                  label="p95 (ms)"
                  value={summary.p95LatencyMs === null ? '—' : Math.round(summary.p95LatencyMs).toString()}
                />
                <Stat
                  label="Error rate"
                  value={pct(summary.errorRate)}
                />
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-white p-5">
              <h2 className="text-[14px] tracking-tight mb-4" style={{ fontWeight: 700 }}>
                Top low-confidence queries (calibrated &lt; 0.5)
              </h2>
              {lowConf.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">
                  No low-confidence queries in this window. 🎉
                </p>
              ) : (
                <table className="w-full text-[12.5px]">
                  <thead className="bg-muted/15 border-b border-border">
                    <tr>
                      <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Query</th>
                      <th className="text-right px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Hits</th>
                      <th className="text-right px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Avg calibrated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lowConf.map((row) => (
                      <tr key={row.search_query}>
                        <td className="px-3 py-1.5 truncate max-w-md" title={row.search_query}>
                          {row.search_query}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{row.count}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{row.avg_calibrated.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
        {label}
      </div>
      <div className="text-[20px] tabular-nums text-foreground mt-1" style={{ fontWeight: 700 }}>
        {value}
      </div>
    </div>
  )
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}
