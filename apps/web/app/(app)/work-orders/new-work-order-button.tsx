'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, X, Loader2 } from 'lucide-react'

interface Aircraft {
  id: string
  tail_number: string
}

export function NewWorkOrderButton({ aircraft }: { aircraft: Aircraft[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [aircraftId, setAircraftId] = useState('')
  const [complaint, setComplaint] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft_id: aircraftId || null,
          complaint: complaint || null,
          status: 'open',
        }),
      })
      const data = await res.json()
      if (data.id) {
        setOpen(false)
        router.push(`/work-orders/${data.id}`)
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1.5" />
        New Work Order
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-base font-semibold">New Work Order</h2>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <Label htmlFor="nwo-aircraft">Aircraft</Label>
                <select
                  id="nwo-aircraft"
                  value={aircraftId}
                  onChange={e => setAircraftId(e.target.value)}
                  className="w-full mt-1 h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">No aircraft</option>
                  {aircraft.map(ac => (
                    <option key={ac.id} value={ac.id}>{ac.tail_number}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="nwo-complaint">Initial Complaint</Label>
                <Input
                  id="nwo-complaint"
                  value={complaint}
                  onChange={e => setComplaint(e.target.value)}
                  placeholder="Brief description of the issue"
                  className="mt-1"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" className="flex-1" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
