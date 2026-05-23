/**
 * /admin/agents — Agent fleet monitor.
 *
 * Two stacked panes:
 *   1. The agent registry — every agent declared in lib/agents/registry.ts,
 *      with its purpose, status, trigger, provider/model, writes flag.
 *   2. Recent runs — last 50 rows from agent_runs, with latency, tokens,
 *      status, and any recommendation the run produced.
 *
 * Server-rendered; admin-only. The "Trigger" buttons hit small POST
 * endpoints that wrap the agent — also admin-only, also audit-logged
 * via the standard runner.
 */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Topbar } from '@/components/shared/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { AGENTS, type AgentDefinition } from '@/lib/agents/registry'
import type { UserProfile } from '@/types'
import { AgentTriggerButton } from './agent-trigger-button'

export const metadata = { title: 'Admin — Agent fleet' }
export const dynamic = 'force-dynamic'

const STATUS_TINT: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  proposed: 'bg-slate-100 text-slate-700 border-slate-200',
  paused: 'bg-amber-100 text-amber-900 border-amber-200',
  deprecated: 'bg-rose-100 text-rose-900 border-rose-200',
}
const RUN_STATUS_TINT: Record<string, string> = {
  succeeded: 'text-emerald-700',
  running: 'text-blue-700',
  pending: 'text-slate-500',
  failed: 'text-rose-700',
  skipped: 'text-slate-500',
  needs_human: 'text-amber-700',
}

interface AgentRun {
  id: string
  agent_id: string
  status: string
  triggered_by: string | null
  target_kind: string | null
  target_id: string | null
  provider: string | null
  model: string | null
  latency_ms: number | null
  tokens_in: number | null
  tokens_out: number | null
  error_message: string | null
  recommendation: Record<string, unknown> | null
  created_at: string
  completed_at: string | null
}

function ageMinutes(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
}

function formatAge(min: number): string {
  if (min < 60) return `${min}m`
  if (min < 24 * 60) return `${Math.round(min / 60)}h`
  return `${Math.round(min / (24 * 60))}d`
}

function formatLatency(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatTokens(inT: number | null, outT: number | null): string {
  if (!inT && !outT) return '—'
  return `${inT ?? 0} / ${outT ?? 0}`
}

export default async function AdminAgentsPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profileRow } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  if (!profileRow) redirect('/login')
  const profile = profileRow as UserProfile
  if (!profile.is_platform_admin) redirect('/dashboard')

  const service = createServiceSupabase()
  const { data: runsRaw } = await service
    .from('agent_runs')
    .select(
      'id, agent_id, status, triggered_by, target_kind, target_id, provider, model, latency_ms, tokens_in, tokens_out, error_message, recommendation, created_at, completed_at',
    )
    .order('created_at', { ascending: false })
    .limit(50)
  const runs = (runsRaw ?? []) as AgentRun[]

  // Rollup per-agent counts of recent activity (last 50 runs).
  const counts = new Map<
    string,
    { runs: number; failed: number; succeeded: number; needsHuman: number }
  >()
  for (const r of runs) {
    const c = counts.get(r.agent_id) ?? { runs: 0, failed: 0, succeeded: 0, needsHuman: 0 }
    c.runs += 1
    if (r.status === 'failed') c.failed += 1
    if (r.status === 'succeeded') c.succeeded += 1
    if (r.status === 'needs_human') c.needsHuman += 1
    counts.set(r.agent_id, c)
  }

  // Bucket agents by category for display.
  const byCategory = new Map<string, AgentDefinition[]>()
  for (const a of AGENTS) {
    const arr = byCategory.get(a.category) ?? []
    arr.push(a)
    byCategory.set(a.category, arr)
  }
  const categoryOrder = Array.from(byCategory.keys()).sort()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Agent fleet' },
        ]}
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl tracking-tight" style={{ fontWeight: 700 }}>
                Agent fleet
              </h1>
              <p className="text-sm text-muted-foreground">
                {AGENTS.filter((a) => a.status === 'active').length} active ·{' '}
                {AGENTS.filter((a) => a.status === 'proposed').length} proposed ·{' '}
                {runs.length} recent runs ({runs.filter((r) => r.status === 'failed').length} failed,{' '}
                {runs.filter((r) => r.status === 'needs_human').length} need human)
              </p>
            </div>
            <Link
              href="/admin/support/inbox"
              className="rounded-lg border border-border bg-white px-4 py-2 text-sm hover:bg-muted/40"
            >
              Support inbox →
            </Link>
          </div>

          {/* Fleet manifest */}
          {categoryOrder.map((cat) => {
            const agents = byCategory.get(cat) ?? []
            return (
              <Card key={cat}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base capitalize">{cat.replace(/-/g, ' ')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-border">
                    {agents.map((a) => {
                      const c = counts.get(a.id)
                      return (
                        <li key={a.id} className="py-3 flex items-start gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {a.id}
                              </span>
                              <span className="text-sm" style={{ fontWeight: 600 }}>
                                {a.label}
                              </span>
                              <span
                                className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                  STATUS_TINT[a.status] ?? STATUS_TINT.proposed
                                }`}
                              >
                                {a.status}
                              </span>
                              {a.writes && (
                                <span className="rounded-md border border-violet-300 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-900">
                                  writes
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                              {a.purpose}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                              <span>
                                trigger: <span className="font-mono">{a.trigger}</span>
                              </span>
                              <span>
                                model:{' '}
                                <span className="font-mono">
                                  {a.recommended_provider} / {a.recommended_model}
                                </span>
                              </span>
                              {a.cron_schedule && (
                                <span>
                                  cron: <span className="font-mono">{a.cron_schedule}</span>
                                </span>
                              )}
                              {c && (
                                <span>
                                  recent:{' '}
                                  <span className="font-mono">
                                    {c.runs} runs, {c.failed} fail, {c.needsHuman} need-human
                                  </span>
                                </span>
                              )}
                            </div>
                          </div>
                          {a.status === 'active' && a.trigger === 'cron' && (
                            <AgentTriggerButton agentId={a.id} />
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </CardContent>
              </Card>
            )
          })}

          {/* Recent runs */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Recent runs ({runs.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {runs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No agent runs yet. They&apos;ll appear here as the fleet executes.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-[11px] text-muted-foreground uppercase tracking-wider">
                      <tr className="border-b border-border">
                        <th className="py-2 pr-3">Agent</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">Target</th>
                        <th className="py-2 pr-3">Model</th>
                        <th className="py-2 pr-3 text-right">Latency</th>
                        <th className="py-2 pr-3 text-right">Tokens (in/out)</th>
                        <th className="py-2 pr-3">Age</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {runs.map((r) => (
                        <tr key={r.id} className="align-top">
                          <td className="py-2 pr-3 font-mono text-[11px]">
                            {r.agent_id}
                            {r.recommendation && (
                              <div className="mt-0.5 text-[10px] text-violet-700">
                                rec:{' '}
                                {(r.recommendation as { kind?: string })?.kind ?? 'present'}
                              </div>
                            )}
                            {r.error_message && (
                              <div className="mt-0.5 text-[10px] text-rose-700 line-clamp-2 max-w-md">
                                err: {r.error_message}
                              </div>
                            )}
                          </td>
                          <td className={`py-2 pr-3 ${RUN_STATUS_TINT[r.status] ?? ''}`}>
                            {r.status}
                          </td>
                          <td className="py-2 pr-3 font-mono text-[11px]">
                            {r.target_kind ? `${r.target_kind}:${r.target_id?.slice(0, 8)}` : '—'}
                          </td>
                          <td className="py-2 pr-3 font-mono text-[11px]">
                            {r.provider && r.model ? `${r.provider}/${r.model}` : '—'}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono text-[11px]">
                            {formatLatency(r.latency_ms)}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono text-[11px]">
                            {formatTokens(r.tokens_in, r.tokens_out)}
                          </td>
                          <td className="py-2 pr-3 text-[11px] text-muted-foreground">
                            {formatAge(ageMinutes(r.created_at))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
