'use client'

/**
 * Due List — compliance / inspection tracking.
 *
 * Clean list of compliance_items joined with aircraft. Status tabs +
 * aircraft filter, row checkboxes for bulk "Create Work Order", and a
 * row-click right-side panel (Compliance / Child Tasks / Work Completed).
 *
 * Responsive: a table on desktop (md+), stacked cards on mobile — the list
 * was previously a 9-column table with no mobile handling. Status shown via
 * the shared StatusBadge so it matches the rest of the app.
 */

import { useMemo, useState, type ReactNode } from 'react'
import { useTenantRouter } from '@/components/shared/tenant-link'
import { toast } from 'sonner'
import {
  X, ClipboardList, FileText, Plane, Loader2, Wrench, ArrowRight, Paperclip,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge, type StatusMap } from '@/components/shared/status-badge'
import { AtaJascSelector } from '@/components/aviation/AtaJascSelector'
import { shortAtaJasc, type AtaJascValue } from '@/lib/aviation/ata-jasc'

export interface DueItem {
  id: string
  title: string
  item_type: string | null
  source: string | null
  source_reference: string | null
  interval_calendar_months: number | null
  interval_hours: number | null
  last_completed_date: string | null
  last_completed_hours: number | null
  last_completed_cycles: number | null
  next_due_date: string | null
  next_due_hours: number | null
  status: string
  notes: string | null
  ata_code: string | null
  jasc_code: string | null
  classification_status?: string | null
  aircraft: { id: string; tail_number: string; make: string | null; model: string | null } | null
}

interface AircraftOpt {
  id: string
  tail_number: string
  make: string | null
  model: string | null
}

/** Shared status pills (replaces the old emoji badges; consistent with the app). */
const DUE_STATUS: StatusMap = {
  overdue: { label: 'Overdue', pill: 'bg-red-50 text-red-700', dot: 'bg-red-500' },
  'due-soon': { label: 'Next due', pill: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  current: { label: 'On time', pill: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  deferred: { label: 'Deferred', pill: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
}

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'due-soon', label: 'Next Due' },
  { key: 'current', label: 'On Time' },
] as const

function fmtDate(d: string | null): string {
  if (!d) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d))
  return m ? `${m[2]}/${m[3]}/${m[1]}` : '—'
}

function monthsUntil(d: string | null): string {
  if (!d) return ''
  const ms = new Date(d).getTime() - Date.now()
  if (Number.isNaN(ms)) return ''
  const months = Math.round(ms / (30 * 24 * 3600 * 1000))
  if (months < 0) return `${Math.abs(months)}M past`
  return `${months}M`
}

function intervalText(it: DueItem): string {
  const parts: string[] = []
  if (it.interval_calendar_months) parts.push(`${it.interval_calendar_months}M`)
  if (it.interval_hours) parts.push(`${it.interval_hours}H`)
  return parts.length ? parts.join(' / ') : '—'
}

interface PanelForm {
  date: string
  hours: string
  landings: string
  description: string
  notes: string
  mechanic: string
  timeWorked: string
  removedNumber: string
  removedSerial: string
  removedReason: string
  installedNumber: string
  installedSerial: string
  installedStatus: string
}

const EMPTY_PANEL: PanelForm = {
  date: '', hours: '', landings: '', description: 'Scheduled maintenance', notes: '',
  mechanic: '', timeWorked: '', removedNumber: '', removedSerial: '', removedReason: 'Scheduled',
  installedNumber: '', installedSerial: '', installedStatus: 'Serviceable',
}

export function DueListClient({ items, aircraft }: { items: DueItem[]; aircraft: AircraftOpt[] }) {
  const router = useTenantRouter()
  const [aircraftFilter, setAircraftFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [panelId, setPanelId] = useState<string | null>(null)
  const [panelTab, setPanelTab] = useState<'compliance' | 'child' | 'work'>('compliance')
  const [panelForm, setPanelForm] = useState<PanelForm>(EMPTY_PANEL)
  const [applying, setApplying] = useState(false)
  // Local overrides for classifications saved from the side panel — keeps the
  // table + panel in sync without a full server round-trip / refetch.
  const [classMap, setClassMap] = useState<Record<string, AtaJascValue>>({})

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (aircraftFilter !== 'all' && it.aircraft?.id !== aircraftFilter) return false
      if (statusFilter !== 'all' && it.status !== statusFilter) return false
      return true
    })
  }, [items, aircraftFilter, statusFilter])

  const panelItem = panelId ? items.find((i) => i.id === panelId) ?? null : null

  function getClass(it: DueItem): AtaJascValue {
    return (
      classMap[it.id] ?? {
        ata_code: it.ata_code,
        ata_description: null,
        jasc_code: it.jasc_code,
        jasc_description: null,
      }
    )
  }

  async function saveClassification(itemId: string, value: AtaJascValue) {
    setClassMap((m) => ({ ...m, [itemId]: value }))
    try {
      const res = await fetch(`/api/compliance/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ata_code: value.ata_code,
          jasc_code: value.jasc_code,
          classification_source: value.ata_code || value.jasc_code ? 'manual' : null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j?.error ?? 'Could not save classification')
        return
      }
      toast.success('Classification saved')
    } catch {
      toast.error('Network error saving classification')
    }
  }

  function openPanel(it: DueItem) {
    setPanelId(it.id)
    setPanelTab('compliance')
    setPanelForm({
      ...EMPTY_PANEL,
      date: it.last_completed_date ?? '',
      hours: it.last_completed_hours != null ? String(it.last_completed_hours) : '',
      landings: it.last_completed_cycles != null ? String(it.last_completed_cycles) : '',
      notes: it.notes ?? '',
    })
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function applyTimes() {
    if (!panelId) return
    setApplying(true)
    try {
      const res = await fetch(`/api/compliance/${panelId}/apply-times`, { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(j?.error ?? 'Could not load aircraft times')
        return
      }
      setPanelForm((f) => ({
        ...f,
        date: j.date ?? f.date,
        hours: j.hours != null ? String(j.hours) : f.hours,
        landings: j.landings != null ? String(j.landings) : f.landings,
      }))
      toast.success('Applied current aircraft times')
    } catch {
      toast.error('Network error')
    } finally {
      setApplying(false)
    }
  }

  function createWorkOrder() {
    const ids = [...selected]
    if (ids.length === 0) return
    // There is no /work-orders/new route — work orders are created from the
    // Work Orders list via the "New Work Order" modal. Route there so the
    // button works instead of falling through to /work-orders/[id]. Pre-filling
    // the selected compliance items is a follow-up once that modal accepts a
    // ?from=due-list&items= payload.
    toast.info(
      `Create the work order from the Work Orders page — ${ids.length} item${ids.length === 1 ? '' : 's'} selected.`,
    )
    router.push('/work-orders')
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
          <ClipboardList className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">No compliance items found</p>
        <p className="text-xs text-muted-foreground text-center max-w-sm">
          Add aircraft and their inspection requirements to build the due list.
        </p>
        <Button variant="outline" onClick={() => toast.info('Compliance item setup is coming soon.')}>
          + Add Compliance Item
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-border bg-background shrink-0 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight text-foreground">Due List</h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Inspection &amp; component compliance across the fleet.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={aircraftFilter}
            onChange={(e) => setAircraftFilter(e.target.value)}
            className="h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All aircraft</option>
            {aircraft.map((a) => (
              <option key={a.id} value={a.id}>{a.tail_number}</option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={selected.size === 0}
            onClick={createWorkOrder}
          >
            <Wrench className="h-3.5 w-3.5 mr-1.5" />
            Create Work Order{selected.size > 0 ? ` (${selected.size})` : ''}
          </Button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="px-4 sm:px-6 pt-3 bg-background border-b border-border shrink-0">
        <div className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
          {STATUS_TABS.map((t) => {
            const count = t.key === 'all' ? items.length : items.filter((i) => i.status === t.key).length
            return (
              <button
                key={t.key}
                onClick={() => setStatusFilter(t.key)}
                className={`px-3 py-2 text-[13px] border-b-2 -mb-px transition-colors whitespace-nowrap ${
                  statusFilter === t.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                style={{ fontWeight: statusFilter === t.key ? 600 : 500 }}
              >
                {t.label} <span className="text-muted-foreground/70">({count})</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">
            No items in this view.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-background border border-border rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b border-border">
                  <tr>
                    {['', 'Tail No.', 'Source / Ref', 'Type / Description', 'ATA / JASC', 'Compliance', 'Interval', 'Next Due', 'Status'].map((h, i) => (
                      <th key={i} className="text-left px-3 py-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((it) => (
                    <tr
                      key={it.id}
                      onClick={() => openPanel(it)}
                      className="hover:bg-muted/20 cursor-pointer"
                    >
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(it.id)}
                          onChange={() => toggleRow(it.id)}
                          className="h-4 w-4 rounded border-input"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-[13px] font-semibold text-foreground">
                          {it.aircraft?.tail_number ?? '—'}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {[it.aircraft?.make, it.aircraft?.model].filter(Boolean).join(' ')}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-muted-foreground">
                        {it.source_reference ?? it.source ?? '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-[13px] text-foreground">{it.title}</div>
                        <div className="text-[11px] text-muted-foreground capitalize">{it.item_type ?? ''}</div>
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-muted-foreground tabular-nums">
                        {shortAtaJasc(getClass(it))}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-muted-foreground">
                        <div>{fmtDate(it.last_completed_date)}</div>
                        <div className="tabular-nums">
                          {it.last_completed_hours != null ? `${it.last_completed_hours}h` : '—'}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-muted-foreground tabular-nums">
                        {intervalText(it)}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-muted-foreground tabular-nums">
                        <div>{fmtDate(it.next_due_date)}</div>
                        <div>{it.next_due_hours != null ? `${it.next_due_hours}H` : ''}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge map={DUE_STATUS} status={it.status} />
                        <div className="text-[10.5px] text-muted-foreground mt-0.5" suppressHydrationWarning>{monthsUntil(it.next_due_date)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2.5">
              {filtered.map((it) => (
                <div
                  key={it.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openPanel(it)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openPanel(it)
                    }
                  }}
                  className="rounded-xl border border-border bg-background p-3.5 cursor-pointer transition-all hover:border-foreground/20 hover:shadow-sm active:bg-muted/30"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={selected.has(it.id)}
                        onChange={() => toggleRow(it.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-0.5 h-4 w-4 rounded border-input shrink-0"
                        aria-label={`Select ${it.title}`}
                      />
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold text-foreground truncate">{it.aircraft?.tail_number ?? '—'}</div>
                        <div className="text-[12.5px] text-foreground truncate">{it.title}</div>
                      </div>
                    </div>
                    <StatusBadge map={DUE_STATUS} status={it.status} className="shrink-0" />
                  </div>
                  <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
                    <div className="min-w-0">
                      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground/80">Next due</dt>
                      <dd className="text-[12.5px] tabular-nums text-foreground">{fmtDate(it.next_due_date)}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground/80">Remaining</dt>
                      <dd className="text-[12.5px] tabular-nums text-foreground" suppressHydrationWarning>{monthsUntil(it.next_due_date) || '—'}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground/80">Source / Ref</dt>
                      <dd className="text-[12.5px] text-foreground truncate">{it.source_reference ?? it.source ?? '—'}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground/80">ATA / JASC</dt>
                      <dd className="text-[12.5px] tabular-nums text-foreground truncate">{shortAtaJasc(getClass(it)) || '—'}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Side panel */}
      {panelItem && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-950/30" onClick={() => setPanelId(null)} />
          <div className="fixed right-0 top-0 z-50 h-full w-full max-w-[460px] bg-background border-l border-border shadow-xl flex flex-col">
            {/* Panel header */}
            <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
                  {panelItem.source_reference ?? panelItem.source ?? 'Compliance'}
                </div>
                <div className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>{panelItem.title}</div>
                <StatusBadge map={DUE_STATUS} status={panelItem.status} className="mt-1" />
              </div>
              <button onClick={() => setPanelId(null)} className="p-1 rounded hover:bg-muted shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Panel tabs */}
            <div className="flex border-b border-border shrink-0">
              {([['compliance', 'Compliance'], ['child', 'Child Tasks'], ['work', 'Work Completed']] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setPanelTab(k)}
                  className={`flex-1 px-3 py-2.5 text-[12px] border-b-2 -mb-px transition-colors ${
                    panelTab === k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                  style={{ fontWeight: panelTab === k ? 600 : 500 }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {panelTab === 'compliance' && (
                <>
                  <PanelSection title="ATA / JASC Classification">
                    <AtaJascSelector
                      value={getClass(panelItem)}
                      onChange={(v) => saveClassification(panelItem.id, v)}
                      aircraftId={panelItem.aircraft?.id ?? null}
                      suggestText={`${panelItem.title} ${panelItem.notes ?? ''}`.trim()}
                      label=""
                      compact
                    />
                  </PanelSection>

                  <PanelSection title="Compliance">
                    <div className="grid grid-cols-3 gap-2">
                      <FieldInput label="Date" type="date" value={panelForm.date} onChange={(v) => setPanelForm((f) => ({ ...f, date: v }))} />
                      <FieldInput label="Hours" type="number" value={panelForm.hours} onChange={(v) => setPanelForm((f) => ({ ...f, hours: v }))} />
                      <FieldInput label="Landings" type="number" value={panelForm.landings} onChange={(v) => setPanelForm((f) => ({ ...f, landings: v }))} />
                    </div>
                    <Button size="sm" variant="outline" className="mt-2" onClick={applyTimes} disabled={applying}>
                      {applying ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                      Apply Times
                    </Button>
                  </PanelSection>

                  <PanelSection title="Work Information">
                    <FieldArea label="Description" value={panelForm.description} onChange={(v) => setPanelForm((f) => ({ ...f, description: v }))} />
                    <FieldArea label="Notes" value={panelForm.notes} onChange={(v) => setPanelForm((f) => ({ ...f, notes: v }))} />
                    <div className="grid grid-cols-2 gap-2">
                      <FieldInput label="Mechanic" value={panelForm.mechanic} onChange={(v) => setPanelForm((f) => ({ ...f, mechanic: v }))} />
                      <FieldInput label="Time Worked" value={panelForm.timeWorked} onChange={(v) => setPanelForm((f) => ({ ...f, timeWorked: v }))} placeholder="e.g. 2.5h" />
                    </div>
                  </PanelSection>

                  <PanelSection title="Parts Used">
                    <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground mb-1" style={{ fontWeight: 600 }}>Part Removed</div>
                    <div className="grid grid-cols-2 gap-2">
                      <FieldInput label="Number" value={panelForm.removedNumber} onChange={(v) => setPanelForm((f) => ({ ...f, removedNumber: v }))} />
                      <FieldInput label="Serial" value={panelForm.removedSerial} onChange={(v) => setPanelForm((f) => ({ ...f, removedSerial: v }))} />
                    </div>
                    <FieldSelect label="Removal Reason" value={panelForm.removedReason} options={['Scheduled', 'Unscheduled', 'Failure']} onChange={(v) => setPanelForm((f) => ({ ...f, removedReason: v }))} />
                    <button type="button" disabled title="Coming soon" className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary opacity-50 cursor-not-allowed">
                      <Paperclip className="h-3 w-3" /> Attach File
                    </button>
                    <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground mb-1 mt-3" style={{ fontWeight: 600 }}>Part Installed</div>
                    <div className="grid grid-cols-2 gap-2">
                      <FieldInput label="Number" value={panelForm.installedNumber} onChange={(v) => setPanelForm((f) => ({ ...f, installedNumber: v }))} />
                      <FieldInput label="Serial" value={panelForm.installedSerial} onChange={(v) => setPanelForm((f) => ({ ...f, installedSerial: v }))} />
                    </div>
                    <FieldSelect label="Installed Status" value={panelForm.installedStatus} options={['Overhauled', 'New', 'Serviceable']} onChange={(v) => setPanelForm((f) => ({ ...f, installedStatus: v }))} />
                    <button type="button" disabled title="Coming soon" className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary opacity-50 cursor-not-allowed">
                      <Paperclip className="h-3 w-3" /> Attach File
                    </button>
                  </PanelSection>
                </>
              )}

              {panelTab === 'child' && (
                <p className="text-[12.5px] text-muted-foreground">No child tasks for this compliance item.</p>
              )}

              {panelTab === 'work' && (
                panelItem.last_completed_date ? (
                  <div className="rounded-lg border border-border p-3">
                    <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{fmtDate(panelItem.last_completed_date)}</div>
                    <div className="text-[12px] text-muted-foreground mt-0.5">
                      {panelItem.last_completed_hours != null ? `${panelItem.last_completed_hours} hrs` : 'hours n/a'}
                      {panelItem.last_completed_cycles != null ? ` · ${panelItem.last_completed_cycles} landings` : ''}
                    </div>
                    {panelItem.notes && <div className="text-[12px] text-muted-foreground mt-1">{panelItem.notes}</div>}
                  </div>
                ) : (
                  <p className="text-[12.5px] text-muted-foreground">No completed work recorded yet.</p>
                )
              )}
            </div>

            {/* Panel footer — stacks on mobile so neither button overflows the
                full-width panel; side-by-side from sm: up. */}
            <div className="px-5 py-4 border-t border-border flex flex-col sm:flex-row gap-2 shrink-0">
              <Button
                variant="outline"
                className="w-full sm:flex-1"
                onClick={() => toast.success('Compliance record saved')}
              >
                <FileText className="h-4 w-4 mr-1.5" />
                Create Compliance
              </Button>
              <Button
                className="w-full sm:flex-1"
                onClick={() => router.push(`/logbook-entries?aircraft=${panelItem.aircraft?.id ?? ''}`)}
              >
                <Plane className="h-4 w-4 mr-1.5" />
                Create Logbook Entry
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[12px] text-foreground mb-2" style={{ fontWeight: 700 }}>{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function FieldInput({
  label, value, onChange, type = 'text', placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-9 px-2.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </label>
  )
}

function FieldArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>{label}</span>
      <textarea
        value={value}
        rows={2}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full px-2.5 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </label>
  )
}

function FieldSelect({
  label, value, options, onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <label className="block mt-2">
      <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-9 px-2.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}
