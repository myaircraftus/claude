/**
 * /admin/compliance — Compliance posture dashboard.
 *
 * One-screen view of:
 *   - Latest SOC2 evidence packet
 *   - Latest ISO 27001 Annex-A packet
 *   - DPA anniversaries due in the next 30 days
 *   - GDPR export requests (audit trail)
 *   - audit-event chain integrity status
 *
 * Pure read view — the underlying agents own the heavy lifting. This
 * page exists so the founder can answer "are we audit-ready?" without
 * clicking through 6 categories on /admin/agents.
 *
 * Admin-only. Server-rendered.
 */
import { redirect } from 'next/navigation'
import { Topbar } from '@/components/shared/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import type { UserProfile } from '@/types'

export const dynamic = 'force-dynamic'

interface AgentRunRow {
  id: string
  agent_id: string
  status: string
  output: Record<string, unknown> | null
  recommendation: Record<string, unknown> | null
  created_at: string
}

async function latestRun(
  service: ReturnType<typeof createServiceSupabase>,
  agentId: string,
): Promise<AgentRunRow | null> {
  const { data } = await service
    .from('agent_runs')
    .select('id, agent_id, status, output, recommendation, created_at')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as AgentRunRow | null) ?? null
}

export default async function CompliancePage() {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()
  const p = profile as UserProfile | null
  if (!p?.is_platform_admin) redirect('/dashboard')

  const service = createServiceSupabase()
  const [soc2, iso, dpa, audit, gdprList] = await Promise.all([
    latestRun(service, 'compliance.soc2-evidence-collector'),
    latestRun(service, 'compliance.iso-evidence-collector'),
    latestRun(service, 'compliance.dpa-anniversary-reviewer'),
    latestRun(service, 'compliance.audit-event-watchdog'),
    service
      .from('agent_runs')
      .select('id, status, output, recommendation, created_at, triggered_by')
      .eq('agent_id', 'compliance.gdpr-export-fulfilment')
      .order('created_at', { ascending: false })
      .limit(10),
  ])
  const gdpr = (gdprList.data ?? []) as Array<{
    id: string
    status: string
    output: Record<string, unknown> | null
    created_at: string
    triggered_by: string | null
  }>

  const soc2Out = soc2?.output as
    | { quarter?: string; deploy_count?: number; safety_run_count?: number; incident_count?: number; access_review?: unknown[] }
    | null
  const isoOut = iso?.output as
    | { quarter?: string; controls?: Array<{ control: string; description: string }> }
    | null
  const dpaOut = dpa?.output as
    | { due_count?: number; due?: Array<{ org_name: string | null; days_until_review: number; severity: string }> }
    | null
  const auditOut = audit?.output as
    | { finding_count?: number; last_event_at?: string | null }
    | null

  return (
    <div className="flex flex-col h-full">
      <Topbar profile={p} breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Compliance' }]} />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-5">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight">Compliance posture</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Latest evidence packets, anniversaries due, and audit chain integrity.
            </p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* SOC2 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>SOC 2 evidence</span>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {soc2 ? new Date(soc2.created_at).toISOString().slice(0, 10) : '—'}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {soc2 ? (
                  <dl className="grid grid-cols-2 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">Quarter</dt>
                    <dd className="font-mono">{soc2Out?.quarter ?? '—'}</dd>
                    <dt className="text-muted-foreground">Admins under access review</dt>
                    <dd className="font-mono">{soc2Out?.access_review?.length ?? 0}</dd>
                    <dt className="text-muted-foreground">Deploys this quarter</dt>
                    <dd className="font-mono">{soc2Out?.deploy_count ?? 0}</dd>
                    <dt className="text-muted-foreground">Safety/security runs</dt>
                    <dd className="font-mono">{soc2Out?.safety_run_count ?? 0}</dd>
                    <dt className="text-muted-foreground">P0/P1 incidents</dt>
                    <dd className="font-mono">{soc2Out?.incident_count ?? 0}</dd>
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">No SOC2 packet generated yet. The collector runs quarterly.</p>
                )}
              </CardContent>
            </Card>

            {/* ISO */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>ISO 27001 Annex-A</span>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {iso ? new Date(iso.created_at).toISOString().slice(0, 10) : '—'}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {iso ? (
                  <>
                    <p className="text-sm mb-2">Quarter: <span className="font-mono">{isoOut?.quarter ?? '—'}</span></p>
                    <ul className="text-[13px] space-y-1">
                      {(isoOut?.controls ?? []).slice(0, 7).map((c) => (
                        <li key={c.control} className="flex gap-2">
                          <span className="font-mono text-violet-700 shrink-0">{c.control}</span>
                          <span className="text-muted-foreground">{c.description}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No ISO packet generated yet. The collector runs quarterly.</p>
                )}
              </CardContent>
            </Card>

            {/* DPA anniversaries */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>DPA anniversaries due</span>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {dpa ? new Date(dpa.created_at).toISOString().slice(0, 10) : '—'}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dpa ? (
                  <>
                    <p className="text-sm mb-2">
                      <span className="font-mono">{dpaOut?.due_count ?? 0}</span> due in the next 30 days.
                    </p>
                    {(dpaOut?.due ?? []).slice(0, 6).map((d, i) => (
                      <div key={i} className="text-[13px] flex justify-between border-b border-border/40 py-1">
                        <span>{d.org_name ?? 'Unknown org'}</span>
                        <span className={
                          d.severity === 'overdue' || d.severity === 'due_now'
                            ? 'text-rose-700 font-medium'
                            : 'text-muted-foreground'
                        }>
                          {d.days_until_review >= 0 ? `${d.days_until_review}d` : 'overdue'}
                        </span>
                      </div>
                    ))}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No DPA records on file yet.</p>
                )}
              </CardContent>
            </Card>

            {/* Audit chain integrity */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Audit chain integrity</span>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {audit ? new Date(audit.created_at).toISOString().slice(0, 10) : '—'}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {audit ? (
                  <dl className="grid grid-cols-2 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">Findings (last 24h)</dt>
                    <dd className={`font-mono ${(auditOut?.finding_count ?? 0) > 0 ? 'text-rose-700 font-medium' : 'text-emerald-700'}`}>
                      {auditOut?.finding_count ?? 0}
                    </dd>
                    <dt className="text-muted-foreground">Last audit event</dt>
                    <dd className="font-mono text-[12px]">
                      {auditOut?.last_event_at
                        ? new Date(auditOut.last_event_at).toISOString().replace('T', ' ').slice(0, 16) + 'Z'
                        : '—'}
                    </dd>
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">audit_event table not yet provisioned. Watchdog will activate when it is.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* GDPR export trail */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent GDPR self-export requests</CardTitle>
            </CardHeader>
            <CardContent>
              {gdpr.length === 0 ? (
                <p className="text-sm text-muted-foreground">No export requests in the audit log.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-[11px] text-muted-foreground uppercase tracking-wider">
                    <tr className="border-b border-border">
                      <th className="py-1.5 pr-3">When</th>
                      <th className="py-1.5 pr-3">User</th>
                      <th className="py-1.5 pr-3">Status</th>
                      <th className="py-1.5 pr-3 text-right">Sections</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {gdpr.map((g) => {
                      const out = g.output as { sections?: Array<{ name: string; row_count: number }> } | null
                      const sections = out?.sections ?? []
                      return (
                        <tr key={g.id}>
                          <td className="py-1.5 pr-3 font-mono text-[12px]">
                            {new Date(g.created_at).toISOString().slice(0, 16).replace('T', ' ')}Z
                          </td>
                          <td className="py-1.5 pr-3 font-mono text-[12px]">{g.triggered_by?.slice(0, 8) ?? '—'}</td>
                          <td className="py-1.5 pr-3">{g.status}</td>
                          <td className="py-1.5 pr-3 text-right text-[12px] text-muted-foreground">
                            {sections.length} sections / {sections.reduce((a, s) => a + s.row_count, 0)} rows
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
