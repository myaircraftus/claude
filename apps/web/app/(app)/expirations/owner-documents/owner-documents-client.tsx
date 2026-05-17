'use client'

/**
 * Owner Document Lockbox — expirations surface.
 *
 * The aircraft owner's personal documents (medical, certificates, insurance,
 * registration). Header + Add button, status filter tabs, a table with
 * colored status badges, and a row-click side panel with detail + inline
 * edit form. Status is derived from expiration_date via lib/expirations/status.
 */

import { useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { X, FileText, Plus, Loader2, Paperclip, Trash2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  expirationStatus, EXPIRATION_META, EXPIRATION_TABS, fmtDate, relativeDue,
  type ExpirationStatus,
} from '@/lib/expirations/status'

interface OwnerDocument {
  id: string
  organization_id: string
  scope: string
  aircraft_id: string | null
  owner_user_id: string | null
  document_name: string
  document_type: string | null
  document_number: string | null
  issuing_authority: string | null
  issue_date: string | null
  expiration_date: string | null
  file_url: string | null
  notes: string | null
  created_at: string | null
}

interface Aircraft {
  id: string
  tail_number: string
  make: string | null
  model: string | null
}

const DOCUMENT_TYPES = [
  'Medical Certificate', 'Pilot Certificate', 'BFR', 'IPC', 'Insurance', 'Registration',
]

const EMPTY_FORM = {
  document_name: '', aircraft_id: '', document_type: 'Medical Certificate',
  document_number: '', issuing_authority: '', issue_date: '', expiration_date: '', notes: '',
}

export function OwnerDocumentsClient({
  documents, aircraft,
}: {
  documents: OwnerDocument[]
  aircraft: Aircraft[]
}) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [panelId, setPanelId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)

  const aircraftLabel = (id: string | null) => {
    if (!id) return '—'
    const a = aircraft.find((x) => x.id === id)
    return a ? a.tail_number : '—'
  }

  const withStatus = useMemo(
    () => documents.map((d) => ({ doc: d, status: expirationStatus(d.expiration_date) })),
    [documents],
  )

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: documents.length, expired: 0, 'expiring-soon': 0, valid: 0 }
    for (const { status } of withStatus) if (status in c) c[status] += 1
    return c
  }, [withStatus, documents.length])

  const filtered = useMemo(
    () => withStatus.filter((r) => statusFilter === 'all' || r.status === statusFilter),
    [withStatus, statusFilter],
  )

  const panelDoc = panelId ? documents.find((d) => d.id === panelId) ?? null : null

  async function createDocument(e: React.FormEvent) {
    e.preventDefault()
    if (!form.document_name.trim()) {
      toast.error('Document name is required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/document-expirations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'owner',
          aircraft_id: form.aircraft_id || null,
          document_name: form.document_name.trim(),
          document_type: form.document_type,
          document_number: form.document_number.trim() || null,
          issuing_authority: form.issuing_authority.trim() || null,
          issue_date: form.issue_date || null,
          expiration_date: form.expiration_date || null,
          notes: form.notes.trim() || null,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(j?.error ?? 'Could not add document')
        return
      }
      toast.success('Document added')
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
            Owner Document Lockbox
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Personal documents and certificate expirations for the aircraft owner.
          </p>
        </div>
        <Button size="sm" onClick={() => { setForm({ ...EMPTY_FORM }); setAddOpen(true) }}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Document
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
        {documents.length === 0 ? (
          <EmptyState onAdd={() => setAddOpen(true)} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">No documents in this view.</div>
        ) : (
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  {['Document Name', 'Aircraft', 'Document Type', 'Issue Date', 'Expiration Date', 'Status'].map((h) => (
                    <th key={h} className="text-left px-3 py-2.5 text-[10.5px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 600 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(({ doc, status }) => (
                  <tr
                    key={doc.id}
                    onClick={() => setPanelId(doc.id)}
                    className="hover:bg-muted/20 cursor-pointer"
                  >
                    <td className="px-3 py-2.5">
                      <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{doc.document_name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {doc.document_number ? `No. ${doc.document_number}` : ''}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-muted-foreground tabular-nums">{aircraftLabel(doc.aircraft_id)}</td>
                    <td className="px-3 py-2.5 text-[12px] text-muted-foreground">{doc.document_type ?? '—'}</td>
                    <td className="px-3 py-2.5 text-[12px] text-muted-foreground tabular-nums">{fmtDate(doc.issue_date)}</td>
                    <td className="px-3 py-2.5 text-[12px] text-muted-foreground tabular-nums">
                      <div>{fmtDate(doc.expiration_date)}</div>
                      <div className="text-[10.5px] text-muted-foreground/70">{relativeDue(doc.expiration_date)}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {panelDoc && (
        <DocumentPanel
          doc={panelDoc}
          aircraft={aircraft}
          aircraftLabel={aircraftLabel}
          onClose={() => setPanelId(null)}
        />
      )}

      {addOpen && (
        <AddDocumentModal
          form={form}
          setForm={setForm}
          aircraft={aircraft}
          saving={saving}
          onClose={() => setAddOpen(false)}
          onSubmit={createDocument}
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
        <FileText className="h-7 w-7 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">No documents tracked yet</p>
      <p className="text-xs text-muted-foreground text-center max-w-sm">
        Add your personal documents and certificates to track their expiration dates.
      </p>
      <Button variant="outline" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Document
      </Button>
    </div>
  )
}

function DocumentPanel({
  doc, aircraft, aircraftLabel, onClose,
}: {
  doc: OwnerDocument
  aircraft: Aircraft[]
  aircraftLabel: (id: string | null) => string
  onClose: () => void
}) {
  const router = useRouter()
  const status = expirationStatus(doc.expiration_date)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [form, setForm] = useState({
    document_name: doc.document_name ?? '',
    aircraft_id: doc.aircraft_id ?? '',
    document_type: doc.document_type ?? 'Medical Certificate',
    document_number: doc.document_number ?? '',
    issuing_authority: doc.issuing_authority ?? '',
    issue_date: doc.issue_date ?? '',
    expiration_date: doc.expiration_date ?? '',
    notes: doc.notes ?? '',
  })
  const set = (k: keyof typeof form, v: string) => setForm({ ...form, [k]: v })

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.document_name.trim()) {
      toast.error('Document name is required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/document-expirations/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'owner',
          aircraft_id: form.aircraft_id || null,
          document_name: form.document_name.trim(),
          document_type: form.document_type,
          document_number: form.document_number.trim() || null,
          issuing_authority: form.issuing_authority.trim() || null,
          issue_date: form.issue_date || null,
          expiration_date: form.expiration_date || null,
          notes: form.notes.trim() || null,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(j?.error ?? 'Could not save changes')
        return
      }
      toast.success('Document updated')
      setEditing(false)
      router.refresh()
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function deleteDocument() {
    if (!window.confirm('Delete this document? This cannot be undone.')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/document-expirations/${doc.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j?.error ?? 'Could not delete document')
        return
      }
      toast.success('Document deleted')
      onClose()
      router.refresh()
    } catch {
      toast.error('Network error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-950/30" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-[460px] bg-background border-l border-border shadow-xl flex flex-col">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
              {doc.document_type ?? 'Document'}
            </div>
            <div className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>{doc.document_name}</div>
            <span className={`inline-flex mt-1 items-center px-2 py-0.5 rounded-full text-[10px] border ${EXPIRATION_META[status].cls}`} style={{ fontWeight: 700 }}>
              {EXPIRATION_META[status].badge}
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {editing ? (
            <form id="edit-doc-form" onSubmit={saveEdit} className="space-y-3">
              <Field label="Document Name *"><Text value={form.document_name} onChange={(v) => set('document_name', v)} /></Field>
              <Field label="Aircraft">
                <select
                  value={form.aircraft_id}
                  onChange={(e) => set('aircraft_id', e.target.value)}
                  className="w-full h-9 px-2.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">— None —</option>
                  {aircraft.map((a) => <option key={a.id} value={a.id}>{a.tail_number}</option>)}
                </select>
              </Field>
              <Field label="Document Type">
                <select
                  value={form.document_type}
                  onChange={(e) => set('document_type', e.target.value)}
                  className="w-full h-9 px-2.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Document #"><Text value={form.document_number} onChange={(v) => set('document_number', v)} /></Field>
                <Field label="Issuing Authority"><Text value={form.issuing_authority} onChange={(v) => set('issuing_authority', v)} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Issue Date"><Text type="date" value={form.issue_date} onChange={(v) => set('issue_date', v)} /></Field>
                <Field label="Expiration Date"><Text type="date" value={form.expiration_date} onChange={(v) => set('expiration_date', v)} /></Field>
              </div>
              <Field label="Notes"><Text value={form.notes} onChange={(v) => set('notes', v)} /></Field>
            </form>
          ) : (
            <>
              <PanelSection title="Document Details">
                <DetailRow label="Aircraft" value={aircraftLabel(doc.aircraft_id)} />
                <DetailRow label="Document Type" value={doc.document_type} />
                <DetailRow label="Document #" value={doc.document_number} />
                <DetailRow label="Issuing Authority" value={doc.issuing_authority} />
                <DetailRow label="Issue Date" value={fmtDate(doc.issue_date)} />
                <DetailRow label="Expiration Date" value={fmtDate(doc.expiration_date)} />
              </PanelSection>

              <PanelSection title="Notes">
                <p className="text-[12.5px] text-muted-foreground whitespace-pre-wrap">
                  {doc.notes || 'No notes recorded.'}
                </p>
              </PanelSection>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border shrink-0 space-y-2">
          {editing ? (
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" form="edit-doc-form" className="flex-1" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Pencil className="h-4 w-4 mr-1.5" />}
                Save Changes
              </Button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4 mr-1.5" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => toast.info('Document upload is coming soon.')}
                >
                  <Paperclip className="h-4 w-4 mr-1.5" />
                  Upload Document
                </Button>
              </div>
              <Button
                variant="outline"
                className="w-full text-red-700 border-red-300 hover:bg-red-50"
                onClick={deleteDocument}
                disabled={deleting}
              >
                {deleting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
                Delete Document
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  )
}

function AddDocumentModal({
  form, setForm, aircraft, saving, onClose, onSubmit,
}: {
  form: typeof EMPTY_FORM
  setForm: (f: typeof EMPTY_FORM) => void
  aircraft: Aircraft[]
  saving: boolean
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
}) {
  const set = (k: keyof typeof EMPTY_FORM, v: string) => setForm({ ...form, [k]: v })
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-background rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Add Document</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={onSubmit} className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <Field label="Document Name *"><Text value={form.document_name} onChange={(v) => set('document_name', v)} /></Field>
          <Field label="Aircraft">
            <select
              value={form.aircraft_id}
              onChange={(e) => set('aircraft_id', e.target.value)}
              className="w-full h-9 px-2.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">— None —</option>
              {aircraft.map((a) => <option key={a.id} value={a.id}>{a.tail_number}</option>)}
            </select>
          </Field>
          <Field label="Document Type">
            <select
              value={form.document_type}
              onChange={(e) => set('document_type', e.target.value)}
              className="w-full h-9 px-2.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Document #"><Text value={form.document_number} onChange={(v) => set('document_number', v)} /></Field>
            <Field label="Issuing Authority"><Text value={form.issuing_authority} onChange={(v) => set('issuing_authority', v)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Issue Date"><Text type="date" value={form.issue_date} onChange={(v) => set('issue_date', v)} /></Field>
            <Field label="Expiration Date"><Text type="date" value={form.expiration_date} onChange={(v) => set('expiration_date', v)} /></Field>
          </div>
          <Field label="Notes"><Text value={form.notes} onChange={(v) => set('notes', v)} /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Add Document
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
