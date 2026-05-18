'use client'

/**
 * Logbook Entries — clean list view.
 *
 * Replaces the inline 7-step LogbookWorkflowBoard documentation. Shows
 * only the entries table. "New Entry" opens a focused create modal
 * (aircraft → entry type → component logbook → notes) that posts a draft
 * entry; signing happens on the entry detail page.
 *
 * Entry display: type + date + tail — never raw UUIDs (prior fix preserved).
 */

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useTenantRouter } from '@/components/shared/tenant-link'
import { toast } from 'sonner'
import { BookOpen, Plus, Search, Plane, CheckCircle2, X, Loader2 } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { AtaJascSelector } from '@/components/aviation/AtaJascSelector'
import { type AtaJascValue, EMPTY_ATA_JASC, hasAtaJasc } from '@/lib/aviation/ata-jasc'

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-amber-50 text-amber-700 border-amber-200',
  ready_for_review: 'bg-amber-50 text-amber-700 border-amber-200',
  signed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  printed_unsigned: 'bg-blue-50 text-blue-700 border-blue-200',
  // Historical: OCR-transcribed records from the owner's paper logbooks.
  historical: 'bg-slate-50 text-slate-600 border-slate-200',
  void: 'bg-slate-100 text-slate-600 border-slate-200',
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

export function LogbookEntriesListView({
  entries,
  aircraft = [],
  isOwner = false,
}: {
  entries: LogbookItem[]
  aircraft?: AircraftOption[]
  isOwner?: boolean
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

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <div className="px-6 py-4 border-b border-border bg-white flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-lg px-3 py-2 flex-1 max-w-md">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by tail, entry type, or description..."
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

      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <BookOpen className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No logbook entries yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Generate one from a closed work order or write directly from an aircraft.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  {['Aircraft', 'Type', 'Date', 'Hobbs / Tach', 'Status', 'Linked WO', 'Description'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] text-muted-foreground uppercase tracking-wider whitespace-nowrap" style={{ fontWeight: 600 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((e) => (
                  <tr
                    key={e.id}
                    className="hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => router.push(`/logbook-entries/${e.id}`)}
                  >
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-[13px] text-foreground" style={{ fontWeight: 600 }}>
                        <Plane className="h-3 w-3 text-muted-foreground" />
                        {e.aircraft?.tail_number ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[12px] text-foreground capitalize">
                        {(e.entry_type ?? '').replace(/_/g, ' ') || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[12px] text-muted-foreground">
                        {e.entry_date ? formatDate(e.entry_date) : formatDate(e.created_at)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {e.hobbs_in != null ? `H ${Number(e.hobbs_in).toFixed(1)}` : ''}
                        {e.hobbs_in != null && e.tach_time != null ? ' / ' : ''}
                        {e.tach_time != null ? `T ${Number(e.tach_time).toFixed(1)}` : ''}
                        {e.hobbs_in == null && e.tach_time == null ? '—' : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border',
                        STATUS_COLOR[e.status] ?? STATUS_COLOR.draft,
                      )} style={{ fontWeight: 600 }}>
                        {e.status === 'signed' && <CheckCircle2 className="h-2.5 w-2.5" />}
                        {(e.status ?? 'draft').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {e.work_order ? (
                        <Link
                          href={`/work-orders/${e.work_order.id}`}
                          onClick={(ev) => ev.stopPropagation()}
                          className="text-[12px] text-primary hover:underline tabular-nums"
                        >
                          {e.work_order.work_order_number}
                        </Link>
                      ) : (
                        <span className="text-[12px] text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[12px] text-muted-foreground line-clamp-1 max-w-[280px]">
                        {e.description ?? '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
}
