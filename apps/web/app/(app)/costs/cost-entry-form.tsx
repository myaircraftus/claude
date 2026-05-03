'use client'

/**
 * CostEntryForm (Spec 7.1) — manual cost entry modal.
 *
 * Picks an aircraft (org's list, optional), category from the seed list,
 * auto-suggests bucket based on category. Posts to /api/costs.
 */

import { useEffect, useMemo, useState } from 'react'
import { DollarSign, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ALL_CATEGORIES,
  CATEGORY_LABEL,
  BUCKET_LABEL,
  DEFAULT_BUCKET,
  type CostBucket,
  type CostCategory,
} from '@/lib/costs/categories'

interface AircraftOpt { id: string; tail_number: string; make?: string | null; model?: string | null }

export function CostEntryForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [aircraft, setAircraft] = useState<AircraftOpt[]>([])
  const [aircraftId, setAircraftId] = useState<string>('')
  const [category, setCategory] = useState<CostCategory>('fuel')
  const [bucket, setBucket] = useState<CostBucket>('variable_per_hour')
  const [amount, setAmount] = useState<string>('')
  const [costDate, setCostDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetch('/api/aircraft', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      const list = (Array.isArray(data?.aircraft) ? data.aircraft : Array.isArray(data) ? data : []) as AircraftOpt[]
      if (cancelled) return
      setAircraft(list.filter((a) => a.id && a.tail_number))
    })()
    return () => { cancelled = true }
  }, [])

  // Auto-snap bucket when category changes (operator can override).
  useEffect(() => {
    setBucket(DEFAULT_BUCKET[category])
  }, [category])

  const aircraftLabel = useMemo(() => {
    if (!aircraftId) return 'No aircraft (org-wide cost)'
    const a = aircraft.find((x) => x.id === aircraftId)
    if (!a) return 'No aircraft (org-wide cost)'
    return `${a.tail_number}${a.make ? ` · ${a.make}${a.model ? ' ' + a.model : ''}` : ''}`
  }, [aircraft, aircraftId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const a = parseFloat(amount)
    if (!Number.isFinite(a) || a < 0) { toast.error('Amount required'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/costs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          aircraft_id: aircraftId || null,
          category,
          bucket,
          amount: a,
          cost_date: costDate,
          description: description.trim() || null,
          notes: notes.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error ?? `Failed (${res.status})`); return }
      toast.success(`Logged $${a.toFixed(2)} · ${CATEGORY_LABEL[category]}`)
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-[560px] max-h-[88vh] flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border bg-gradient-to-br from-[#0A1628] to-[#1E3A5F] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <DollarSign className="h-5 w-5 text-white" />
            <div>
              <div className="text-[15px] text-white" style={{ fontWeight: 700 }}>New cost</div>
              <div className="text-[11px] text-white/60 mt-0.5">Manual entry. Receipts + email forward land in 7.2 / 7.3.</div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg text-white/70">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Aircraft</Label>
            <select
              value={aircraftId}
              onChange={(e) => setAircraftId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">No aircraft (org-wide cost)</option>
              {aircraft.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.tail_number}{a.make ? ` · ${a.make}${a.model ? ' ' + a.model : ''}` : ''}
                </option>
              ))}
            </select>
            <p className="text-[10.5px] text-muted-foreground">{aircraftLabel}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Category</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as CostCategory)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {ALL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Bucket</Label>
              <select
                value={bucket}
                onChange={(e) => setBucket(e.target.value as CostBucket)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {(Object.keys(BUCKET_LABEL) as CostBucket[]).map((b) => (
                  <option key={b} value={b}>{BUCKET_LABEL[b]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Amount (USD)</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="87.40" className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Date</Label>
              <Input type="date" value={costDate} onChange={(e) => setCostDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="100LL — KAPA self-serve" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Notes</Label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-border bg-muted/20 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Save cost
          </Button>
        </div>
      </form>
    </div>
  )
}
