'use client'

import { useState } from 'react'
import { X, Loader2, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ToolCategory } from '@/types'

const CATEGORIES: Array<{ value: ToolCategory; label: string }> = [
  { value: 'torque', label: 'Torque' },
  { value: 'measuring', label: 'Measuring' },
  { value: 'test-equipment', label: 'Test Equipment' },
  { value: 'jig', label: 'Jig' },
  { value: 'lift', label: 'Lift' },
  { value: 'borescope', label: 'Borescope' },
  { value: 'other', label: 'Other' },
]

export function ToolForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [serial, setSerial] = useState('')
  const [category, setCategory] = useState<ToolCategory>('torque')
  const [manufacturer, setManufacturer] = useState('')
  const [model, setModel] = useState('')
  const [calRequired, setCalRequired] = useState(true)
  const [intervalMonths, setIntervalMonths] = useState('12')
  const [toleranceDays, setToleranceDays] = useState('0')
  const [storageLocation, setStorageLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !serial.trim()) { toast.error('Name + serial required'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/tools', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          serial_number: serial.trim(),
          category,
          manufacturer: manufacturer.trim() || null,
          model: model.trim() || null,
          calibration_required: calRequired,
          calibration_interval_months: calRequired ? Number(intervalMonths) || 12 : null,
          tolerance_days: Number(toleranceDays) || 0,
          storage_location: storageLocation.trim() || null,
          notes: notes.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error ?? `Failed (${res.status})`); return }
      toast.success('Tool registered')
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
            <Wrench className="h-5 w-5 text-white" />
            <div>
              <div className="text-[15px] text-white" style={{ fontWeight: 700 }}>New Tool</div>
              <div className="text-[11px] text-white/60 mt-0.5">Calibrated assets the shop owns.</div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg text-white/70"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Torque Wrench 50–250 ft-lb" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Serial #</Label>
              <Input value={serial} onChange={(e) => setSerial(e.target.value)} className="font-mono" placeholder="TW-001" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Category</Label>
              <select value={category} onChange={(e) => setCategory(e.target.value as ToolCategory)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Manufacturer</Label>
              <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="Snap-on" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Model</Label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="ATECH3FR250" />
            </div>
          </div>

          <div className="border-t border-border pt-3 space-y-2">
            <label className="flex items-center gap-2 text-[12.5px] cursor-pointer">
              <input type="checkbox" checked={calRequired} onChange={(e) => setCalRequired(e.target.checked)} />
              <span style={{ fontWeight: 600 }}>Requires calibration</span>
            </label>
            {calRequired && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Interval (months)</Label>
                  <Input type="number" min="1" value={intervalMonths} onChange={(e) => setIntervalMonths(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Tolerance (days)</Label>
                  <Input type="number" min="0" value={toleranceDays} onChange={(e) => setToleranceDays(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Storage location</Label>
            <Input value={storageLocation} onChange={(e) => setStorageLocation(e.target.value)} placeholder="Tool crib · Shelf B-3" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Notes</Label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-border bg-muted/20 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Register tool
          </Button>
        </div>
      </form>
    </div>
  )
}
