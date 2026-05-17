'use client'

/**
 * Tool & Equipment Calibration — expirations surface.
 *
 * Reference implementation for the /expirations/* pages: header + Add button,
 * status filter tabs (All / Expired / Expiring Soon / Valid), a table with
 * colored status badges, and a row-click side panel with detail + history.
 * Status is derived from next_calibration_date via lib/expirations/status.
 */

import { useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { X, Wrench, Plus, Loader2, Paperclip, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  expirationStatus, EXPIRATION_META, EXPIRATION_TABS, fmtDate, relativeDue,
  type ExpirationStatus,
} from '@/lib/expirations/status'

interface Tool {
  id: string
  name: string
  serial_number: string
  category: string | null
  manufacturer: string | null
  model: string | null
  status: string | null
  calibration_required: boolean
  calibration_interval_months: number | null
  tolerance_days: number | null
  last_calibration_date: string | null
  last_calibration_by: string | null
  last_calibration_cert_number: string | null
  next_calibration_date: string | null
  storage_location: string | null
  notes: string | null
}

interface CalibrationEvent {
  id: string
  tool_id: string
  performed_at: string | null
  performed_by: string | null
  certificate_number: string | null
  result: string | null
  cost: number | null
  notes: string | null
  next_due_date: string | null
}

const CATEGORIES = ['torque', 'measuring', 'test-equipment', 'jig', 'lift', 'borescope', 'other']

const EMPTY_FORM = {
  name: '', serial_number: '', category: 'measuring', manufacturer: '', model: '',
  calibration_interval_months: '12', last_calibration_date: '', next_calibration_date: '',
  storage_location: '', notes: '',
}

export function ToolsExpirationClient({
  tools, calibrationEvents,
}: {
  tools: Tool[]
  calibrationEvents: CalibrationEvent[]
}) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [panelId, setPanelId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)

  const withStatus = useMemo(
    () => tools.map((t) => ({ tool: t, status: expirationStatus(t.next_calibration_date) })),
    [tools],
  )

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: tools.length, expired: 0, 'expiring-soon': 0, valid: 0 }
    for (const { status } of withStatus) if (status in c) c[status] += 1
    return c
  }, [withStatus, tools.length])

  const filtered = useMemo(
    () => withStatus.filter((r) => statusFilter === 'all' || r.status === statusFilter),
    [withStatus, statusFilter],
  )

  const panelTool = panelId ? tools.find((t) => t.id === panelId) ?? null : null
  const panelHistory = panelId ? calibrationEvents.filter((e) => e.tool_id === panelId) : []

  async function createTool(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.serial_number.trim()) {
      toast.error('Tool name and serial number are required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          serial_number: form.serial_number.trim(),
          category: form.category,
          manufacturer: form.manufacturer.trim() || null,
          model: form.model.trim() || null,
          calibration_required: true,
          calibration_interval_months: form.calibration_interval_months
            ? Number(form.calibration_interval_months)
            : null,
          storage_location: form.storage_location.trim() || null,
          notes: form.notes.trim() || null,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(j?.error ?? 'Could not add tool')
        return
      }
      // Calibration dates aren't accepted by the create route — patch them in.
      if (j?.tool?.id && (form.last_calibration_date || form.next_calibration_date)) {
        await fetch(`/api/tools/${j.tool.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            last_calibration_date: form.last_calibration_date || null,
            next_calibration_date: form.next_calibration_date || null,
          }),
        }).catch(() => {})
      }
      toast.success('Tool added')
      setAddOpen(false)
      setForm({ ...EMPTY_FORM })
      router.refresh()
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-white shrink-0 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Tool &amp; Equipment Calibration
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Calibration due dates across shop tooling and test equipment.
          </p>
        </div>
        <Button size="sm" onClick={() => { setForm({ ...EMPTY_FORM }); setAddOpen(true) }}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Tool
        </Button>
      </div>

      {/* Status tabs */}
      <div className="px-6 pt-3 bg-white border-b border-border shrink-0">
        <div className="flex gap-1">
          {EXPIRATION_TABS.map((t) => (
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
              {t.label} <span className="text-muted-foreground/70">({counts[t.key] ?? 0})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        {tools.length === 0 ? (
          <EmptyState onAdd={() => setAddOpen(true)} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">No tools in this view.</div>
        ) : (
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  {['Tool Name', 'Serial #', 'Type', 'Last Calibrated', 'Expiration Date', 'Status'].map((h) => (
                    <th key={h} className="text-left px-3 py-2.5 text-[10.5px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 600 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(({ tool, status }) => {
                  const meta = EXPIRATION_META[status]
                  return (
                    <tr
                      key={tool.id}
                      onClick={() => setPanelId(tool.id)}
                      className="hover:bg-muted/20 cursor-pointer"
                    >
                      <td className="px-3 py-2.5">
                        <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{tool.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {[tool.manufacturer, tool.model].filter(Boolean).join(' ')}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-muted-foreground tabular-nums">{tool.serial_number}</td>
                      <td className="px-3 py-2.5 text-[12px] text-muted-foreground capitalize">
                        {(tool.category ?? '—').replace(/-/g, ' ')}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-muted-foreground tabular-nums">{fmtDate(tool.last_calibration_date)}</td>
                      <td className="px-3 py-2.5 text-[12px] text-muted-foreground tabular-nums">
                        <div>{fmtDate(tool.next_calibration_date)}</div>
                        <div className="text-[10.5px] text-muted-foreground/70">{relativeDue(tool.next_calibration_date)}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={status} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {panelTool && (
        <ToolPanel
          tool={panelTool}
          history={panelHistory}
          onClose={() => setPanelId(null)}
        />
      )}

      {addOpen && (
        <AddToolModal
          form={form}
          setForm={setForm}
          saving={saving}
          onClose={() => setAddOpen(false)}
          onSubmit={createTool}
        />
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: ExpirationStatus }) {
  const meta = EXPIRATION_META[status]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] border ${meta.cls}`} style={{ fontWeight: 700 }}>
      {meta.badge}
    </span>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
        <Wrench className="h-7 w-7 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">No tools tracked yet</p>
      <p className="text-xs text-muted-foreground text-center max-w-sm">
        Add shop tools and test equipment to track their calibration due dates.
      </p>
      <Button variant="outline" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Tool
      </Button>
    </div>
  )
}

function ToolPanel({
  tool, history, onClose,
}: {
  tool: Tool
  history: CalibrationEvent[]
  onClose: () => void
}) {
  const status = expirationStatus(tool.next_calibration_date)
  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-950/30" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-[460px] bg-background border-l border-border shadow-xl flex flex-col">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
              {(tool.category ?? 'Tool').replace(/-/g, ' ')}
            </div>
            <div className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>{tool.name}</div>
            <span className={`inline-flex mt-1 items-center px-2 py-0.5 rounded-full text-[10px] border ${EXPIRATION_META[status].cls}`} style={{ fontWeight: 700 }}>
              {EXPIRATION_META[status].badge}
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <PanelSection title="Tool Details">
            <DetailRow label="Serial #" value={tool.serial_number} />
            <DetailRow label="Manufacturer" value={tool.manufacturer} />
            <DetailRow label="Model" value={tool.model} />
            <DetailRow label="Storage Location" value={tool.storage_location} />
            <DetailRow
              label="Calibration Interval"
              value={tool.calibration_interval_months ? `${tool.calibration_interval_months} months` : null}
            />
            <DetailRow label="Last Calibrated" value={fmtDate(tool.last_calibration_date)} />
            <DetailRow label="Last Cert #" value={tool.last_calibration_cert_number} />
            <DetailRow label="Next Due" value={fmtDate(tool.next_calibration_date)} />
            {tool.notes && <DetailRow label="Notes" value={tool.notes} />}
          </PanelSection>

          <PanelSection title="Calibration History">
            {history.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">No calibration events recorded.</p>
            ) : (
              <div className="space-y-2">
                {history.map((ev) => (
                  <div key={ev.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2">
                      <History className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>
                        {fmtDate(ev.performed_at)}
                      </span>
                      {ev.result && (
                        <span className="text-[10.5px] text-muted-foreground capitalize">· {ev.result}</span>
                      )}
                    </div>
                    <div className="text-[12px] text-muted-foreground mt-0.5">
                      {[ev.performed_by, ev.certificate_number ? `Cert ${ev.certificate_number}` : null]
                        .filter(Boolean).join(' · ') || '—'}
                    </div>
                    {ev.notes && <div className="text-[12px] text-muted-foreground mt-1">{ev.notes}</div>}
                  </div>
                ))}
              </div>
            )}
          </PanelSection>
        </div>

        <div className="px-5 py-4 border-t border-border shrink-0">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => toast.info('Certificate upload is coming soon.')}
          >
            <Paperclip className="h-4 w-4 mr-1.5" />
            Upload Certificate
          </Button>
        </div>
      </div>
    </>
  )
}

function AddToolModal({
  form, setForm, saving, onClose, onSubmit,
}: {
  form: typeof EMPTY_FORM
  setForm: (f: typeof EMPTY_FORM) => void
  saving: boolean
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
}) {
  const set = (k: keyof typeof EMPTY_FORM, v: string) => setForm({ ...form, [k]: v })
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-background rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Add Tool</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={onSubmit} className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <Field label="Tool Name *"><Text value={form.name} onChange={(v) => set('name', v)} /></Field>
          <Field label="Serial # *"><Text value={form.serial_number} onChange={(v) => set('serial_number', v)} /></Field>
          <Field label="Type">
            <select
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
              className="w-full h-9 px-2.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/-/g, ' ')}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Manufacturer"><Text value={form.manufacturer} onChange={(v) => set('manufacturer', v)} /></Field>
            <Field label="Model"><Text value={form.model} onChange={(v) => set('model', v)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Last Calibrated"><Text type="date" value={form.last_calibration_date} onChange={(v) => set('last_calibration_date', v)} /></Field>
            <Field label="Expiration Date"><Text type="date" value={form.next_calibration_date} onChange={(v) => set('next_calibration_date', v)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Interval (months)"><Text type="number" value={form.calibration_interval_months} onChange={(v) => set('calibration_interval_months', v)} /></Field>
            <Field label="Storage Location"><Text value={form.storage_location} onChange={(v) => set('storage_location', v)} /></Field>
          </div>
          <Field label="Notes"><Text value={form.notes} onChange={(v) => set('notes', v)} /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Add Tool
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[12px] text-foreground mb-2" style={{ fontWeight: 700 }}>{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[12.5px]">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground text-right">{value || '—'}</span>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

function Text({
  value, onChange, type = 'text',
}: {
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-9 px-2.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
    />
  )
}
