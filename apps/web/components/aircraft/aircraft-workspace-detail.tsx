'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
  MessageSquare,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

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

const tabs: Array<{ id: TabId; label: string; icon: LucideIcon }> = [
  { id: 'overview', label: 'Overview', icon: ClipboardList },
  { id: 'due', label: 'Due List', icon: CalendarDays },
  { id: 'work', label: 'Work Orders', icon: Wrench },
  { id: 'squawks', label: 'Squawks', icon: AlertTriangle },
  { id: 'logbook', label: 'Logbook', icon: FileText },
  { id: 'invoices', label: 'Invoices', icon: Receipt },
  { id: 'documents', label: 'Documents', icon: Upload },
  { id: 'compliance', label: 'Compliance', icon: ShieldCheck },
  { id: 'timeline', label: 'Timeline', icon: History },
  { id: 'ai', label: 'AI Assistant', icon: Bot },
]

const ACTION_ROW_CLASS = 'block w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
const FIELD_CLASS = 'w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
const BTN_PRIMARY_CLASS = 'rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50'
const BTN_SECONDARY_CLASS = 'rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50'

function pill(label: string, tone: 'green' | 'blue' | 'amber' | 'red' | 'slate' = 'slate') {
  const tones = {
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  }
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{label}</span>
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-slate-100 px-4">
        <h2 className="text-sm font-bold text-slate-950">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">{label}</div>
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

export function AircraftWorkspaceDetail({ aircraftId }: { aircraftId: string }) {
  const router = useTenantRouter()
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [timeOpen, setTimeOpen] = useState(false)
  const [dueOpen, setDueOpen] = useState(false)

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
    ? (aircraft.silhouette_style && aircraft.silhouette_style !== 'unknown'
      ? aircraft.silhouette_style
      : inferSilhouetteStyle(aircraft))
    : 'unknown'

  const activeWork = useMemo(
    () => (workspace?.work_orders ?? []).filter((item) => !['closed', 'invoiced', 'paid', 'archived'].includes(item.status)),
    [workspace],
  )
  const openSquawks = useMemo(
    () => (workspace?.squawks ?? []).filter((item) => !['resolved', 'deferred'].includes(item.status)),
    [workspace],
  )
  const upcomingDue = useMemo(
    () => (workspace?.due_items ?? []).filter((item) => ['overdue', 'due_now', 'due_soon', 'upcoming', 'needs_review'].includes(item.status)).slice(0, 6),
    [workspace],
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
        body: JSON.stringify({
          aircraft_workspace_status: nextStatus,
        }),
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

  if (loading) {
    return <main className="p-6 text-sm text-slate-500">Loading aircraft workspace...</main>
  }

  if (error && !workspace) {
    return (
      <main className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </main>
    )
  }

  if (!workspace || !aircraft) {
    return <main className="p-6 text-sm text-slate-500">Aircraft not found.</main>
  }

  const time = workspace.time_snapshot
  const statusLabel = formatWorkspaceStatus(aircraft.aircraft_workspace_status)
  const operationLabel = Array.isArray(aircraft.operation_types) && aircraft.operation_types.length > 0
    ? aircraft.operation_types.join(', ').replace(/_/g, ' ')
    : aircraft.operation_type?.replace(/_/g, ' ') ?? 'Operation not set'

  return (
    <main className="mx-auto w-full max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8">
      {error ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{error}</div>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Link href="/aircraft" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" />
          Back to Aircraft
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/aircraft/${aircraft.id}/edit`}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Pencil className="h-4 w-4" />
            Edit Aircraft
          </Link>
          <div className="relative">
            <button
              type="button"
              onClick={() => setActionsOpen((open) => !open)}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Actions for {aircraft.tail_number}
              <ChevronDown className="h-4 w-4" />
            </button>
            {actionsOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                <Link className={ACTION_ROW_CLASS} href={`/aircraft/${aircraft.id}/edit`}>Edit Aircraft</Link>
                <button className={ACTION_ROW_CLASS} onClick={() => { setTimeOpen(true); setActionsOpen(false) }}>Update Times</button>
                <button className={ACTION_ROW_CLASS} onClick={() => { setDueOpen(true); setActionsOpen(false) }}>Create Due Item</button>
                <button className={ACTION_ROW_CLASS} onClick={() => { generateAiDueList(); setActionsOpen(false) }} disabled={saving}>Generate AI Due List</button>
                <button className={ACTION_ROW_CLASS} onClick={() => { createWorkOrder(); setActionsOpen(false) }} disabled={saving}>Create Work Order</button>
                <Link className={ACTION_ROW_CLASS} href={withAircraftContext(`/aircraft/${aircraft.id}/squawks`, launchContext, { intent: 'new_squawk' })}>Create Squawk</Link>
                <Link className={ACTION_ROW_CLASS} href={withAircraftContext('/estimates', launchContext, { intent: 'new_estimate' })}>Create Estimate</Link>
                <Link className={ACTION_ROW_CLASS} href={withAircraftContext('/invoices', launchContext, { intent: 'new_invoice' })}>Create Invoice</Link>
                <Link className={ACTION_ROW_CLASS} href={withAircraftContext('/logbook-entries', launchContext, { intent: 'new_logbook_entry' })}>Create Logbook Entry</Link>
                <Link className={ACTION_ROW_CLASS} href={withAircraftContext(`/aircraft/${aircraft.id}/documents`, launchContext, { intent: 'upload_document' })}>Upload Document</Link>
                <Link className={ACTION_ROW_CLASS} href={withAircraftContext('/owner/dashboard', launchContext, { intent: 'share_owner_view' })}>Share Owner View</Link>
                <Link className={ACTION_ROW_CLASS} href={withAircraftContext('/reports', launchContext, { package: 'aircraft_history', intent: 'export_aircraft_package' })}>Export Aircraft Package</Link>
                <button className={ACTION_ROW_CLASS} onClick={() => { updateWorkspaceStatus('grounded'); setActionsOpen(false) }} disabled={saving}>Ground Aircraft</button>
                <button className={ACTION_ROW_CLASS} onClick={() => { updateWorkspaceStatus('archived'); setActionsOpen(false) }} disabled={saving}>Archive Aircraft</button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
          {aircraft.primary_photo_url ? (
            <Image
              src={aircraft.primary_photo_url}
              alt={`${aircraft.tail_number} aircraft`}
              width={760}
              height={512}
              unoptimized
              className="h-64 w-full rounded-lg object-cover"
            />
          ) : (
            <AircraftSilhouette tailNumber={aircraft.tail_number} style={silhouetteStyle} className="h-64 w-full" />
          )}

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-4xl font-black tracking-tight text-slate-950">{aircraft.tail_number}</h1>
              {pill(statusLabel, aircraft.aircraft_workspace_status === 'grounded' ? 'red' : 'green')}
              {aircraft.identity_review_status === 'needs_review' ? pill('Identity needs review', 'amber') : null}
            </div>
            <p className="mt-2 text-base font-semibold text-slate-800">
              {[aircraft.year, aircraft.make, aircraft.model].filter(Boolean).join(' ') || 'Aircraft details need review'}
            </p>
            <p className="mt-1 text-sm text-slate-500">S/N {aircraft.serial_number || 'Needs review'}</p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <InfoCard icon={MapPin} label="Base" value={aircraft.home_base || aircraft.base_airport || 'Not set'} />
              <InfoCard icon={Gauge} label="Operation" value={operationLabel} />
              <InfoCard icon={Wrench} label="Program" value={(aircraft.maintenance_program_type || 'Unknown').replace(/_/g, ' ')} />
              <InfoCard icon={DollarSign} label="Payer" value={workspace.maintenance_payer?.name || workspace.maintenance_payer?.company || 'Not assigned'} />
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Metric label="Verified Tach" value={formatHours(time?.verified_tach)} detail={time?.verified_at ? `Verified ${formatDate(time.verified_at)}` : 'No verified entry'} />
              <Metric label="Verified Hobbs" value={formatHours(time?.verified_hobbs)} detail={time?.verified_source || 'No verified entry'} />
              <Metric label="Verified Total Time" value={formatHours(time?.verified_total_time ?? aircraft.total_time_hours)} detail="Official values stay separate from estimates" />
            </div>

            {(time?.estimated_tach || time?.estimated_hobbs) ? (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Estimated from flight activity. Verify aircraft time before compliance signoff or return-to-service use.
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="mb-4 overflow-x-auto border-b border-slate-200 bg-white">
        <div className="flex min-w-max gap-1 px-1">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const selected = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold ${
                  selected
                    ? 'border-blue-700 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {activeTab === 'overview' ? (
        <OverviewTab workspace={workspace} activeWork={activeWork} openSquawks={openSquawks} dueItems={upcomingDue} onGenerateAi={generateAiDueList} />
      ) : null}
      {activeTab === 'due' ? <DueTab items={workspace.due_items} onNew={() => setDueOpen(true)} onGenerateAi={generateAiDueList} /> : null}
      {activeTab === 'work' ? <WorkOrdersTab items={workspace.work_orders} /> : null}
      {activeTab === 'squawks' ? <SquawksTab aircraftId={aircraft.id} items={workspace.squawks} /> : null}
      {activeTab === 'logbook' ? <LogbookTab items={workspace.logbook_entries} /> : null}
      {activeTab === 'invoices' ? <InvoicesTab items={workspace.invoices} /> : null}
      {activeTab === 'documents' ? <DocumentsTab aircraftId={aircraft.id} items={workspace.documents} /> : null}
      {activeTab === 'compliance' ? <ComplianceTab items={workspace.compliance_items} /> : null}
      {activeTab === 'timeline' ? <TimelineTab items={workspace.timeline_events} /> : null}
      {activeTab === 'ai' ? <AiTab items={workspace.ai_suggestions} onGenerateAi={generateAiDueList} /> : null}

      {timeOpen ? (
        <UpdateTimeModal
          aircraftId={aircraft.id}
          onClose={() => setTimeOpen(false)}
          onSaved={() => { setTimeOpen(false); loadWorkspace() }}
        />
      ) : null}
      {dueOpen ? (
        <DueItemModal
          aircraftId={aircraft.id}
          onClose={() => setDueOpen(false)}
          onSaved={() => { setDueOpen(false); loadWorkspace(); setActiveTab('due') }}
        />
      ) : null}
    </main>
  )
}

function InfoCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-2 truncate text-sm font-bold capitalize text-slate-950">{value}</div>
    </div>
  )
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-black text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </div>
  )
}

function OverviewTab({
  workspace,
  activeWork,
  openSquawks,
  dueItems,
  onGenerateAi,
}: {
  workspace: WorkspacePayload
  activeWork: Array<Record<string, any>>
  openSquawks: Array<Record<string, any>>
  dueItems: Array<Record<string, any>>
  onGenerateAi: () => void
}) {
  const complianceOpen = workspace.compliance_items.filter((item) => ['overdue', 'due-soon', 'deferred'].includes(item.status)).length
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Section title="Time & Utilization">
        <div className="grid gap-3">
          <Metric label="Estimated Tach" value={formatHours(workspace.time_snapshot?.estimated_tach)} detail={workspace.time_snapshot?.estimated_source || 'No estimate'} />
          <Metric label="Estimated Hobbs" value={formatHours(workspace.time_snapshot?.estimated_hobbs)} detail={workspace.time_snapshot?.estimate_confidence || 'No estimate'} />
        </div>
      </Section>
      <Section title="Compliance Health">
        <div className="flex items-center justify-between rounded-md border border-slate-200 p-3">
          <div>
            <div className="text-sm font-bold text-slate-950">{complianceOpen === 0 ? 'No open blockers' : `${complianceOpen} open items`}</div>
            <div className="text-xs text-slate-500">Based on aircraft-linked compliance and due items.</div>
          </div>
          {complianceOpen === 0 ? <CheckCircle2 className="h-8 w-8 text-emerald-600" /> : <AlertTriangle className="h-8 w-8 text-amber-600" />}
        </div>
      </Section>
      <Section
        title="AI Insights"
        action={<button onClick={onGenerateAi} className="text-xs font-semibold text-blue-700">Generate</button>}
      >
        <div className="space-y-2 text-sm text-slate-700">
          <p>{workspace.ai_suggestions.length} AI drafts or suggestions are linked to this aircraft.</p>
          <p className="text-slate-500">AI output stays suggested until human accepted.</p>
        </div>
      </Section>

      <Section title="Upcoming Due">
        <DueRows items={dueItems} compact />
      </Section>
      <Section title="Active Work">
        {activeWork.length === 0 ? <EmptyState label="No active work orders." /> : (
          <div className="space-y-2">
            {activeWork.slice(0, 5).map((item) => (
              <Link key={item.id} href={`/work-orders/${item.id}`} className="block rounded-md border border-slate-200 p-3 hover:bg-slate-50">
                <div className="font-mono text-sm font-bold text-blue-700">{item.work_order_number}</div>
                <div className="text-sm text-slate-700">{item.complaint || item.service_type || 'Work order'}</div>
                <div className="mt-1 text-xs text-slate-500">{item.status}</div>
              </Link>
            ))}
          </div>
        )}
      </Section>
      <Section title="Open Squawks">
        {openSquawks.length === 0 ? <EmptyState label="No open squawks." /> : (
          <div className="space-y-2">
            {openSquawks.slice(0, 5).map((item) => (
              <div key={item.id} className="rounded-md border border-slate-200 p-3">
                <div className="text-sm font-bold text-slate-950">{item.title}</div>
                <div className="mt-1 text-xs text-slate-500">{item.severity} · {item.status}</div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

function DueTab({ items, onNew, onGenerateAi }: { items: Array<Record<string, any>>; onNew: () => void; onGenerateAi: () => void }) {
  return (
    <Section
      title="Aircraft Due List"
      action={
        <div className="flex gap-2">
          <button onClick={onGenerateAi} className="rounded-md border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">AI Draft</button>
          <button onClick={onNew} className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800">Add Due</button>
        </div>
      }
    >
      <DueRows items={items} />
    </Section>
  )
}

function DueRows({ items, compact = false }: { items: Array<Record<string, any>>; compact?: boolean }) {
  if (items.length === 0) return <EmptyState label="No due items yet. Generate AI suggestions or add the first due item." />
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
          <tr>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Item</th>
            {!compact ? <th className="py-2 pr-4">ATA/JASC</th> : null}
            <th className="py-2 pr-4">Due by</th>
            {!compact ? <th className="py-2 pr-4">Source</th> : null}
            {!compact ? <th className="py-2 pr-4">Confidence</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => {
            const status = normalizeDueStatus(item.status)
            return (
              <tr key={item.id}>
                <td className="py-3 pr-4"><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span></td>
                <td className="py-3 pr-4">
                  <div className="font-semibold text-slate-950">{item.title}</div>
                  <div className="text-xs text-slate-500">{item.business_category || item.due_basis}</div>
                </td>
                {!compact ? <td className="py-3 pr-4 text-xs text-slate-600">{getReadableTaxonomyLabel(item)}</td> : null}
                <td className="py-3 pr-4 text-slate-700">
                  {item.next_due_date ? formatDate(item.next_due_date) : item.next_due_tach ? `${formatHours(item.next_due_tach)} Tach` : item.next_due_hobbs ? `${formatHours(item.next_due_hobbs)} Hobbs` : 'Needs review'}
                </td>
                {!compact ? <td className="py-3 pr-4 text-slate-600">{String(item.source_type || 'manual').replace(/_/g, ' ')}</td> : null}
                {!compact ? <td className="py-3 pr-4 text-slate-600">{item.confidence || 'unknown'}</td> : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function WorkOrdersTab({ items }: { items: Array<Record<string, any>> }) {
  return (
    <Section title="Work Orders">
      {items.length === 0 ? <EmptyState label="No work orders linked to this aircraft." /> : (
        <div className="space-y-2">
          {items.map((item) => (
            <Link key={item.id} href={`/work-orders/${item.id}`} className="grid gap-2 rounded-md border border-slate-200 p-3 hover:bg-slate-50 md:grid-cols-[180px_1fr_120px]">
              <div className="font-mono font-bold text-blue-700">{item.work_order_number}</div>
              <div className="text-sm text-slate-700">{item.complaint || item.service_type || 'Work order'}</div>
              <div className="text-sm font-semibold text-slate-600">{item.status}</div>
            </Link>
          ))}
        </div>
      )}
    </Section>
  )
}

function SquawksTab({ aircraftId, items }: { aircraftId: string; items: Array<Record<string, any>> }) {
  return (
    <Section title="Aircraft Squawks" action={<Link href={`/aircraft/${aircraftId}/squawks?intent=new_squawk&source_context=aircraft_workspace&aircraft_id=${aircraftId}`} className="text-xs font-semibold text-blue-700">New squawk</Link>}>
      {items.length === 0 ? <EmptyState label="No squawks linked to this aircraft." /> : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-md border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-slate-950">{item.title}</div>
                {pill(`${item.severity || 'normal'} · ${item.status || 'open'}`, item.severity === 'grounding' || item.severity === 'urgent' ? 'red' : 'amber')}
              </div>
              <p className="mt-1 text-sm text-slate-600">{item.description || 'No description recorded.'}</p>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function LogbookTab({ items }: { items: Array<Record<string, any>> }) {
  return <GenericRows title="Logbook Entries" items={items} empty="No logbook entries linked to this aircraft." primary="description" secondary={(item) => `${item.logbook_type || 'logbook'} · ${item.status || 'draft'} · ${getReadableTaxonomyLabel(item)}`} dateKey="entry_date" />
}

function InvoicesTab({ items }: { items: Array<Record<string, any>> }) {
  return <GenericRows title="Invoices" items={items} empty="No invoices linked to this aircraft." primary="invoice_number" secondary={(item) => `${item.status} · $${Number(item.total ?? 0).toFixed(2)}`} dateKey="issue_date" link={(item) => `/invoices/${item.id}`} />
}

function DocumentsTab({ aircraftId, items }: { aircraftId: string; items: Array<Record<string, any>> }) {
  return <GenericRows title="Documents" action={<Link href={`/aircraft/${aircraftId}/documents`} className="text-xs font-semibold text-blue-700">Upload / manage</Link>} items={items} empty="No aircraft documents uploaded." primary="title" secondary={(item) => `${item.doc_type || 'document'} · ${item.parsing_status || 'queued'}`} dateKey="uploaded_at" link={(item) => `/documents/${item.id}`} />
}

function ComplianceTab({ items }: { items: Array<Record<string, any>> }) {
  return <GenericRows title="Compliance" items={items} empty="No compliance items linked to this aircraft." primary="title" secondary={(item) => `${item.status || 'current'} · ${getReadableTaxonomyLabel(item)}`} dateKey="next_due_date" />
}

function TimelineTab({ items }: { items: Array<Record<string, any>> }) {
  return <GenericRows title="Timeline" items={items} empty="No aircraft timeline events yet." primary="title" secondary={(item) => `${item.module} · ${item.summary || item.action}`} dateKey="occurred_at" />
}

function AiTab({ items, onGenerateAi }: { items: Array<Record<string, any>>; onGenerateAi: () => void }) {
  return <GenericRows title="AI Suggestions" action={<button onClick={onGenerateAi} className="text-xs font-semibold text-blue-700">Generate due-list draft</button>} items={items} empty="No AI suggestions yet." primary="title" secondary={(item) => `${item.status} · ${item.confidence} confidence · human review required`} dateKey="created_at" />
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
      {items.length === 0 ? <EmptyState label={empty} /> : (
        <div className="space-y-2">
          {items.map((item) => {
            const content = (
              <div className="grid gap-2 rounded-md border border-slate-200 p-3 md:grid-cols-[1fr_180px]">
                <div>
                  <div className="line-clamp-2 font-semibold text-slate-950">{item[primary] || 'Untitled'}</div>
                  <div className="mt-1 text-sm text-slate-600">{secondary(item)}</div>
                </div>
                <div className="text-sm text-slate-500 md:text-right">{formatDate(item[dateKey])}</div>
              </div>
            )
            return link ? <Link key={item.id} href={link(item)} className="block hover:bg-slate-50">{content}</Link> : <div key={item.id}>{content}</div>
          })}
        </div>
      )}
    </Section>
  )
}

function UpdateTimeModal({ aircraftId, onClose, onSaved }: { aircraftId: string; onClose: () => void; onSaved: () => void }) {
  const [source, setSource] = useState('mechanic_verified')
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
        <textarea className={`${FIELD_CLASS} min-h-20`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Source notes or explanation" />
        {source === 'adsb_estimate' ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">ADS-B is stored as estimated only and never overwrites verified Tach/Hobbs.</div> : null}
        {error ? <div className="text-sm text-red-700">{error}</div> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={BTN_SECONDARY_CLASS}>Cancel</button>
          <button type="submit" disabled={saving} className={BTN_PRIMARY_CLASS}>{saving ? 'Saving...' : 'Save Times'}</button>
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
        <input className={FIELD_CLASS} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Oil change, annual inspection, ELT battery..." required />
        <textarea className={`${FIELD_CLASS} min-h-24`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notes, source, or reminder details" />
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
        {error ? <div className="text-sm text-red-700">{error}</div> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={BTN_SECONDARY_CLASS}>Cancel</button>
          <button type="submit" disabled={saving} className={BTN_PRIMARY_CLASS}>{saving ? 'Saving...' : 'Save Due Item'}</button>
        </div>
      </form>
    </Modal>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="font-bold text-slate-950">{title}</h2>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100">Close</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
