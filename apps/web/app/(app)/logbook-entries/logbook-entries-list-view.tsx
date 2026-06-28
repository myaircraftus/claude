'use client'

/**
 * Logbook Entries — clean list view.
 *
 * Replaces the inline 7-step LogbookWorkflowBoard documentation. Shows
 * only the entries list. "New Entry" opens a focused create modal
 * (aircraft → entry type → component logbook → notes) that posts a draft
 * entry; signing happens on the entry detail page.
 *
 * The list uses the shared RecordList primitive — a clean table on desktop,
 * stacked cards on mobile (was a 7-column table that broke on phones).
 * Entry display: type + date + tail — never raw UUIDs (prior fix preserved).
 */

import { useMemo, useState } from 'react'
import { useTenantRouter } from '@/components/shared/tenant-link'
import { toast } from 'sonner'
import { BookOpen, Plus, Search, Plane, X, Loader2 } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { RecordList, type RecordColumn } from '@/components/shared/record-list'
import { StatusBadge, type StatusMap } from '@/components/shared/status-badge'
import { AtaJascSelector } from '@/components/aviation/AtaJascSelector'
import { type AtaJascValue, EMPTY_ATA_JASC, hasAtaJasc } from '@/lib/aviation/ata-jasc'

/** Single source of truth for logbook status labels + colors on the list. */
const LOGBOOK_STATUS: StatusMap = {
  draft: { label: 'Draft', pill: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  ready_for_review: { label: 'Ready for review', pill: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  signed: { label: 'Signed', pill: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  approved: { label: 'Approved', pill: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  printed_unsigned: { label: 'Printed (unsigned)', pill: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
  // Historical: OCR-transcribed records from the owner's paper logbooks.
  historical: { label: 'Historical', pill: 'bg-slate-50 text-slate-600', dot: 'bg-slate-400' },
  void: { label: 'Void', pill: 'bg-slate-100 text-slate-600', dot: 'bg-slate-300' },
}

interface LogbookItem {
  id: string
  entry_type: string | null
  entry_date: string | null
  status: string
  signed_at: string | null
  created_at: string
  hobbs_in: number | null
  hobbs_out: number | null
  tach_time: number | null
  total_time: number | null
  description: string | null
  mechanic_name?: string | null
  aircraft: { id: string; tail_number: string; make: string | null; model: string | null } | null
  work_order: { id: string; work_order_number: string } | null
}

interface AircraftOption {
  id: string
  tail_number: string
  make?: string | null
  model?: string | null
}

const ENTRY_TYPES = [
  { value: 'annual', label: 'Annual Inspection' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'oil_change', label: 'Oil Change' },
  { value: 'ad_compliance', label: 'AD Compliance' },
  { value: 'return_to_service', label: 'Return to Service' },
  { value: '100_hour', label: '100-Hour' },
  { value: 'other', label: 'Other' },
]

const TARGETS = ['airframe', 'engine', 'propeller', 'avionics', 'appliance'] as const

function hobbsTach(e: LogbookItem): string {
  const parts: string[] = []
  if (e.hobbs_in != null) parts.push(`H ${Number(e.hobbs_in).toFixed(1)}`)
  if (e.tach_time != null) parts.push(`T ${Number(e.tach_time).toFixed(1)}`)
  return parts.length ? parts.join(' / ') : '—'
}

export function LogbookEntriesListView({
  entries,
  aircraft = [],
  isOwner = false,
  loadError = false,
}: {
  entries: LogbookItem[]
  aircraft?: AircraftOption[]
  isOwner?: boolean
  /** True when the server query failed — show an error state, not "empty". */
  loadError?: boolean
}) {
  const router = useTenantRouter()
  const [q, setQ] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    aircraft_id: '',
    entry_type: 'annual',
    target: 'airframe' as (typeof TARGETS)[number],
    description: '',
  })
  const [ataJasc, setAtaJasc] = useState<AtaJascValue>({ ...EMPTY_ATA_JASC })
  const [ataJascSource, setAtaJascSource] = useState<'manual' | 'ai'>('manual')

  function closeCreate() {
    setCreateOpen(false)
    setAtaJasc({ ...EMPTY_ATA_JASC })
    setAtaJascSource('manual')
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return entries.filter((e) => {
      if (!needle) return true
      return (
        (e.aircraft?.tail_number ?? '').toLowerCase().includes(needle) ||
        (e.entry_type ?? '').toLowerCase().includes(needle) ||
        (e.description ?? '').toLowerCase().includes(needle)
      )
    })
  }, [entries, q])

  const columns: RecordColumn<LogbookItem>[] = [
    {
      key: 'aircraft',
      header: 'Aircraft',
      primary: true,
      cell: (e) => (
        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-foreground">
          <Plane className="h-3 w-3 text-muted-foreground" />
          {e.aircraft?.tail_number ?? '—'}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      cell: (e) => <span className="text-[12px] capitalize text-foreground">{(e.entry_type ?? '').replace(/_/g, ' ') || '—'}</span>,
    },
    {
      key: 'date',
      header: 'Date',
      cell: (e) => <span className="text-[12px] text-muted-foreground">{e.entry_date ? formatDate(e.entry_date) : formatDate(e.created_at)}</span>,
    },
    {
      key: 'hobbs_tach',
      header: 'Hobbs / Tach',
      cell: (e) => <span className="text-[11px] tabular-nums text-muted-foreground">{hobbsTach(e)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      badge: true,
      cell: (e) => <StatusBadge map={LOGBOOK_STATUS} status={e.status} />,
    },
    {
      key: 'linked_wo',
      header: 'Linked WO',
      cell: (e) => (
        <span className="text-[12px] tabular-nums text-muted-foreground">{e.work_order?.work_order_number ?? '—'}</span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      hideOnMobile: true,
      className: 'max-w-[280px]',
      cell: (e) => <span className="block truncate text-[12px] text-muted-foreground">{e.description ?? '—'}</span>,
    },
  ]

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <div className="px-4 sm:px-6 py-4 border-b border-border bg-background flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-lg px-3 py-2 flex-1 max-w-md">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by tail, entry type, or description..."
            aria-label="Search logbook entries"
            className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground/50"
          />
        </div>
        {!isOwner && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            New Entry
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <RecordList
          items={filtered}
          columns={columns}
          getRowKey={(e) => e.id}
          getRowHref={(e) => `/logbook-entries/${e.id}`}
          error={loadError}
          emptyIcon={<BookOpen className="h-7 w-7" />}
          emptyTitle={q ? 'No matching entries' : 'No logbook entries yet'}
          emptyDescription={
            q ? 'No entries on this page match your search.' : 'Generate one from a closed work order or write directly from an aircraft.'
          }
        />
      </div>

      {/* Create entry modal */}
      {createOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4"
          onClick={() => !saving && closeCreate()}
        >
          <div
            className="bg-background rounded-xl shadow-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-foreground">New Logbook Entry</h2>
              <button onClick={() => !saving && closeCreate()} className="p-1 rounded hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[11px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Aircraft</label>
                <select
                  value={form.aircraft_id}
                  onChange={(e) => setForm((f) => ({ ...f, aircraft_id: e.target.value }))}
                  className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Select aircraft…</option>
                  {aircraft.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.tail_number}{a.make || a.model ? ` — ${[a.make, a.model].filter(Boolean).join(' ')}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Entry type</label>
                <select
                  value={form.entry_type}
                  onChange={(e) => setForm((f) => ({ ...f, entry_type: e.target.value }))}
                  className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {ENTRY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Component logbook</label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {TARGETS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, target: t }))}
                      className={cn(
                        'px-3 h-8 rounded-md text-[12px] border capitalize transition-colors',
                        form.target === t
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-foreground border-input hover:bg-muted/50',
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="What was done…"
                  rows={3}
                  className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <AtaJascSelector
                  value={ataJasc}
                  onChange={(v, meta) => {
                    setAtaJasc(v)
                    setAtaJascSource(meta.source)
                  }}
                  aircraftId={form.aircraft_id || null}
                  suggestText={form.description}
                  label="ATA / JASC Classification"
                  compact
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <Button variant="outline" onClick={() => closeCreate()} disabled={saving}>Cancel</Button>
              <Button onClick={createEntry} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
                Create draft entry
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  async function createEntry() {
    if (!form.aircraft_id) {
      toast.error('Pick an aircraft')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/logbook-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft_id: form.aircraft_id,
          entry_type: form.entry_type,
          entry_date: new Date().toISOString().slice(0, 10),
          target_logbook: form.target,
          logbook_type: form.target === 'propeller' ? 'prop' : form.target,
          status: 'draft',
          source_type: 'logbook_module',
          description: form.description || undefined,
          ata_code: ataJasc.ata_code,
          jasc_code: ataJasc.jasc_code,
          classification_source: hasAtaJasc(ataJasc) ? ataJascSource : null,
          classification_status: hasAtaJasc(ataJasc) ? 'classified' : 'unclassified',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error ?? `Create failed (${res.status})`)
        return
      }
      closeCreate()
      toast.success('Draft logbook entry created')
      if (data?.id) router.push(`/logbook-entries/${data.id}`)
      else router.refresh()
    } catch {
      toast.error('Network error creating entry')
    } finally {
      setSaving(false)
    }
  }
}
