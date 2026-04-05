'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Aircraft { id: string; tail_number: string; make?: string | null; model?: string | null }

const BATCH_TYPES = [
  { value: 'historical_logbook', label: 'Historical logbook' },
  { value: 'work_order', label: 'Work order' },
  { value: 'discrepancy', label: 'Discrepancy' },
  { value: 'general_records', label: 'General records' },
  { value: 'unknown', label: 'Unsure (classify later)' },
]

export function NewBatchButton({ aircraft }: { aircraft: Aircraft[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('')
  const [batchType, setBatchType] = useState('historical_logbook')
  const [aircraftId, setAircraftId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setBusy(true); setError(null)
    try {
      const resp = await fetch('/api/scanner/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || null,
          batch_type: batchType,
          source_mode: 'batch',
          aircraft_id: aircraftId || null,
        }),
      })
      const j = await resp.json()
      if (!resp.ok) throw new Error(j.error ?? 'Create failed')
      setOpen(false)
      router.push(`/scanner/${j.id}`)
    } catch (err: any) {
      setError(err?.message ?? 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="h-8 text-xs">
        <Plus className="h-3.5 w-3.5 mr-1" />
        New batch
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-xl bg-card border border-border p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-foreground">Start new scan batch</h2>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-foreground">Title</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. N12345 engine logbook 2018-2023"
                  className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Batch type</label>
                <select
                  value={batchType}
                  onChange={e => setBatchType(e.target.value)}
                  className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {BATCH_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Aircraft</label>
                <select
                  value={aircraftId}
                  onChange={e => setAircraftId(e.target.value)}
                  className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Unassigned</option>
                  {aircraft.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.tail_number}{a.make && a.model ? ` · ${a.make} ${a.model}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button size="sm" onClick={create} disabled={busy}>
                {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Creating…</> : 'Create & Capture'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
