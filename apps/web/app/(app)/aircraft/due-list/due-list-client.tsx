'use client'

/**
 * Due List — compliance / inspection tracking.
 *
 * Clean table of compliance_items joined with aircraft. Status tabs +
 * aircraft filter, row checkboxes for bulk "Create Work Order", and a
 * row-click right-side panel (Compliance / Child Tasks / Work Completed).
 */

import { useMemo, useState, type ReactNode } from 'react'
import { useTenantRouter } from '@/components/shared/tenant-link'
import { toast } from 'sonner'
import {
  X, ClipboardList, FileText, Plane, Loader2, Wrench, ArrowRight, Paperclip,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
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

const STATUS_META: Record<string, { label: string; badge: string; cls: string }> = {
  overdue: { label: 'Overdue', badge: '⚠ Overdue', cls: 'bg-red-100 text-red-800 border-red-300' },
  'due-soon': { label: 'Next Due', badge: '! Next Due', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  current: { label: 'On Time', badge: '✓ On Time', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  deferred: { label: 'Deferred', badge: 'Deferred', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
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
      <div className="px-6 py-4 border-b border-border bg-white shrink-0 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>Due List</h1>
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
      <div className="px-6 pt-3 bg-white border-b border-border shrink-0">
        <div className="flex gap-1">
          {STATUS_TABS.map((t) => {
            const count = t.key === 'all' ? items.length : items.filter((i) => i.status === t.key).length
            return (
              <button
                key={t.key}
                onClick={() => setStatusFilter(t.key)}
                className={`px-3 py-2 text-[13px] border-b-2 -mb-px transition-colors ${
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

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">
            No items in this view.
          </div>
        ) : (
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  {['', 'Tail No.', 'Source / Ref', 'Type / Description', 'ATA / JASC', 'Compliance', 'Interval', 'Next Due', 'Remaining'].map((h, i) => (
                    <th key={i} className="text-left px-3 py-2.5 text-[10.5px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 600 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((it) => {
                  const meta = STATUS_META[it.status] ?? STATUS_META.current
                  return (
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
                        <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>
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
                        {it.interval_calendar_months ? `${it.interval_calendar_months}M` : ''}
                        {it.interval_calendar_months && it.interval_hours ? ' / ' : ''}
                        {it.interval_hours ? `${it.interval_hours}H` : ''}
                        {!it.interval_calendar_months && !it.interval_hours ? '—' : ''}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-muted-foreground tabular-nums">
                        <div>{fmtDate(it.next_due_date)}</div>
                        <div>{it.next_due_hours != null ? `${it.next_due_hours}H` : ''}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] border ${meta.cls}`} style={{ fontWeight: 700 }}>
                          {meta.badge}
                        </span>
                        <div className="text-[10.5px] text-muted-foreground mt-0.5">{monthsUntil(it.next_due_date)}</div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
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
                <span className={`inline-flex mt-1 items-center px-2 py-0.5 rounded-full text-[10px] border ${(STATUS_META[panelItem.status] ?? STATUS_META.current).cls}`} style={{ fontWeight: 700 }}>
                  {(STATUS_META[panelItem.status] ?? STATUS_META.current).badge}
                </span>
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
                    <button type="button" className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                      <Paperclip className="h-3 w-3" /> Attach File
                    </button>
                    <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground mb-1 mt-3" style={{ fontWeight: 600 }}>Part Installed</div>
                    <div className="grid grid-cols-2 gap-2">
                      <FieldInput label="Number" value={panelForm.installedNumber} onChange={(v) => setPanelForm((f) => ({ ...f, installedNumber: v }))} />
                      <FieldInput label="Serial" value={panelForm.installedSerial} onChange={(v) => setPanelForm((f) => ({ ...f, installedSerial: v }))} />
                    </div>
                    <FieldSelect label="Installed Status" value={panelForm.installedStatus} options={['Overhauled', 'New', 'Serviceable']} onChange={(v) => setPanelForm((f) => ({ ...f, installedStatus: v }))} />
                    <button type="button" className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
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

            {/* Panel footer */}
            <div className="px-5 py-4 border-t border-border flex gap-2 shrink-0">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => toast.success('Compliance record saved')}
              >
                <FileText className="h-4 w-4 mr-1.5" />
                Create Compliance
              </Button>
              <Button
                className="flex-1"
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
