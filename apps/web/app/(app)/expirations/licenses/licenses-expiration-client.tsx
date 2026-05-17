'use client'

/**
 * Mechanic Licenses & Certificates — expirations surface.
 *
 * Header + Add button, status filter tabs (All / Expired / Expiring Soon /
 * Valid), a table with colored status badges, and a row-click side panel with
 * an inline edit form, renewal-reminder toggle and delete. Status is derived
 * from expiration_date via lib/expirations/status.
 */

import { useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { X, BadgeCheck, Plus, Loader2, Trash2, Save, Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  expirationStatus, EXPIRATION_META, EXPIRATION_TABS, fmtDate, relativeDue,
  type ExpirationStatus,
} from '@/lib/expirations/status'

interface Certificate {
  id: string
  organization_id: string
  user_id: string | null
  mechanic_name: string | null
  certificate_type: string | null
  certificate_number: string | null
  issuing_authority: string | null
  issue_date: string | null
  expiration_date: string | null
  renewal_reminder: boolean
  notes: string | null
  created_at: string | null
}

interface RosterEntry {
  user_id: string
  name: string
  email: string | null
}

const CERT_TYPES = [
  'A&P Certificate',
  'IA Authorization',
  'Repairman Certificate',
  'FCC Permit',
]

const EMPTY_FORM = {
  user_id: '', mechanic_name: '', certificate_type: 'A&P Certificate',
  certificate_number: '', issuing_authority: '', issue_date: '',
  expiration_date: '', renewal_reminder: true, notes: '',
}

type FormState = typeof EMPTY_FORM

export function LicensesExpirationClient({
  certificates, roster,
}: {
  certificates: Certificate[]
  roster: RosterEntry[]
}) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [panelId, setPanelId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)

  const rosterName = (userId: string | null) =>
    userId ? roster.find((r) => r.user_id === userId)?.name ?? null : null

  const withStatus = useMemo(
    () => certificates.map((c) => ({ cert: c, status: expirationStatus(c.expiration_date) })),
    [certificates],
  )

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: certificates.length, expired: 0, 'expiring-soon': 0, valid: 0,
    }
    for (const { status } of withStatus) if (status in c) c[status] += 1
    return c
  }, [withStatus, certificates.length])

  const filtered = useMemo(
    () => withStatus.filter((r) => statusFilter === 'all' || r.status === statusFilter),
    [withStatus, statusFilter],
  )

  const panelCert = panelId ? certificates.find((c) => c.id === panelId) ?? null : null

  async function createCertificate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.mechanic_name.trim()) {
      toast.error('Mechanic is required')
      return
    }
    if (!form.certificate_type) {
      toast.error('Certificate type is required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/mechanic-certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: form.user_id || null,
          mechanic_name: form.mechanic_name.trim(),
          certificate_type: form.certificate_type,
          certificate_number: form.certificate_number.trim() || null,
          issuing_authority: form.issuing_authority.trim() || null,
          issue_date: form.issue_date || null,
          expiration_date: form.expiration_date || null,
          renewal_reminder: form.renewal_reminder,
          notes: form.notes.trim() || null,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(j?.error ?? 'Could not add certificate')
        return
      }
      toast.success('Certificate added')
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
            Mechanic Licenses &amp; Certificates
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Certificate and license expirations across your maintenance personnel.
          </p>
        </div>
        <Button size="sm" onClick={() => { setForm({ ...EMPTY_FORM }); setAddOpen(true) }}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Certificate
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
        {certificates.length === 0 ? (
          <EmptyState onAdd={() => setAddOpen(true)} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">No certificates in this view.</div>
        ) : (
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  {['Mechanic Name', 'Certificate Type', 'Certificate #', 'Issue Date', 'Expiration Date', 'Status'].map((h) => (
                    <th key={h} className="text-left px-3 py-2.5 text-[10.5px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 600 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(({ cert, status }) => (
                  <tr
                    key={cert.id}
                    onClick={() => setPanelId(cert.id)}
                    className="hover:bg-muted/20 cursor-pointer"
                  >
                    <td className="px-3 py-2.5">
                      <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>
                        {cert.mechanic_name || rosterName(cert.user_id) || '—'}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{cert.issuing_authority || ''}</div>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-muted-foreground">{cert.certificate_type || '—'}</td>
                    <td className="px-3 py-2.5 text-[12px] text-muted-foreground tabular-nums">{cert.certificate_number || '—'}</td>
                    <td className="px-3 py-2.5 text-[12px] text-muted-foreground tabular-nums">{fmtDate(cert.issue_date)}</td>
                    <td className="px-3 py-2.5 text-[12px] text-muted-foreground tabular-nums">
                      <div>{fmtDate(cert.expiration_date)}</div>
                      <div className="text-[10.5px] text-muted-foreground/70">{relativeDue(cert.expiration_date)}</div>
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

      {panelCert && (
        <CertificatePanel
          key={panelCert.id}
          cert={panelCert}
          roster={roster}
          onClose={() => setPanelId(null)}
        />
      )}

      {addOpen && (
        <AddCertificateModal
          form={form}
          setForm={setForm}
          roster={roster}
          saving={saving}
          onClose={() => setAddOpen(false)}
          onSubmit={createCertificate}
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
        <BadgeCheck className="h-7 w-7 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">No certificates tracked yet</p>
      <p className="text-xs text-muted-foreground text-center max-w-sm">
        Add mechanic licenses and certificates to track their expiration dates.
      </p>
      <Button variant="outline" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Certificate
      </Button>
    </div>
  )
}

function CertificatePanel({
  cert, roster, onClose,
}: {
  cert: Certificate
  roster: RosterEntry[]
  onClose: () => void
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [reminderBusy, setReminderBusy] = useState(false)
  const [form, setForm] = useState<FormState>({
    user_id: cert.user_id ?? '',
    mechanic_name: cert.mechanic_name ?? '',
    certificate_type: cert.certificate_type ?? 'A&P Certificate',
    certificate_number: cert.certificate_number ?? '',
    issuing_authority: cert.issuing_authority ?? '',
    issue_date: cert.issue_date ? cert.issue_date.slice(0, 10) : '',
    expiration_date: cert.expiration_date ? cert.expiration_date.slice(0, 10) : '',
    renewal_reminder: cert.renewal_reminder,
    notes: cert.notes ?? '',
  })

  const status = expirationStatus(cert.expiration_date)
  const rosterName = cert.user_id
    ? roster.find((r) => r.user_id === cert.user_id)?.name ?? null
    : null
  const set = (k: keyof FormState, v: string | boolean) => setForm({ ...form, [k]: v })

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.mechanic_name.trim()) {
      toast.error('Mechanic is required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/mechanic-certificates/${cert.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: form.user_id || null,
          mechanic_name: form.mechanic_name.trim(),
          certificate_type: form.certificate_type,
          certificate_number: form.certificate_number.trim() || null,
          issuing_authority: form.issuing_authority.trim() || null,
          issue_date: form.issue_date || null,
          expiration_date: form.expiration_date || null,
          renewal_reminder: form.renewal_reminder,
          notes: form.notes.trim() || null,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(j?.error ?? 'Could not save changes')
        return
      }
      toast.success('Certificate updated')
      setEditing(false)
      router.refresh()
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function toggleReminder(next: boolean) {
    setReminderBusy(true)
    try {
      const res = await fetch(`/api/mechanic-certificates/${cert.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renewal_reminder: next }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j?.error ?? 'Could not update reminder')
        return
      }
      set('renewal_reminder', next)
      toast.success(next ? 'Renewal reminder on' : 'Renewal reminder off')
      router.refresh()
    } catch {
      toast.error('Network error')
    } finally {
      setReminderBusy(false)
    }
  }

  async function deleteCertificate() {
    if (!window.confirm('Delete this certificate? This cannot be undone.')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/mechanic-certificates/${cert.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j?.error ?? 'Could not delete certificate')
        return
      }
      toast.success('Certificate deleted')
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
              {cert.certificate_type || 'Certificate'}
            </div>
            <div className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>
              {cert.mechanic_name || rosterName || '—'}
            </div>
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
            <form onSubmit={saveEdit} className="space-y-3">
              <Field label="Mechanic *">
                <select
                  value={form.user_id}
                  onChange={(e) => {
                    const r = roster.find((x) => x.user_id === e.target.value)
                    setForm({ ...form, user_id: e.target.value, mechanic_name: r?.name ?? form.mechanic_name })
                  }}
                  className="w-full h-9 px-2.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Select mechanic…</option>
                  {roster.map((r) => <option key={r.user_id} value={r.user_id}>{r.name}</option>)}
                </select>
              </Field>
              <Field label="Mechanic Name *">
                <Text value={form.mechanic_name} onChange={(v) => set('mechanic_name', v)} />
              </Field>
              <Field label="Certificate Type">
                <select
                  value={form.certificate_type}
                  onChange={(e) => set('certificate_type', e.target.value)}
                  className="w-full h-9 px-2.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {CERT_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Certificate #"><Text value={form.certificate_number} onChange={(v) => set('certificate_number', v)} /></Field>
                <Field label="Issuing Authority"><Text value={form.issuing_authority} onChange={(v) => set('issuing_authority', v)} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Issue Date"><Text type="date" value={form.issue_date} onChange={(v) => set('issue_date', v)} /></Field>
                <Field label="Expiration Date"><Text type="date" value={form.expiration_date} onChange={(v) => set('expiration_date', v)} /></Field>
              </div>
              <Field label="Notes"><Text value={form.notes} onChange={(v) => set('notes', v)} /></Field>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                  Save
                </Button>
              </div>
            </form>
          ) : (
            <>
              <PanelSection title="License Details">
                <DetailRow label="Mechanic" value={cert.mechanic_name || rosterName} />
                <DetailRow label="Certificate Type" value={cert.certificate_type} />
                <DetailRow label="Certificate #" value={cert.certificate_number} />
                <DetailRow label="Issuing Authority" value={cert.issuing_authority} />
                <DetailRow label="Issue Date" value={fmtDate(cert.issue_date)} />
                <DetailRow label="Expiration Date" value={fmtDate(cert.expiration_date)} />
                {cert.notes && <DetailRow label="Notes" value={cert.notes} />}
              </PanelSection>

              <PanelSection title="Renewal Reminder">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.renewal_reminder}
                    disabled={reminderBusy}
                    onChange={(e) => toggleReminder(e.target.checked)}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] text-foreground">
                    <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                    Email me before this certificate expires
                  </span>
                </label>
              </PanelSection>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditing(true)}>
                  <Save className="h-4 w-4 mr-1.5" /> Edit
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 text-red-700 hover:text-red-800"
                  onClick={deleteCertificate}
                  disabled={deleting}
                >
                  {deleting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
                  Delete
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

function AddCertificateModal({
  form, setForm, roster, saving, onClose, onSubmit,
}: {
  form: FormState
  setForm: (f: FormState) => void
  roster: RosterEntry[]
  saving: boolean
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
}) {
  const set = (k: keyof FormState, v: string | boolean) => setForm({ ...form, [k]: v })
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-background rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Add Certificate</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={onSubmit} className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <Field label="Mechanic *">
            <select
              value={form.user_id}
              onChange={(e) => {
                const r = roster.find((x) => x.user_id === e.target.value)
                setForm({ ...form, user_id: e.target.value, mechanic_name: r?.name ?? '' })
              }}
              className="w-full h-9 px-2.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select mechanic…</option>
              {roster.map((r) => <option key={r.user_id} value={r.user_id}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="Certificate Type *">
            <select
              value={form.certificate_type}
              onChange={(e) => set('certificate_type', e.target.value)}
              className="w-full h-9 px-2.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {CERT_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Certificate #"><Text value={form.certificate_number} onChange={(v) => set('certificate_number', v)} /></Field>
            <Field label="Issuing Authority"><Text value={form.issuing_authority} onChange={(v) => set('issuing_authority', v)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Issue Date"><Text type="date" value={form.issue_date} onChange={(v) => set('issue_date', v)} /></Field>
            <Field label="Expiration Date"><Text type="date" value={form.expiration_date} onChange={(v) => set('expiration_date', v)} /></Field>
          </div>
          <Field label="Notes"><Text value={form.notes} onChange={(v) => set('notes', v)} /></Field>
          <label className="flex items-center gap-2.5 cursor-pointer pt-0.5">
            <input
              type="checkbox"
              checked={form.renewal_reminder}
              onChange={(e) => set('renewal_reminder', e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-foreground">
              <Bell className="h-3.5 w-3.5 text-muted-foreground" />
              Send a renewal reminder before expiration
            </span>
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Add Certificate
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
