'use client'

/**
 * ExpiringDocForm — create or edit an expiring document (Spec 2.6.2).
 *
 * Two modes:
 *   - doc=null  → POST /api/documents/expiring  (metadata-only insert)
 *   - doc=…     → PATCH /api/documents/[id]/expiration  (idempotent re-enqueue)
 *
 * Reminder offsets default to {-30, -14, -7, -1} for "30/14/7/1 days before",
 * which matches the spec's example reminder cadence. The server is what
 * actually computes next_fire_at — we just send the offset_days values.
 */

import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DOC_CATEGORIES_BY_PERSONA,
  type Document,
  type ExpirationPersona,
  type ReminderOffsetSpec,
} from '@/types'

const DEFAULT_OFFSETS = [-30, -14, -7, -1]

interface Props {
  doc?: Document | null
  presetAircraftId?: string | null
  onClose: () => void
  onSaved: () => void
}

const PERSONAS: Array<{ value: ExpirationPersona; label: string }> = [
  { value: 'owner', label: 'Owner' },
  { value: 'mechanic', label: 'Mechanic' },
  { value: 'shop', label: 'Shop' },
]

function offsetsToString(offsets: ReminderOffsetSpec[] | undefined | null): string {
  if (!Array.isArray(offsets) || offsets.length === 0) return DEFAULT_OFFSETS.map((n) => Math.abs(n)).join(', ')
  return offsets.map((o) => Math.abs(o.offset_days)).join(', ')
}

function parseOffsetsString(s: string): ReminderOffsetSpec[] {
  return s
    .split(/[,\s]+/)
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n >= 0)
    .map((days) => ({ offset_days: -Math.abs(Math.trunc(days)), channels: ['in-app'] }))
}

export function ExpiringDocForm({ doc, presetAircraftId, onClose, onSaved }: Props) {
  const isEdit = !!doc

  const [persona, setPersona] = useState<ExpirationPersona>(
    (doc?.target_persona as ExpirationPersona | null) ?? 'owner'
  )
  const [category, setCategory] = useState<string>(doc?.expiration_category ?? '')
  const [title, setTitle] = useState<string>(doc?.title ?? '')
  const [expiration, setExpiration] = useState<string>(doc?.expiration_date ?? '')
  const [effective, setEffective] = useState<string>(doc?.effective_date ?? '')
  const [issuer, setIssuer] = useState<string>(doc?.issued_by ?? '')
  const [docNumber, setDocNumber] = useState<string>(doc?.document_number ?? '')
  const [offsetsStr, setOffsetsStr] = useState<string>(offsetsToString(doc?.reminder_offsets))
  const [submitting, setSubmitting] = useState(false)

  const categories = useMemo(() => DOC_CATEGORIES_BY_PERSONA[persona] ?? [], [persona])

  // Default the category to the first one in the persona list when persona changes
  // (or stays empty for edit mode where it's already set).
  useEffect(() => {
    if (!isEdit && !category && categories.length > 0) {
      setCategory(categories[0])
    }
  }, [isEdit, category, categories])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('Title required'); return }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiration)) { toast.error('Expiration date required'); return }

    setSubmitting(true)
    try {
      const offsets = parseOffsetsString(offsetsStr)
      const body = {
        title: title.trim(),
        target_persona: persona,
        expiration_category: category.trim() || null,
        expiration_date: expiration,
        effective_date: effective || null,
        reminder_offsets: offsets,
        issued_by: issuer.trim() || null,
        document_number: docNumber.trim() || null,
        ...(isEdit ? {} : { aircraft_id: presetAircraftId ?? null }),
      }

      const res = await fetch(
        isEdit ? `/api/documents/${doc!.id}/expiration` : '/api/documents/expiring',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error ?? `Failed (${res.status})`); return }
      const reminders = data?.reminders_enqueued ?? 0
      toast.success(
        isEdit
          ? `Updated · ${reminders} reminder${reminders === 1 ? '' : 's'} re-queued`
          : `Tracked · ${reminders} reminder${reminders === 1 ? '' : 's'} queued`
      )
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-[600px] max-h-[88vh] flex flex-col overflow-hidden"
      >
        <div className="px-5 py-3.5 border-b border-border bg-gradient-to-br from-[#0A1628] to-[#1E3A5F] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CalendarClock className="h-5 w-5 text-white" />
            <div>
              <div className="text-[15px] text-white" style={{ fontWeight: 700 }}>
                {isEdit ? 'Edit expiring document' : 'Track expiring document'}
              </div>
              <div className="text-[11px] text-white/60 mt-0.5">
                Metadata-only — upload the file later. Reminders fire to the org.
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg text-white/70">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Persona</Label>
              <select
                value={persona}
                onChange={(e) => { setPersona(e.target.value as ExpirationPersona); setCategory('') }}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={isEdit}
              >
                {PERSONAS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Category</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Select…</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={persona === 'owner' ? 'e.g. N12345 Aircraft Registration' : 'e.g. A&P Cert · J. Smith'}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Effective date</Label>
              <Input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Expiration date</Label>
              <Input type="date" value={expiration} onChange={(e) => setExpiration(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Issued by</Label>
              <Input value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="FAA / Avemco / etc." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Document #</Label>
              <Input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} placeholder="optional" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
              Remind me — days before expiration
            </Label>
            <Input
              value={offsetsStr}
              onChange={(e) => setOffsetsStr(e.target.value)}
              placeholder="30, 14, 7, 1"
              className="font-mono"
            />
            <p className="text-[10.5px] text-muted-foreground">
              Comma-separated days. Each becomes one reminder. Channels default to in-app.
            </p>
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-border bg-muted/20 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            {isEdit ? 'Save & re-queue' : 'Track expiration'}
          </Button>
        </div>
      </form>
    </div>
  )
}
