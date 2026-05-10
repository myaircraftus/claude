/**
 * /admin/command-center — Phase 16 Sprint 16.7
 *
 * One page = the morning routine. Pulls from every spine table to
 * render counts + "needs you now" + recent activity + system health
 * card + customer signals card + cost burn card.
 *
 * This becomes the admin homeRoute (override of the old /admin).
 * The legacy /admin page stays for backward-compat with bookmarks.
 */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle, Inbox, Activity, Sparkles, Zap, ArrowRight,
  MessageSquare, Bug, BellRing, Heart, DollarSign,
} from 'lucide-react'
import { Topbar } from '@/components/shared/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AutoRefresh } from './AutoRefresh'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import {
  listOpsInbox,
  countByGroup,
  hasBreachedSla,
} from '@/lib/ops/spine'
import { readTrailing, checkCostSpike } from '@/lib/ops/cost-tracker'
import type { UserProfile } from '@/types'

export const metadata = { title: 'Command Center' }
export const dynamic = 'force-dynamic'

const SEVERITY_TINT: Record<string, string> = {
  P0: 'bg-red-100 text-red-900 border-red-300',
  P1: 'bg-orange-100 text-orange-900 border-orange-300',
  P2: 'bg-amber-100 text-amber-900 border-amber-300',
  P3: 'bg-slate-100 text-slate-700 border-slate-300',
}

function fmtAge(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 60) return `${m}m ago`
  if (m < 60 * 24) return `${Math.round(m / 60)}h ago`
  return `${Math.round(m / (60 * 24))}d ago`
}

function sourceIcon(source_type: string) {
  switch (source_type) {
    case 'support_ticket': return MessageSquare
    case 'error_event': return Bug
    case 'alert_event': return BellRing
    case 'feedback_item': return Heart
    case 'churn_signal': return AlertTriangle
    default: return Activity
  }
}

export default async function CommandCenterPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profileRow } = await supabase.from('user_profiles').select('*').eq('id', user.id).single()
  if (!profileRow) redirect('/login')
  const profile = profileRow as UserProfile
  if (!profile.is_platform_admin) redirect('/dashboard')

  const service = createServiceSupabase()

  // ── Counts (from ops_inbox) ──────────────────────────────────────────
  const [bySource, bySeverity] = await Promise.all([
    countByGroup(service, 'source_type'),
    countByGroup(service, 'severity'),
  ])
  const sourceCounts: Record<string, number> = {}
  for (const r of bySource) sourceCounts[r.group_value] = r.count
  const sevCounts: Record<string, number> = {}
  for (const r of bySeverity) sevCounts[r.group_value] = r.count

  // ── "Needs you now" — P0 + P1 in priority order ─────────────────────
  const { rows: critical } = await listOpsInbox(
    service,
    { severity: ['P0', 'P1'], open_only: true },
    { page_size: 12 },
  )

  // ── "Recent" — last 24h activity feed (any severity) ────────────────
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
  const { rows: recent } = await listOpsInbox(
    service,
    { since, open_only: false },
    { page_size: 15 },
  )

  // ── System health summary card ──────────────────────────────────────
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString()
  const [{ data: workersRaw }, { count: queuedJobs }, { count: failedRecent }] = await Promise.all([
    service
      .from('vision_worker_heartbeat')
      .select('worker_id, last_seen_at, status')
      .neq('status', 'stopping')
      .order('last_seen_at', { ascending: false })
      .limit(10),
    service
      .from('vision_index_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'queued'),
    service
      .from('vision_index_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('updated_at', new Date(Date.now() - 60 * 60_000).toISOString()),
  ])
  const activeWorkers = ((workersRaw ?? []) as Array<{ last_seen_at: string }>)
    .filter((w) => new Date(w.last_seen_at) >= new Date(fiveMinAgo)).length

  const workerHealth: 'green' | 'yellow' | 'red' =
    activeWorkers > 0 ? 'green' : (queuedJobs ?? 0) === 0 ? 'green' : 'red'
  const queueHealth: 'green' | 'yellow' | 'red' =
    (queuedJobs ?? 0) <= 50 ? 'green' : (queuedJobs ?? 0) <= 100 ? 'yellow' : 'red'
  let costSpike: Awaited<ReturnType<typeof checkCostSpike>> | null = null
  try { costSpike = await checkCostSpike(service) } catch { /* tolerate */ }
  const costHealth: 'green' | 'yellow' | 'red' = costSpike?.spike ? 'red' : 'green'

  // ── Cost burn ───────────────────────────────────────────────────────
  let snapshots: Awaited<ReturnType<typeof readTrailing>> = []
  try { snapshots = await readTrailing(service, 7) } catch { /* tolerate */ }
  const todayDate = new Date().toISOString().slice(0, 10)
  const todaySpend = snapshots
    .filter((s) => s.snapshot_date === todayDate)
    .reduce((acc, s) => acc + s.spend_cents, 0)
  const sevenDaySpend = snapshots.reduce((acc, s) => acc + s.spend_cents, 0)

  // ── Customer signals card ───────────────────────────────────────────
  let openChurn = 0
  let negativeFeedback7d = 0
  try {
    const [{ count: churn }, { count: neg }] = await Promise.all([
      service.from('churn_signals').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      service.from('feedback_items').select('id', { count: 'exact', head: true })
        .eq('sentiment', 'negative')
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString()),
    ])
    openChurn = churn ?? 0
    negativeFeedback7d = neg ?? 0
  } catch { /* tables may not yet have rows; tolerate */ }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Command Center' }]} />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* ── HERO ──────────────────────────────────────────── */}
          <div>
            <h1 className="text-3xl tracking-tight" style={{ fontWeight: 700 }}>Your day at a glance</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <CountCard
              label="Tickets awaiting"
              value={sourceCounts['support_ticket'] ?? 0}
              p0={sevCounts['P0'] ?? 0}
              icon={Inbox}
              href="/admin/support/inbox"
              severityNote
            />
            <CountCard
              label="Open errors"
              value={sourceCounts['error_event'] ?? 0}
              icon={Bug}
              href="/admin/observability/errors"
            />
            <CountCard
              label="Active alerts"
              value={sourceCounts['alert_event'] ?? 0}
              icon={BellRing}
              href="/admin/health"
            />
            <CountCard
              label="Negative feedback"
              value={negativeFeedback7d}
              icon={Heart}
              href="/admin/customer-signals"
              subtitle="last 7 days"
            />
          </div>

          {/* ── NEEDS YOU NOW ─────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-orange-500" /> Needs you now
              </CardTitle>
            </CardHeader>
            <CardContent>
              {critical.length === 0 ? (
                <p className="text-sm text-muted-foreground">All P0 + P1 items handled. Nothing urgent right now.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {critical.map((row) => {
                    const Icon = sourceIcon(row.source_type)
                    const breach = hasBreachedSla(row)
                    return (
                      <li key={row.id} className="py-3">
                        <div className="flex items-start gap-3">
                          <span className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-mono ${SEVERITY_TINT[row.severity]}`}>
                            {row.severity}
                          </span>
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm" style={{ fontWeight: 500 }}>{row.summary}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.source_type.replace(/_/g, ' ')} · {fmtAge(row.created_at)}
                              {breach ? ' · SLA BREACH' : ''}
                            </p>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* ── HEALTH + COST + SIGNALS ROW ────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4" /> System health
              </CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <HealthRow label="Workers" health={workerHealth} detail={`${activeWorkers} active`} />
                <HealthRow label="Queue" health={queueHealth} detail={`${queuedJobs ?? 0} queued · ${failedRecent ?? 0} failed/h`} />
                <HealthRow label="Cost" health={costHealth} detail={costSpike?.spike ? '3x spike vs 30d' : 'normal'} />
                <Link href="/admin/health" className="block pt-2 text-xs text-primary hover:underline">View full health →</Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Cost burn
              </CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p className="text-2xl font-mono">${(todaySpend / 100).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">today</p>
                <p className="pt-2 text-sm font-mono">${(sevenDaySpend / 100).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">trailing 7d</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2">
                <Heart className="h-4 w-4" /> Customer signals
              </CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><span className="text-muted-foreground">Churn signals open:</span> <span className="font-mono">{openChurn}</span></p>
                <p><span className="text-muted-foreground">Negative feedback 7d:</span> <span className="font-mono">{negativeFeedback7d}</span></p>
                <Link href="/admin/customer-signals" className="block pt-1 text-xs text-primary hover:underline">View signals →</Link>
              </CardContent>
            </Card>
          </div>

          {/* ── RECENT (24h) ──────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-500" /> Recent activity (24h)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">No new ops events in the last 24 hours.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {recent.map((row) => {
                    const Icon = sourceIcon(row.source_type)
                    return (
                      <li key={row.id} className="py-2 flex items-start gap-3">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{row.summary}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.source_type.replace(/_/g, ' ')} · {row.severity} · {fmtAge(row.created_at)}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* ── QUICK ACTIONS ─────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Quick actions</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <QuickAction href="/admin/support/inbox" label="Triage support" />
              <QuickAction href="/admin/observability/errors" label="View errors" />
              <QuickAction href="/admin/health" label="System health" />
              <QuickAction href="/admin/ops-assistant" label="AI ops assistant" />
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground">
            Auto-refreshes every 30 seconds.
            <span className="ml-2"><AutoRefresh /></span>
          </p>
        </div>
      </main>
    </div>
  )
}

function CountCard({
  label, value, icon: Icon, href, p0, severityNote, subtitle,
}: {
  label: string
  value: number
  icon: typeof Inbox
  href: string
  p0?: number
  severityNote?: boolean
  subtitle?: string
}) {
  return (
    <Link href={href} className="block">
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="text-3xl font-mono mt-1">{value}</p>
              {severityNote && (p0 ?? 0) > 0 && (
                <p className="mt-1 text-xs text-red-700 font-semibold">{p0} P0</p>
              )}
              {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
            </div>
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function HealthRow({ label, health, detail }: { label: string; health: 'green' | 'yellow' | 'red'; detail: string }) {
  const dot = health === 'green' ? 'bg-emerald-500' : health === 'yellow' ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
        {label}
      </span>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </div>
  )
}

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2 text-sm hover:bg-muted/40"
    >
      <span>{label}</span>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
    </Link>
  )
}
