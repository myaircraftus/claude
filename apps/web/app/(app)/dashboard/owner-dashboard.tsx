/**
 * Owner Dashboard — the persona-specific home screen for aircraft owners.
 *
 * Presentational server component: all data is fetched in dashboard/page.tsx
 * and passed in. Shop/admin personas never see this — they get the existing
 * operations <Dashboard />.
 */
import Link from '@/components/shared/tenant-link'
import {
  Plane, ClipboardCheck, AlertTriangle, Wrench, FileText, Receipt,
  BookOpen, ArrowRight, Activity, Mailbox,
} from 'lucide-react'
import { Topbar } from '@/components/shared/topbar'
import type { OrganizationOperationType } from '@/types'
import { OperationModules } from './operation-modules'

export interface OwnerDashboardData {
  firstName: string
  counts: { aircraft: number; approvals: number; squawks: number; workOrders: number }
  aircraft: Array<{ id: string; tail: string; detail: string; lastLogbook: string | null }>
  activity: Array<{
    kind: 'estimate' | 'invoice' | 'work_order' | 'squawk'
    label: string
    tail: string | null
    when: string
  }>
  approvals: Array<{ id: string; subject: string; tail: string | null; sentDate: string | null }>
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return ''
  if (ms < 60_000) return 'just now'
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`
  if (ms < 2 * 86_400_000) return 'Yesterday'
  return `${Math.round(ms / 86_400_000)}d ago`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = iso.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}` : '—'
}

const ACTIVITY_ICON = {
  estimate: FileText,
  invoice: Receipt,
  work_order: Wrench,
  squawk: AlertTriangle,
} as const

export function OwnerDashboard({
  profile,
  data,
  organizationId,
  operationType,
}: {
  profile: any
  data: OwnerDashboardData
  organizationId: string
  operationType: OrganizationOperationType
}) {
  const { counts } = data

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Dashboard' }]} />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6 space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-[24px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
              {greeting()}, {data.firstName}
            </h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">Here&apos;s your fleet overview</p>
          </div>

          {/* ROW 1 — summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard href="/aircraft" icon={<Plane className="h-4 w-4 text-blue-700" />} bg="bg-blue-50" label="My Aircraft" value={counts.aircraft} />
            <StatCard href="/approvals" icon={<ClipboardCheck className="h-4 w-4 text-amber-700" />} bg="bg-amber-50" label="Pending Approvals" value={counts.approvals} />
            <StatCard href="/squawks" icon={<AlertTriangle className="h-4 w-4 text-rose-700" />} bg="bg-rose-50" label="Open Squawks" value={counts.squawks} />
            <StatCard href="/work-orders" icon={<Wrench className="h-4 w-4 text-indigo-700" />} bg="bg-indigo-50" label="Active Work Orders" value={counts.workOrders} />
          </div>

          {/* ROW 1.5 — operation-type-aware dashboard modules (SOP-DOC-001 Item 4) */}
          <OperationModules organizationId={organizationId} operationType={operationType} />

          {/* ROW 2 — My Aircraft */}
          <section>
            <h2 className="text-[14px] text-foreground mb-2" style={{ fontWeight: 700 }}>My Aircraft</h2>
            {data.aircraft.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center text-[12.5px] text-muted-foreground">
                No aircraft yet.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.aircraft.map((ac) => (
                  <div key={ac.id} className="rounded-2xl border border-border bg-white p-4 flex flex-col">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                        <Plane className="h-4 w-4 text-blue-700" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[15px] text-foreground truncate" style={{ fontWeight: 700 }}>{ac.tail}</div>
                        <div className="text-[11.5px] text-muted-foreground truncate">{ac.detail}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                      <BookOpen className="h-3.5 w-3.5" />
                      Last logbook: <span className="text-foreground">{fmtDate(ac.lastLogbook)}</span>
                    </div>
                    <Link
                      href={`/aircraft/${ac.id}`}
                      className="mt-3 inline-flex items-center justify-center gap-1.5 h-9 rounded-md border border-border text-[13px] text-foreground hover:bg-muted/50 transition-colors"
                      style={{ fontWeight: 600 }}
                    >
                      View Aircraft
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ROW 3 — Recent activity */}
          <section>
            <h2 className="text-[14px] text-foreground mb-2 flex items-center gap-1.5" style={{ fontWeight: 700 }}>
              <Activity className="h-4 w-4 text-muted-foreground" /> Recent Activity
            </h2>
            <div className="rounded-2xl border border-border bg-white">
              {data.activity.length === 0 ? (
                <p className="px-4 py-6 text-[12.5px] text-muted-foreground text-center">No recent activity.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.activity.map((a, i) => {
                    const Icon = ACTIVITY_ICON[a.kind]
                    return (
                      <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-[12.5px] text-foreground flex-1 min-w-0 truncate">{a.label}</span>
                        {a.tail && <span className="text-[11px] text-muted-foreground shrink-0">{a.tail}</span>}
                        <span className="text-[11px] text-muted-foreground shrink-0 w-20 text-right">{relativeTime(a.when)}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>

          {/* ROW 4 — Pending approvals */}
          {data.approvals.length > 0 && (
            <section>
              <h2 className="text-[14px] text-foreground mb-2 flex items-center gap-1.5" style={{ fontWeight: 700 }}>
                <Mailbox className="h-4 w-4 text-amber-600" /> Pending Approvals
              </h2>
              <div className="rounded-2xl border border-amber-200 bg-amber-50/50">
                <ul className="divide-y divide-amber-100">
                  {data.approvals.map((ap) => (
                    <li key={ap.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] text-foreground truncate" style={{ fontWeight: 600 }}>{ap.subject}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {[ap.tail, ap.sentDate ? `sent ${relativeTime(ap.sentDate)}` : null].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <Link
                        href={`/approvals/${ap.id}`}
                        className="inline-flex items-center gap-1 h-8 px-3 rounded-md bg-primary text-primary-foreground text-[12px] hover:bg-primary/90 transition-colors shrink-0"
                        style={{ fontWeight: 600 }}
                      >
                        Review
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="px-4 py-2 border-t border-amber-100">
                  <Link href="/approvals" className="text-[12px] text-primary hover:underline" style={{ fontWeight: 600 }}>
                    View all approvals →
                  </Link>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}

function StatCard({
  href, icon, bg, label, value,
}: {
  href: string
  icon: React.ReactNode
  bg: string
  label: string
  value: number
}) {
  return (
    <Link href={href} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-white hover:border-primary/40 hover:shadow-sm transition-all">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${bg}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[20px] text-foreground leading-none tabular-nums" style={{ fontWeight: 700 }}>{value}</p>
        <p className="text-[11px] text-muted-foreground mt-1">{label}</p>
      </div>
    </Link>
  )
}
