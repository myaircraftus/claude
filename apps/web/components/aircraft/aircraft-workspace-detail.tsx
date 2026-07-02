'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link, { useTenantRouter } from '@/components/shared/tenant-link'
import { AircraftSilhouette } from '@/components/aircraft/aircraft-silhouette'
import {
  buildAircraftLaunchContext,
  formatDate,
  formatHours,
  formatWorkspaceStatus,
  getReadableTaxonomyLabel,
  inferSilhouetteStyle,
  normalizeDueStatus,
} from '@/lib/aircraft/workspace'
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  DollarSign,
  FileText,
  Gauge,
  History,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plane,
  Receipt,
  ShieldCheck,
  Sparkles,
  Upload,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge, type StatusMap } from '@/components/shared/status-badge'
import { ListErrorState } from '@/components/shared/record-list'

type TabId =
  | 'overview'
  | 'due'
  | 'work'
  | 'squawks'
  | 'logbook'
  | 'invoices'
  | 'documents'
  | 'compliance'
  | 'timeline'
  | 'ai'

interface WorkspacePayload {
  aircraft: Record<string, any>
  owner_customer: Record<string, any> | null
  maintenance_payer: Record<string, any> | null
  media: Array<Record<string, any>>
  time_snapshot: Record<string, any> | null
  due_items: Array<Record<string, any>>
  compliance_items: Array<Record<string, any>>
  work_orders: Array<Record<string, any>>
  squawks: Array<Record<string, any>>
  estimates: Array<Record<string, any>>
  invoices: Array<Record<string, any>>
  logbook_entries: Array<Record<string, any>>
  documents: Array<Record<string, any>>
  timeline_events: Array<Record<string, any>>
  ai_suggestions: Array<Record<string, any>>
  counts: Record<string, any>
}

const allTabs: Array<{ id: TabId; label: string; icon: LucideIcon; shopOnly?: boolean }> = [
  { id: 'overview', label: 'Overview', icon: ClipboardList },
  { id: 'due', label: 'Due List', icon: CalendarDays },
  { id: 'work', label: 'Work Orders', icon: Wrench },
  { id: 'squawks', label: 'Squawks', icon: AlertTriangle },
  { id: 'logbook', label: 'Logbook', icon: FileText },
  { id: 'invoices', label: 'Invoices', icon: Receipt },
  { id: 'documents', label: 'Documents', icon: Upload },
  { id: 'compliance', label: 'Compliance', icon: ShieldCheck },
  { id: 'timeline', label: 'Timeline', icon: History },
  { id: 'ai', label: 'AI Assistant', icon: Bot, shopOnly: true },
]

const AIRCRAFT_STATUS: StatusMap = {
  active: { label: 'Active', pill: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  in_maintenance: { label: 'In maintenance', pill: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  grounded: { label: 'Grounded', pill: 'bg-red-50 text-red-700', dot: 'bg-red-500' },
  archived: { label: 'Archived', pill: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' },
}

const SEVERITY_TONE: Record<string, string> = {
  grounding: 'bg-red-50 text-red-700',
  critical: 'bg-red-50 text-red-700',
  urgent: 'bg-red-50 text-red-700',
  high: 'bg-amber-50 text-amber-700',
  medium: 'bg-amber-50 text-amber-700',
  low: 'bg-muted text-muted-foreground',
  normal: 'bg-muted text-muted-foreground',
}

// Owner-friendly squawk status wording — owners shouldn't see shop jargon
// like "in_work_order".
const OWNER_SQUAWK_STATUS: Record<string, string> = {
  open: 'Reported',
  acknowledged: 'Acknowledged',
  in_work_order: 'In progress',
  in_progress: 'In progress',
  resolved: 'Resolved',
  deferred: 'Deferred',
}

const FIELD_CLASS =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30'

/* ─── Coming-due forecast model ──────────────────────────────────────
 * The single most-tracked thing for both personas: what maintenance is
 * coming due and when. We merge the two sources the shop maintains —
 * aircraft_due_items (inspections, oil, AD intervals) and compliance_items
 * (ADs / SBs / life-limited) — into one urgency-ranked list with a plain
 * countdown, so the owner never has to read two tabs to answer "what's next?".
 */
type DueTier = 'overdue' | 'soon' | 'review' | 'ok'

interface DueRow {
  id: string
  title: string
  sub: string
  tier: DueTier
  countdown: string
  sortDays: number
}

const TIER_ORDER: Record<DueTier, number> = { overdue: 0, soon: 1, review: 2, ok: 3 }
const TIER_DOT: Record<DueTier, string> = {
  overdue: 'bg-red-500',
  soon: 'bg-amber-500',
  review: 'bg-slate-400',
  ok: 'bg-emerald-500',
}
const TIER_TEXT: Record<DueTier, string> = {
  overdue: 'text-red-600',
  soon: 'text-amber-600',
  review: 'text-muted-foreground',
  ok: 'text-muted-foreground',
}

function tierOf(status: string | null | undefined): DueTier {
  const s = String(status ?? '').toLowerCase()
  if (s === 'overdue') return 'overdue'
  if (['due_now', 'due-soon', 'due_soon', 'deferred'].includes(s)) return 'soon'
  if (s === 'needs_review') return 'review'
  return 'ok'
}

function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86400000)
}

function dateCountdown(dateStr: string): string {
  const n = daysUntil(dateStr)
  if (n === null) return formatDate(dateStr)
  if (n < 0) return `overdue ${Math.abs(n)}d`
  if (n === 0) return 'due today'
  if (n <= 60) return `${formatDate(dateStr)} · ${n}d`
  return formatDate(dateStr)
}

function hoursCountdown(item: Record<string, any>, currentTach: number | null, currentTotal: number | null): string {
  const target =
    item.next_due_tach != null ? Number(item.next_due_tach)
    : item.next_due_hobbs != null ? Number(item.next_due_hobbs)
    : item.next_due_total != null ? Number(item.next_due_total)
    : null
  if (target == null) return 'needs review'
  const current = item.next_due_tach != null ? currentTach : item.next_due_total != null ? currentTotal : null
  const remaining = current != null ? Math.round(target - current) : null
  return remaining != null ? `${formatHours(target)} · ${remaining} hrs` : `${formatHours(target)}`
}

function buildComingDue(workspace: WorkspacePayload): DueRow[] {
  const currentTach = workspace.time_snapshot?.verified_tach ?? null
  const currentTotal = workspace.time_snapshot?.verified_total_time ?? workspace.aircraft?.total_time_hours ?? null
  const rows: DueRow[] = []

  for (const it of workspace.due_items ?? []) {
    const tier = tierOf(it.status)
    const countdown = it.next_due_date
      ? dateCountdown(it.next_due_date)
      : it.next_due_tach != null || it.next_due_hobbs != null
        ? hoursCountdown(it, currentTach, currentTotal)
        : 'needs review'
    rows.push({
      id: `d-${it.id}`,
      title: it.title || 'Due item',
      sub: it.business_category || (it.due_basis ? `${String(it.due_basis).replace(/_/g, ' ')} basis` : 'Maintenance'),
      tier,
      countdown,
      sortDays: daysUntil(it.next_due_date) ?? 9999,
    })
  }

  for (const it of workspace.compliance_items ?? []) {
    const s = String(it.status ?? '').toLowerCase()
    if (s === 'complied' || s === 'closed' || s === 'n/a') continue
    const tier = tierOf(it.status)
    const countdown = it.next_due_date ? dateCountdown(it.next_due_date) : humanize(it.status || 'tracked')
    rows.push({
      id: `c-${it.id}`,
      title: it.title || 'Compliance item',
      sub: getReadableTaxonomyLabel(it) || 'Compliance',
      tier,
      countdown,
      sortDays: daysUntil(it.next_due_date) ?? 9999,
    })
  }

  rows.sort((a, b) =>
    TIER_ORDER[a.tier] !== TIER_ORDER[b.tier] ? TIER_ORDER[a.tier] - TIER_ORDER[b.tier] : a.sortDays - b.sortDays,
  )
  return rows
}

function humanize(s: string): string {
  const t = String(s).replace(/_/g, ' ').trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t
}

/* ─── Airworthiness summary ──────────────────────────────────────────
 * The owner's first question is always "can I fly it?". This collapses
 * workspace status + grounding squawks + overdue/soon maintenance into a
 * single color-coded banner with the reason. It is a convenience read-out,
 * NOT an airworthiness determination — that is a certificated act.
 */
type BannerTier = 'red' | 'amber' | 'green'

interface AirworthinessSummary {
  tier: BannerTier
  icon: LucideIcon
  title: string
  detail: string
}

const BANNER_STYLE: Record<BannerTier, string> = {
  red: 'border-red-200 bg-red-50 text-red-800',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
}

function airworthiness(
  workspace: WorkspacePayload,
  openSquawks: Array<Record<string, any>>,
  comingDue: DueRow[],
): AirworthinessSummary {
  const status = workspace.aircraft?.aircraft_workspace_status
  if (status === 'grounded') {
    return { tier: 'red', icon: AlertTriangle, title: 'Grounded', detail: 'Marked grounded — not airworthy until the shop clears it.' }
  }
  const grounding = openSquawks.filter((s) => ['grounding', 'critical'].includes(String(s.severity ?? '').toLowerCase())).length
  const overdue = comingDue.filter((d) => d.tier === 'overdue')
  const soon = comingDue.filter((d) => d.tier === 'soon')

  if (grounding > 0) {
    return {
      tier: 'red',
      icon: AlertTriangle,
      title: 'Attention needed',
      detail: `${grounding} grounding squawk${grounding > 1 ? 's' : ''} open — confirm airworthiness with the shop before flight.`,
    }
  }
  if (overdue.length > 0) {
    return {
      tier: 'red',
      icon: AlertTriangle,
      title: 'Overdue maintenance',
      detail: `${overdue.length} item${overdue.length > 1 ? 's are' : ' is'} overdue — not airworthy until cleared.`,
    }
  }
  if (status === 'in_maintenance') {
    return { tier: 'amber', icon: Wrench, title: 'In maintenance', detail: 'Currently in the shop for maintenance.' }
  }
  if (soon.length > 0) {
    const n = soon[0]
    return { tier: 'amber', icon: Clock3, title: 'Airworthy — attention soon', detail: `${n.title} ${n.countdown}.` }
  }
  return { tier: 'green', icon: CheckCircle2, title: 'Airworthy', detail: 'No open blockers or overdue items.' }
}

function openBalance(workspace: WorkspacePayload): number {
  return (workspace.invoices ?? [])
    .filter((i) => !['paid', 'void', 'writeoff'].includes(String(i.status ?? '').toLowerCase()))
    .reduce((sum, i) => sum + Number(i.balance_due ?? 0), 0)
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`
}

function Pill({ tone = 'muted', children }: { tone?: 'amber' | 'red' | 'muted'; children: React.ReactNode }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    muted: 'bg-muted text-muted-foreground',
  }
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold', tones[tone])}>
      {children}
    </span>
  )
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-4">
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {label}
    </div>
  )
}

function withAircraftContext(
  path: string,
  context: ReturnType<typeof buildAircraftLaunchContext> | null,
  extra: Record<string, string | number | null | undefined> = {},
) {
  const params = new URLSearchParams()
  if (context) {
    for (const [key, value] of Object.entries(context)) {
      if (value !== null && value !== undefined && value !== '') params.set(key, String(value))
    }
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value !== null && value !== undefined && value !== '') params.set(key, String(value))
  }
  const query = params.toString()
  if (!query) return path
  return `${path}${path.includes('?') ? '&' : '?'}${query}`
}

export function AircraftWorkspaceDetail({ aircraftId, isOwner = false }: { aircraftId: string; isOwner?: boolean }) {
  const router = useTenantRouter()
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timeOpen, setTimeOpen] = useState(false)
  const [dueOpen, setDueOpen] = useState(false)

  const tabs = useMemo(() => allTabs.filter((tab) => !tab.shopOnly || !isOwner), [isOwner])

  const loadWorkspace = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/workspace`, { cache: 'no-store' })
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error ?? 'Unable to load aircraft workspace')
      setWorkspace(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load aircraft workspace')
    } finally {
      setLoading(false)
    }
  }, [aircraftId])

  useEffect(() => {
    loadWorkspace()
  }, [loadWorkspace])

  const aircraft = workspace?.aircraft
  const launchContext = aircraft ? buildAircraftLaunchContext(aircraft as any) : null
  const silhouetteStyle = aircraft
    ? aircraft.silhouette_style && aircraft.silhouette_style !== 'unknown'
      ? aircraft.silhouette_style
      : inferSilhouetteStyle(aircraft)
    : 'unknown'

  const activeWork = useMemo(
    () => (workspace?.work_orders ?? []).filter((item) => !['closed', 'invoiced', 'paid', 'archived'].includes(item.status)),
    [workspace],
  )
  const openSquawks = useMemo(
    () => (workspace?.squawks ?? []).filter((item) => !['resolved', 'deferred'].includes(item.status)),
    [workspace],
  )
  const comingDue = useMemo(() => (workspace ? buildComingDue(workspace) : []), [workspace])
  const balance = useMemo(() => (workspace ? openBalance(workspace) : 0), [workspace])
  const air = useMemo(
    () => (workspace ? airworthiness(workspace, openSquawks, comingDue) : null),
    [workspace, openSquawks, comingDue],
  )

  async function createWorkOrder() {
    if (!aircraft) return
    setSaving(true)
    try {
      const res = await fetch('/api/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft_id: aircraft.id,
          customer_id: aircraft.maintenance_payer_customer_id ?? aircraft.owner_customer_id ?? null,
          status: 'open',
          service_type: 'Maintenance',
          complaint: `Work order opened from aircraft workspace for ${aircraft.tail_number}`,
          source_context: launchContext,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Failed to create work order')
      router.push(`/work-orders/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create work order')
    } finally {
      setSaving(false)
    }
  }

  async function generateAiDueList() {
    setSaving(true)
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/ai-due-list`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Failed to generate due list')
      setActiveTab('due')
      await loadWorkspace()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate due list')
    } finally {
      setSaving(false)
    }
  }

  async function updateWorkspaceStatus(nextStatus: 'active' | 'in_maintenance' | 'grounded' | 'archived') {
    if (!aircraft) return
    const label = formatWorkspaceStatus(nextStatus)
    const needsConfirm = nextStatus === 'grounded' || nextStatus === 'archived'
    if (needsConfirm && !window.confirm(`Set ${aircraft.tail_number} to ${label}?`)) return

    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/aircraft/${aircraft.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aircraft_workspace_status: nextStatus }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? `Failed to set aircraft ${label}`)
      await loadWorkspace()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to set aircraft ${label}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <WorkspaceSkeleton />

  if (error && !workspace) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8">
          <ListErrorState message={error} onRetry={loadWorkspace} />
        </div>
      </div>
    )
  }

  if (!workspace || !aircraft || !air) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-[1480px] px-4 py-10 text-center text-sm text-muted-foreground">
          Aircraft not found.
        </div>
      </div>
    )
  }

  const nextDue = comingDue[0] ?? null
  const groundingCount = openSquawks.filter((s) => ['grounding', 'critical'].includes(String(s.severity ?? '').toLowerCase())).length
  const time = workspace.time_snapshot
  const totalTime = time?.verified_total_time ?? aircraft.total_time_hours

  return (
    <div className="h-full overflow-y-auto">
    <div className="mx-auto w-full max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8">
      {error ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{error}</div>
      ) : null}

      {/* Header — back + persona actions */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          href="/aircraft"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back to Aircraft</span>
          <span className="sm:hidden">Aircraft</span>
        </Link>

        <div className="flex items-center gap-2">
          {isOwner ? (
            <>
              <Link
                href={withAircraftContext(`/aircraft/${aircraft.id}/squawks`, launchContext, { intent: 'new_squawk' })}
                className={cn(buttonVariants({ size: 'sm' }))}
              >
                <AlertTriangle className="h-4 w-4" />
                Report a squawk
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="More actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onSelect={() => setTimeOpen(true)}>
                    <Clock3 className="h-4 w-4" />
                    Update times
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      router.push(
                        withAircraftContext(`/aircraft/${aircraft.id}/documents`, launchContext, {
                          intent: 'upload_document',
                        }),
                      )
                    }
                  >
                    <Upload className="h-4 w-4" />
                    Upload document
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Link
                href={`/aircraft/${aircraft.id}/edit`}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >
                <Pencil className="h-4 w-4" />
                <span className="hidden sm:inline">Edit aircraft</span>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm">
                    Actions
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel className="font-mono">{aircraft.tail_number}</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => router.push(`/aircraft/${aircraft.id}/intelligence`)}>
                    <Sparkles className="h-4 w-4" />
                    Aircraft intelligence
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setTimeOpen(true)}>Update times</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setDueOpen(true)}>Create due item</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => generateAiDueList()} disabled={saving}>
                    Generate AI due list
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => createWorkOrder()} disabled={saving}>
                    Create work order
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      router.push(
                        withAircraftContext(`/aircraft/${aircraft.id}/squawks`, launchContext, { intent: 'new_squawk' }),
                      )
                    }
                  >
                    Create squawk
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => router.push(withAircraftContext('/estimates', launchContext, { intent: 'new_estimate' }))}
                  >
                    Create estimate
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => router.push(withAircraftContext('/invoices', launchContext, { intent: 'new_invoice' }))}
                  >
                    Create invoice
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      router.push(withAircraftContext('/logbook-entries', launchContext, { intent: 'new_logbook_entry' }))
                    }
                  >
                    Create logbook entry
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      router.push(
                        withAircraftContext(`/aircraft/${aircraft.id}/documents`, launchContext, {
                          intent: 'upload_document',
                        }),
                      )
                    }
                  >
                    Upload document
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      router.push(withAircraftContext('/owner/dashboard', launchContext, { intent: 'share_owner_view' }))
                    }
                  >
                    Share owner view
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      router.push(
                        withAircraftContext('/reports', launchContext, {
                          package: 'aircraft_history',
                          intent: 'export_aircraft_package',
                        }),
                      )
                    }
                  >
                    Export aircraft package
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => updateWorkspaceStatus('grounded')}
                    disabled={saving}
                    className="text-amber-700 focus:text-amber-700"
                  >
                    Ground aircraft
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => updateWorkspaceStatus('archived')}
                    disabled={saving}
                    className="text-destructive focus:text-destructive"
                  >
                    Archive aircraft
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      {/* Identity row */}
      <div className="mb-3 flex items-center gap-3">
        {aircraft.primary_photo_url ? (
          <Image
            src={aircraft.primary_photo_url}
            alt={`${aircraft.tail_number} aircraft`}
            width={128}
            height={96}
            unoptimized
            className="h-12 w-16 shrink-0 rounded-lg object-cover sm:h-14 sm:w-20"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 sm:h-14 sm:w-14">
            <Plane className="h-6 w-6" />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-black tracking-tight text-foreground sm:text-3xl">{aircraft.tail_number}</h1>
            <StatusBadge map={AIRCRAFT_STATUS} status={aircraft.aircraft_workspace_status ?? 'active'} className="text-[11px]" />
            {aircraft.identity_review_status === 'needs_review' ? <Pill tone="amber">Identity needs review</Pill> : null}
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {[aircraft.year, aircraft.make, aircraft.model].filter(Boolean).join(' ') || 'Aircraft details need review'}
            {aircraft.serial_number ? ` · S/N ${aircraft.serial_number}` : ''}
          </p>
        </div>
      </div>

      {/* Airworthiness banner */}
      <div className={cn('mb-4 flex items-start gap-3 rounded-xl border p-3.5', BANNER_STYLE[air.tier])}>
        <air.icon className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-bold">{air.title}</div>
          <div className="text-sm">{air.detail}</div>
        </div>
      </div>

      {/* Vitals strip */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <VitalTile
          icon={CalendarClock}
          label="Next due"
          value={nextDue ? nextDue.title : 'Nothing due'}
          sub={nextDue ? nextDue.countdown : 'All clear'}
          tone={nextDue ? (nextDue.tier === 'overdue' ? 'red' : nextDue.tier === 'soon' ? 'amber' : 'default') : 'default'}
        />
        <VitalTile
          icon={Gauge}
          label="Total time"
          value={formatHours(totalTime)}
          sub={time?.verified_at ? `Verified ${formatDate(time.verified_at)}` : 'No verified entry'}
        />
        <VitalTile
          icon={AlertTriangle}
          label="Open squawks"
          value={String(workspace.counts?.open_squawks ?? openSquawks.length)}
          sub={groundingCount > 0 ? `${groundingCount} grounding` : 'none grounding'}
          tone={groundingCount > 0 ? 'red' : 'default'}
        />
        {isOwner ? (
          <VitalTile
            icon={Receipt}
            label="Balance due"
            value={money(balance)}
            sub={balance > 0 ? `${workspace.counts?.open_invoices ?? ''} invoice open`.trim() : 'Up to date'}
            tone={balance > 0 ? 'accent' : 'default'}
          />
        ) : (
          <VitalTile
            icon={Wrench}
            label="Active work"
            value={String(workspace.counts?.open_work_orders ?? activeWork.length)}
            sub={activeWork.length > 0 ? 'in progress' : 'none open'}
            tone={activeWork.length > 0 ? 'accent' : 'default'}
          />
        )}
      </div>

      {/* Tabs */}
      <TabNav tabs={tabs} activeTab={activeTab} onSelect={setActiveTab} />

      {activeTab === 'overview' ? (
        <OverviewTab
          workspace={workspace}
          aircraft={aircraft}
          silhouetteStyle={silhouetteStyle}
          activeWork={activeWork}
          openSquawks={openSquawks}
          comingDue={comingDue}
          balance={balance}
          onGenerateAi={generateAiDueList}
          isOwner={isOwner}
        />
      ) : null}
      {activeTab === 'due' ? <DueTab items={workspace.due_items} onNew={() => setDueOpen(true)} onGenerateAi={generateAiDueList} isOwner={isOwner} /> : null}
      {activeTab === 'work' ? <WorkOrdersTab items={workspace.work_orders} /> : null}
      {activeTab === 'squawks' ? <SquawksTab aircraftId={aircraft.id} items={workspace.squawks} isOwner={isOwner} /> : null}
      {activeTab === 'logbook' ? <LogbookTab items={workspace.logbook_entries} /> : null}
      {activeTab === 'invoices' ? <InvoicesTab items={workspace.invoices} /> : null}
      {activeTab === 'documents' ? <DocumentsTab aircraftId={aircraft.id} items={workspace.documents} /> : null}
      {activeTab === 'compliance' ? <ComplianceTab items={workspace.compliance_items} /> : null}
      {activeTab === 'timeline' ? <TimelineTab items={workspace.timeline_events} /> : null}
      {activeTab === 'ai' && !isOwner ? <AiTab items={workspace.ai_suggestions} onGenerateAi={generateAiDueList} /> : null}

      {timeOpen ? (
        <UpdateTimeModal
          aircraftId={aircraft.id}
          defaultSource={isOwner ? 'owner_entered' : 'mechanic_verified'}
          onClose={() => setTimeOpen(false)}
          onSaved={() => {
            setTimeOpen(false)
            loadWorkspace()
          }}
        />
      ) : null}
      {dueOpen ? (
        <DueItemModal
          aircraftId={aircraft.id}
          onClose={() => setDueOpen(false)}
          onSaved={() => {
            setDueOpen(false)
            loadWorkspace()
            setActiveTab('due')
          }}
        />
      ) : null}
    </div>
    </div>
  )
}

function VitalTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'default',
}: {
  icon: LucideIcon
  label: string
  value: string
  sub?: string
  tone?: 'default' | 'amber' | 'red' | 'accent'
}) {
  const subTone =
    tone === 'amber' ? 'text-amber-600' : tone === 'red' ? 'text-red-600' : tone === 'accent' ? 'text-primary' : 'text-muted-foreground'
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1.5 truncate text-xl font-bold text-foreground">{value}</div>
      {sub ? <div className={cn('mt-0.5 truncate text-xs font-medium', subTone)}>{sub}</div> : null}
    </div>
  )
}

function ComingDueList({ items, emptyLabel, limit = 8 }: { items: DueRow[]; emptyLabel: string; limit?: number }) {
  if (items.length === 0) return <EmptyState label={emptyLabel} />
  return (
    <div className="space-y-2.5">
      {items.slice(0, limit).map((r) => (
        <div key={r.id} className="flex items-center gap-3">
          <span className={cn('h-2 w-2 shrink-0 rounded-full', TIER_DOT[r.tier])} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-foreground">{r.title}</div>
            <div className="truncate text-xs text-muted-foreground">{r.sub}</div>
          </div>
          <span className={cn('shrink-0 whitespace-nowrap text-xs font-medium', TIER_TEXT[r.tier])}>{r.countdown}</span>
        </div>
      ))}
    </div>
  )
}

function TabNav({ tabs, activeTab, onSelect }: { tabs: typeof allTabs; activeTab: TabId; onSelect: (id: TabId) => void }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [fade, setFade] = useState({ left: false, right: false })

  const updateFade = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    setFade({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    })
  }, [])

  useEffect(() => {
    updateFade()
    window.addEventListener('resize', updateFade)
    return () => window.removeEventListener('resize', updateFade)
  }, [updateFade, tabs.length])

  useEffect(() => {
    const el = scrollerRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [activeTab])

  return (
    <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="relative">
        {fade.left ? (
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-background to-transparent" />
        ) : null}
        {fade.right ? (
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-background to-transparent" />
        ) : null}
        <div
          ref={scrollerRef}
          onScroll={updateFade}
          className="flex gap-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon
            const selected = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                data-active={selected}
                onClick={() => onSelect(tab.id)}
                className={cn(
                  'flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors',
                  selected ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function InfoCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-2 truncate text-sm font-bold capitalize text-foreground">{value}</div>
    </div>
  )
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-black text-foreground">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  )
}

function OverviewTab({
  workspace,
  aircraft,
  silhouetteStyle,
  activeWork,
  openSquawks,
  comingDue,
  balance,
  onGenerateAi,
  isOwner,
}: {
  workspace: WorkspacePayload
  aircraft: Record<string, any>
  silhouetteStyle: string
  activeWork: Array<Record<string, any>>
  openSquawks: Array<Record<string, any>>
  comingDue: DueRow[]
  balance: number
  onGenerateAi: () => void
  isOwner: boolean
}) {
  const time = workspace.time_snapshot
  const operationLabel =
    Array.isArray(aircraft.operation_types) && aircraft.operation_types.length > 0
      ? aircraft.operation_types.join(', ').replace(/_/g, ' ')
      : aircraft.operation_type?.replace(/_/g, ' ') ?? 'Operation not set'
  const openInvoices = (workspace.invoices ?? []).filter((i) => !['paid', 'void', 'writeoff'].includes(String(i.status ?? '').toLowerCase()))

  return (
    <div className="space-y-4">
      {/* Primary row — forecast + live work */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section
            title="Coming due"
            action={
              isOwner ? undefined : (
                <button onClick={onGenerateAi} className="text-xs font-semibold text-primary hover:underline">
                  AI draft
                </button>
              )
            }
          >
            <ComingDueList
              items={comingDue}
              emptyLabel={
                isOwner
                  ? 'Nothing on file yet. The shop adds inspection and AD intervals as they’re identified.'
                  : 'No due items yet. Generate an AI draft or add the first item from the Due List tab.'
              }
            />
          </Section>
        </div>
        <div className="space-y-4">
          <Section title="Active work">
            {activeWork.length === 0 ? (
              <EmptyState label="No active work orders." />
            ) : (
              <div className="space-y-2">
                {activeWork.slice(0, 4).map((item) => (
                  <Link key={item.id} href={`/work-orders/${item.id}`} className="block rounded-lg border border-border p-3 transition-colors hover:bg-muted/40">
                    <div className="font-mono text-sm font-bold text-primary">{item.work_order_number}</div>
                    <div className="truncate text-sm text-foreground">{item.complaint || item.service_type || 'Work order'}</div>
                    <div className="mt-1 text-xs capitalize text-muted-foreground">{String(item.status || '').replace(/_/g, ' ')}</div>
                  </Link>
                ))}
              </div>
            )}
          </Section>
          <Section title={isOwner ? 'Your squawks' : 'Open squawks'}>
            {openSquawks.length === 0 ? (
              <EmptyState label="No open squawks." />
            ) : (
              <div className="space-y-2">
                {openSquawks.slice(0, 4).map((item) => {
                  const statusLabel = isOwner
                    ? OWNER_SQUAWK_STATUS[item.status] ?? 'In progress'
                    : String(item.status || 'open').replace(/_/g, ' ')
                  return (
                    <div key={item.id} className="rounded-lg border border-border p-3">
                      <div className="truncate text-sm font-bold text-foreground">{item.title}</div>
                      <div className="mt-1 text-xs capitalize text-muted-foreground">
                        {item.severity || 'normal'} · {statusLabel}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Section>
        </div>
      </div>

      {/* Secondary row — times, details, billing/AI */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Section title="Aircraft times">
          <div className="grid gap-3">
            <Metric label="Verified Tach" value={formatHours(time?.verified_tach)} detail={time?.verified_at ? `Verified ${formatDate(time.verified_at)}` : 'No verified entry'} />
            <Metric label="Verified Hobbs" value={formatHours(time?.verified_hobbs)} detail={time?.verified_source || 'No verified entry'} />
            <Metric label="Verified Total Time" value={formatHours(time?.verified_total_time ?? aircraft.total_time_hours)} detail="Official values stay separate from estimates" />
          </div>
          {time?.estimated_tach || time?.estimated_hobbs ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Estimated from flight activity. Verify before compliance signoff or return-to-service.
            </div>
          ) : null}
        </Section>

        <Section title="Aircraft details">
          {aircraft.primary_photo_url ? (
            <Image
              src={aircraft.primary_photo_url}
              alt={`${aircraft.tail_number} aircraft`}
              width={640}
              height={360}
              unoptimized
              className="mb-3 h-32 w-full rounded-lg object-cover"
            />
          ) : (
            <AircraftSilhouette tailNumber={aircraft.tail_number} style={silhouetteStyle} className="mb-3 h-32 w-full" />
          )}
          <div className="grid grid-cols-2 gap-3">
            <InfoCard icon={MapPin} label="Base" value={aircraft.home_base || aircraft.base_airport || 'Not set'} />
            <InfoCard icon={Gauge} label="Operation" value={operationLabel} />
            <InfoCard icon={Wrench} label="Program" value={(aircraft.maintenance_program_type || 'Unknown').replace(/_/g, ' ')} />
            <InfoCard icon={DollarSign} label="Payer" value={workspace.maintenance_payer?.name || workspace.maintenance_payer?.company || 'Not assigned'} />
          </div>
        </Section>

        {isOwner ? (
          <Section title="Billing" action={<Link href="/invoices" className="text-xs font-semibold text-primary hover:underline">View all</Link>}>
            <div className="rounded-lg border border-border p-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Balance due</div>
              <div className="mt-1 text-2xl font-black text-foreground">{money(balance)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {openInvoices.length > 0 ? `${openInvoices.length} open invoice${openInvoices.length > 1 ? 's' : ''}` : 'You’re all paid up.'}
              </div>
            </div>
            {openInvoices.length > 0 ? (
              <div className="mt-3 space-y-2">
                {openInvoices.slice(0, 3).map((inv) => (
                  <Link key={inv.id} href={`/invoices/${inv.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-sm transition-colors hover:bg-muted/40">
                    <span className="truncate font-mono text-primary">{inv.invoice_number}</span>
                    <span className="shrink-0 font-medium text-foreground">{money(Number(inv.balance_due ?? inv.total ?? 0))}</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </Section>
        ) : (
          <Section title="AI insights" action={<button onClick={onGenerateAi} className="text-xs font-semibold text-primary hover:underline">Generate</button>}>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="text-foreground">{workspace.ai_suggestions.length} AI drafts or suggestions linked to this aircraft.</p>
              <p>AI output stays suggested until a human accepts it.</p>
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

function DueTab({ items, onNew, onGenerateAi, isOwner }: { items: Array<Record<string, any>>; onNew: () => void; onGenerateAi: () => void; isOwner: boolean }) {
  return (
    <Section
      title="Due list — suggestions under review"
      action={
        isOwner ? undefined : (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onGenerateAi}>
              AI Draft
            </Button>
            <Button size="sm" onClick={onNew}>
              Add Due
            </Button>
          </div>
        )
      }
    >
      {/* This tab holds DRAFT due items (AI-suggested / manually added, not
          yet confirmed). The confirmed, dated schedule lives on the
          Compliance tab and the fleet-wide Due List page — two different
          datasets that used to share one name. */}
      <p className="text-xs text-muted-foreground mb-3">
        Drafts awaiting review — confirmed inspections and intervals live in the{' '}
        <span className="font-medium text-foreground">Compliance</span> tab and the fleet-wide{' '}
        <a href="/aircraft/due-list" className="font-medium text-primary hover:underline">Due List</a>.
      </p>
      <DueRows items={items} />
    </Section>
  )
}

function DueRows({ items, compact = false }: { items: Array<Record<string, any>>; compact?: boolean }) {
  if (items.length === 0) return <EmptyState label="No due items yet." />

  const dueBy = (item: Record<string, any>) =>
    item.next_due_date
      ? formatDate(item.next_due_date)
      : item.next_due_tach
        ? `${formatHours(item.next_due_tach)} Tach`
        : item.next_due_hobbs
          ? `${formatHours(item.next_due_hobbs)} Hobbs`
          : 'Needs review'

  return (
    <>
      {/* Desktop — table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Item</th>
              {!compact ? <th className="py-2 pr-4">ATA/JASC</th> : null}
              <th className="py-2 pr-4">Due by</th>
              {!compact ? <th className="py-2 pr-4">Source</th> : null}
              {!compact ? <th className="py-2 pr-4">Confidence</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item) => {
              const status = normalizeDueStatus(item.status)
              return (
                <tr key={item.id}>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="font-semibold text-foreground">{item.title}</div>
                    <div className="text-xs text-muted-foreground">{item.business_category || item.due_basis}</div>
                  </td>
                  {!compact ? <td className="py-3 pr-4 text-xs text-muted-foreground">{getReadableTaxonomyLabel(item)}</td> : null}
                  <td className="py-3 pr-4 text-foreground">{dueBy(item)}</td>
                  {!compact ? <td className="py-3 pr-4 capitalize text-muted-foreground">{String(item.source_type || 'manual').replace(/_/g, ' ')}</td> : null}
                  {!compact ? <td className="py-3 pr-4 text-muted-foreground">{item.confidence || 'unknown'}</td> : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile — cards */}
      <div className="space-y-2.5 md:hidden">
        {items.map((item) => {
          const status = normalizeDueStatus(item.status)
          return (
            <div key={item.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-foreground">{item.title}</div>
                  <div className="text-xs text-muted-foreground">{item.business_category || item.due_basis}</div>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>{status.label}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Due by</span>
                <span className="font-medium text-foreground">{dueBy(item)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function WorkOrdersTab({ items }: { items: Array<Record<string, any>> }) {
  return (
    <Section title="Work Orders">
      {items.length === 0 ? (
        <EmptyState label="No work orders linked to this aircraft." />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/work-orders/${item.id}`}
              className="grid grid-cols-1 gap-1 rounded-lg border border-border p-3 transition-colors hover:bg-muted/40 md:grid-cols-[180px_1fr_140px] md:items-center md:gap-2"
            >
              <div className="font-mono font-bold text-primary">{item.work_order_number}</div>
              <div className="min-w-0 break-words text-sm text-foreground">{item.complaint || item.service_type || 'Work order'}</div>
              <div className="text-sm font-semibold capitalize text-muted-foreground md:text-right">{String(item.status || '').replace(/_/g, ' ')}</div>
            </Link>
          ))}
        </div>
      )}
    </Section>
  )
}

function SquawksTab({ aircraftId, items, isOwner }: { aircraftId: string; items: Array<Record<string, any>>; isOwner: boolean }) {
  return (
    <Section
      title="Aircraft Squawks"
      action={
        <Link
          href={`/aircraft/${aircraftId}/squawks?intent=new_squawk&source_context=aircraft_workspace&aircraft_id=${aircraftId}`}
          className="text-xs font-semibold text-primary hover:underline"
        >
          {isOwner ? 'Report a squawk' : 'New squawk'}
        </Link>
      }
    >
      {items.length === 0 ? (
        <EmptyState label="No squawks linked to this aircraft." />
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const severity = String(item.severity || 'normal')
            const statusLabel = isOwner
              ? OWNER_SQUAWK_STATUS[item.status] ?? 'In progress'
              : String(item.status || 'open').replace(/_/g, ' ')
            return (
              <div key={item.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-foreground">{item.title}</div>
                  <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize', SEVERITY_TONE[severity] ?? SEVERITY_TONE.normal)}>
                    {severity} · {statusLabel}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{item.description || 'No description recorded.'}</p>
              </div>
            )
          })}
        </div>
      )}
    </Section>
  )
}

function LogbookTab({ items }: { items: Array<Record<string, any>> }) {
  return (
    <GenericRows
      title="Logbook Entries"
      items={items}
      empty="No logbook entries linked to this aircraft."
      primary="description"
      secondary={(item) => `${item.logbook_type || 'logbook'} · ${item.status || 'draft'} · ${getReadableTaxonomyLabel(item)}`}
      dateKey="entry_date"
    />
  )
}

function InvoicesTab({ items }: { items: Array<Record<string, any>> }) {
  return (
    <GenericRows
      title="Invoices"
      items={items}
      empty="No invoices linked to this aircraft."
      primary="invoice_number"
      secondary={(item) => `${item.status} · $${Number(item.total ?? 0).toFixed(2)}`}
      dateKey="issue_date"
      link={(item) => `/invoices/${item.id}`}
    />
  )
}

function DocumentsTab({ aircraftId, items }: { aircraftId: string; items: Array<Record<string, any>> }) {
  return (
    <GenericRows
      title="Documents"
      action={
        <Link href={`/aircraft/${aircraftId}/documents`} className="text-xs font-semibold text-primary hover:underline">
          Upload / manage
        </Link>
      }
      items={items}
      empty="No aircraft documents uploaded."
      primary="title"
      secondary={(item) => `${item.doc_type || 'document'} · ${item.parsing_status || 'queued'}`}
      dateKey="uploaded_at"
      link={(item) => `/documents/${item.id}`}
    />
  )
}

function ComplianceTab({ items }: { items: Array<Record<string, any>> }) {
  return (
    <GenericRows
      title="Compliance"
      items={items}
      empty="No compliance items linked to this aircraft."
      primary="title"
      secondary={(item) => `${item.status || 'current'} · ${getReadableTaxonomyLabel(item)}`}
      dateKey="next_due_date"
    />
  )
}

function TimelineTab({ items }: { items: Array<Record<string, any>> }) {
  return (
    <GenericRows
      title="Timeline"
      items={items}
      empty="No aircraft timeline events yet."
      primary="title"
      secondary={(item) => `${item.module} · ${item.summary || item.action}`}
      dateKey="occurred_at"
    />
  )
}

function AiTab({ items, onGenerateAi }: { items: Array<Record<string, any>>; onGenerateAi: () => void }) {
  return (
    <GenericRows
      title="AI Suggestions"
      action={
        <button onClick={onGenerateAi} className="text-xs font-semibold text-primary hover:underline">
          Generate due-list draft
        </button>
      }
      items={items}
      empty="No AI suggestions yet."
      primary="title"
      secondary={(item) => `${item.status} · ${item.confidence} confidence · human review required`}
      dateKey="created_at"
    />
  )
}

function GenericRows({
  title,
  items,
  empty,
  primary,
  secondary,
  dateKey,
  link,
  action,
}: {
  title: string
  items: Array<Record<string, any>>
  empty: string
  primary: string
  secondary: (item: Record<string, any>) => string
  dateKey: string
  link?: (item: Record<string, any>) => string
  action?: React.ReactNode
}) {
  return (
    <Section title={title} action={action}>
      {items.length === 0 ? (
        <EmptyState label={empty} />
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const content = (
              <div className="grid grid-cols-1 gap-1 rounded-lg border border-border p-3 md:grid-cols-[1fr_180px] md:gap-2">
                <div className="min-w-0">
                  <div className="line-clamp-2 font-semibold text-foreground">{item[primary] || 'Untitled'}</div>
                  <div className="mt-1 break-words text-sm capitalize text-muted-foreground">{secondary(item)}</div>
                </div>
                <div className="text-xs text-muted-foreground md:text-right md:text-sm">{formatDate(item[dateKey])}</div>
              </div>
            )
            return link ? (
              <Link key={item.id} href={link(item)} className="block transition-colors hover:bg-muted/40">
                {content}
              </Link>
            ) : (
              <div key={item.id}>{content}</div>
            )
          })}
        </div>
      )}
    </Section>
  )
}

function UpdateTimeModal({
  aircraftId,
  defaultSource,
  onClose,
  onSaved,
}: {
  aircraftId: string
  defaultSource: string
  onClose: () => void
  onSaved: () => void
}) {
  const [source, setSource] = useState(defaultSource)
  const [tach, setTach] = useState('')
  const [hobbs, setHobbs] = useState('')
  const [total, setTotal] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/time`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          tach: tach ? Number(tach) : undefined,
          hobbs: hobbs ? Number(hobbs) : undefined,
          total_time: total ? Number(total) : undefined,
          notes: notes || undefined,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Failed to save time')
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save time')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Update Aircraft Times" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <select value={source} onChange={(event) => setSource(event.target.value)} className={FIELD_CLASS}>
          <option value="mechanic_verified">Mechanic verified</option>
          <option value="owner_entered">Owner entered</option>
          <option value="work_order_closeout">Work order closeout</option>
          <option value="logbook">Logbook</option>
          <option value="airbly">Airbly connected</option>
          <option value="scheduling">Scheduling integration</option>
          <option value="adsb_estimate">ADS-B estimate</option>
        </select>
        <div className="grid gap-3 sm:grid-cols-3">
          <input className={FIELD_CLASS} value={tach} onChange={(e) => setTach(e.target.value)} placeholder="Tach" type="number" step="0.1" />
          <input className={FIELD_CLASS} value={hobbs} onChange={(e) => setHobbs(e.target.value)} placeholder="Hobbs" type="number" step="0.1" />
          <input className={FIELD_CLASS} value={total} onChange={(e) => setTotal(e.target.value)} placeholder="Total time" type="number" step="0.1" />
        </div>
        <textarea className={cn(FIELD_CLASS, 'min-h-20')} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Source notes or explanation" />
        {source === 'adsb_estimate' ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            ADS-B is stored as estimated only and never overwrites verified Tach/Hobbs.
          </div>
        ) : null}
        {error ? <div className="text-sm text-destructive">{error}</div> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save Times'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function DueItemModal({ aircraftId, onClose, onSaved }: { aircraftId: string; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [basis, setBasis] = useState('calendar')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/due-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          status: 'needs_review',
          due_basis: basis,
          next_due_date: date || undefined,
          source_type: 'manual',
          confidence: 'unknown',
          review_state: 'needs_review',
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Failed to save due item')
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save due item')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Create Due Item" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <input className={FIELD_CLASS} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Oil change, annual inspection, ELT battery…" required />
        <textarea className={cn(FIELD_CLASS, 'min-h-24')} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notes, source, or reminder details" />
        <div className="grid gap-3 sm:grid-cols-2">
          <select className={FIELD_CLASS} value={basis} onChange={(e) => setBasis(e.target.value)}>
            <option value="calendar">Calendar</option>
            <option value="tach">Tach</option>
            <option value="hobbs">Hobbs</option>
            <option value="total_time">Total time</option>
            <option value="cycles">Cycles</option>
            <option value="event">Event</option>
          </select>
          <input className={FIELD_CLASS} value={date} onChange={(e) => setDate(e.target.value)} type="date" />
        </div>
        {error ? <div className="text-sm text-destructive">{error}</div> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save Due Item'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl rounded-xl border border-border bg-card shadow-panel" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-bold text-foreground">{title}</h2>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted">
            Close
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function WorkspaceSkeleton() {
  return (
    <div className="h-full overflow-y-auto">
    <div className="mx-auto w-full max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-9" />
        </div>
      </div>
      <div className="mb-3 flex items-center gap-3">
        <Skeleton className="h-12 w-16 rounded-lg" />
        <div>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="mt-2 h-4 w-56" />
        </div>
      </div>
      <Skeleton className="mb-4 h-16 w-full rounded-xl" />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
      <div className="mb-4 flex gap-2 border-b border-border pb-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 w-full rounded-xl lg:col-span-2" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
    </div>
  )
}
