'use client'

/**
 * ProcedureBuilder (Spec 1.3) — create OR edit a procedure.
 *
 * Wholesale-replace shape: the form state owns the entire sections+items
 * tree, and on save we POST (create) or PATCH (with `sections` body —
 * route does delete-and-reinsert) the whole thing. Section / item-level
 * granular edits via dedicated endpoints are a logged follow-up; this
 * keeps the v1.3 surface small.
 */

import { useState } from 'react'
import { Plus, Trash2, Loader2, ChevronUp, ChevronDown, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Procedure, ProcedureSection, ProcedureItem, ProcedureItemInputType } from '@/types'

interface DraftItem {
  id?: string
  text: string
  input_type: ProcedureItemInputType
  reference: string
  requires_photo: boolean
}

interface DraftSection {
  id?: string
  title: string
  items: DraftItem[]
}

const INPUT_TYPE_OPTIONS: { value: ProcedureItemInputType; label: string }[] = [
  { value: 'checkbox',  label: 'Check' },
  { value: 'pass-fail', label: 'Pass/Fail' },
  { value: 'value',     label: 'Value' },
  { value: 'photo',     label: 'Photo' },
  { value: 'signature', label: 'Signature' },
]

function emptyItem(): DraftItem {
  return { text: '', input_type: 'checkbox', reference: '', requires_photo: false }
}

function emptySection(): DraftSection {
  return { title: '', items: [emptyItem()] }
}

export function ProcedureBuilder({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Procedure & { sections: Array<ProcedureSection & { items: ProcedureItem[] }> }
  onSaved: (id: string) => void
  onCancel: () => void
}) {
  const editing = !!initial
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [appliesToInput, setAppliesToInput] = useState((initial?.applies_to ?? []).join(', '))
  const [sections, setSections] = useState<DraftSection[]>(
    initial?.sections?.length
      ? initial.sections.map((s) => ({
          id: s.id,
          title: s.title,
          items: s.items.map((it) => ({
            id: it.id,
            text: it.text,
            input_type: it.input_type,
            reference: it.reference ?? '',
            requires_photo: it.requires_photo,
          })),
        }))
      : [emptySection()],
  )
  const [submitting, setSubmitting] = useState(false)

  function updateSection(idx: number, patch: Partial<DraftSection>) {
    setSections((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }
  function moveSection(idx: number, dir: -1 | 1) {
    setSections((prev) => {
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }
  function addSection() {
    setSections((prev) => [...prev, emptySection()])
  }
  function removeSection(idx: number) {
    setSections((prev) => prev.filter((_, i) => i !== idx))
  }
  function updateItem(sIdx: number, iIdx: number, patch: Partial<DraftItem>) {
    setSections((prev) =>
      prev.map((s, si) =>
        si === sIdx
          ? { ...s, items: s.items.map((it, ii) => (ii === iIdx ? { ...it, ...patch } : it)) }
          : s,
      ),
    )
  }
  function addItem(sIdx: number) {
    setSections((prev) =>
      prev.map((s, si) => (si === sIdx ? { ...s, items: [...s.items, emptyItem()] } : s)),
    )
  }
  function removeItem(sIdx: number, iIdx: number) {
    setSections((prev) =>
      prev.map((s, si) =>
        si === sIdx ? { ...s, items: s.items.filter((_, ii) => ii !== iIdx) } : s,
      ),
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { toast.error('Name is required'); return }
    if (sections.length === 0 || sections.some((s) => !s.title.trim())) {
      toast.error('Each section needs a title'); return
    }
    if (sections.some((s) => s.items.some((it) => !it.text.trim()))) {
      toast.error('Each item needs text'); return
    }
    setSubmitting(true)
    try {
      const appliesTo = appliesToInput
        .split(',').map((s) => s.trim()).filter(Boolean)
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        applies_to: appliesTo,
        sections: sections.map((s) => ({
          title: s.title.trim(),
          items: s.items.map((it) => ({
            text: it.text.trim(),
            input_type: it.input_type,
            reference: it.reference.trim() || null,
            requires_photo: it.requires_photo,
          })),
        })),
      }
      const url = editing ? `/api/procedures/${initial!.id}` : '/api/procedures'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(out?.error || 'Save failed')
        return
      }
      toast.success(editing ? 'Procedure updated' : `Created "${name.trim()}"`)
      onSaved(out?.procedure?.id ?? initial?.id ?? '')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-border p-5 space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
          {editing ? `Edit procedure — ${initial!.name}` : 'New procedure'}
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cessna 172 Annual Inspection" className={inputCls} />
        </Field>
        <Field label="Applies to (comma-separated make/model)" hint="optional filter">
          <input value={appliesToInput} onChange={(e) => setAppliesToInput(e.target.value)} placeholder="Cessna 172, Piper PA-28" className={inputCls} />
        </Field>
      </div>
      <Field label="Description">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputCls} resize-none`} rows={2} />
      </Field>

      <div className="border-t border-border pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
            Sections
          </span>
          <button type="button" onClick={addSection} className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline" style={{ fontWeight: 500 }}>
            <Plus className="h-3 w-3" /> Add section
          </button>
        </div>

        <div className="space-y-3">
          {sections.map((sec, sIdx) => (
            <div key={sIdx} className="rounded-xl border border-border p-3 bg-muted/10">
              <div className="flex items-center gap-2">
                <input
                  value={sec.title}
                  onChange={(e) => updateSection(sIdx, { title: e.target.value })}
                  placeholder="Section title (e.g. Engine)"
                  className={`${inputCls} mt-0`}
                  style={{ fontWeight: 600 }}
                />
                <button type="button" onClick={() => moveSection(sIdx, -1)} disabled={sIdx === 0} className={iconBtnCls(sIdx === 0)} title="Move up"><ChevronUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => moveSection(sIdx, 1)} disabled={sIdx === sections.length - 1} className={iconBtnCls(sIdx === sections.length - 1)} title="Move down"><ChevronDown className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => removeSection(sIdx)} disabled={sections.length === 1} className={iconBtnCls(sections.length === 1)} title="Remove section"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>

              <ul className="mt-2 space-y-1.5">
                {sec.items.map((it, iIdx) => (
                  <li key={iIdx} className="grid grid-cols-1 md:grid-cols-[1fr,120px,120px,auto,auto] gap-2 items-center">
                    <input
                      value={it.text}
                      onChange={(e) => updateItem(sIdx, iIdx, { text: e.target.value })}
                      placeholder="Item text (e.g. Inspect spark plugs)"
                      className={`${inputCls} mt-0`}
                    />
                    <select value={it.input_type} onChange={(e) => updateItem(sIdx, iIdx, { input_type: e.target.value as ProcedureItemInputType })} className={`${inputCls} mt-0`}>
                      {INPUT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <input
                      value={it.reference}
                      onChange={(e) => updateItem(sIdx, iIdx, { reference: e.target.value })}
                      placeholder="FAR/manual ref"
                      className={`${inputCls} mt-0`}
                    />
                    <label className="inline-flex items-center gap-1 text-[11px] text-foreground cursor-pointer">
                      <input type="checkbox" checked={it.requires_photo} onChange={(e) => updateItem(sIdx, iIdx, { requires_photo: e.target.checked })} className="rounded border-border" />
                      photo
                    </label>
                    <button type="button" onClick={() => removeItem(sIdx, iIdx)} disabled={sec.items.length === 1} className={iconBtnCls(sec.items.length === 1)} title="Remove item"><Trash2 className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
              </ul>

              <button type="button" onClick={() => addItem(sIdx)} className="mt-2 inline-flex items-center gap-1 text-[12px] text-primary hover:underline" style={{ fontWeight: 500 }}>
                <Plus className="h-3 w-3" /> Add item
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
          {editing ? 'Save changes' : 'Create procedure'}
        </Button>
      </div>
    </form>
  )
}

const inputCls =
  'mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-primary'

function iconBtnCls(disabled: boolean) {
  return cn(
    'p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground',
    disabled && 'opacity-40 cursor-not-allowed',
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 600 }}>
        {label}
      </label>
      {children}
      {hint && <div className="text-[10.5px] text-muted-foreground/80 mt-0.5">{hint}</div>}
    </div>
  )
}
