'use client'

/**
 * ToolDetail — calibration history + checkout history + log/checkout
 * actions inline (Spec 2.6.1).
 */

import { useCallback, useEffect, useState } from 'react'
import { Wrench, AlertTriangle, CheckCircle2, Loader2, LogIn, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { Tool, CalibrationEvent, ToolCheckout } from '@/types'

interface Props {
  initialTool: Tool
  currentUserId: string
  isAdmin: boolean
}

export function ToolDetail({ initialTool, currentUserId, isAdmin }: Props) {
  const [tool, setTool] = useState<Tool>(initialTool)
  const [calibrations, setCalibrations] = useState<CalibrationEvent[]>([])
  const [checkouts, setCheckouts] = useState<ToolCheckout[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showCalForm, setShowCalForm] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tools/${tool.id}`)
      if (!res.ok) return
      const data = await res.json()
      setTool(data.tool as Tool)
      setCalibrations((data.calibrations ?? []) as CalibrationEvent[])
      setCheckouts((data.checkouts ?? []) as ToolCheckout[])
    } finally { setLoading(false) }
  }, [tool.id])

  useEffect(() => { void reload() }, [reload])

  const today = new Date().toISOString().slice(0, 10)
  const overdue = !!(tool.calibration_required && tool.next_calibration_date && tool.next_calibration_date < today)
  const openCheckout = checkouts.find((c) => !c.returned_at) ?? null

  async function checkOut() {
    setBusy(true)
    try {
      const res = await fetch(`/api/tools/${tool.id}/checkout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error ?? `Failed (${res.status})`); return }
      toast.success('Checked out')
      void reload()
    } finally { setBusy(false) }
  }

  async function returnTool() {
    if (!openCheckout) return
    const cond = prompt("Condition? Type 'damaged' or 'needs-recalibration', or leave blank for OK.") ?? ''
    setBusy(true)
    try {
      const res = await fetch(`/api/tool-checkouts/${openCheckout.id}/return`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ condition: cond === 'damaged' || cond === 'needs-recalibration' ? cond : 'ok' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error ?? `Failed (${res.status})`); return }
      toast.success('Returned')
      void reload()
    } finally { setBusy(false) }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      {/* Header card */}
      <div className={cn(
        'rounded-2xl border p-5',
        overdue ? 'bg-red-50/40 border-red-200' : 'bg-white border-border',
      )}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Wrench className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-[20px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>{tool.name}</h1>
              <span className="text-[11px] text-muted-foreground font-mono">{tool.serial_number}</span>
            </div>
            <div className="text-[12px] text-muted-foreground mt-1 capitalize">
              {tool.category.replace('-', ' ')} · {tool.manufacturer ?? '—'}{tool.model ? ` ${tool.model}` : ''} · status: <span style={{ fontWeight: 600 }}>{tool.status}</span>
            </div>
            {overdue && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-red-700 bg-red-100/50 px-2 py-1 rounded">
                <AlertTriangle className="h-3.5 w-3.5" /> Overdue calibration · next due was {tool.next_calibration_date}
              </div>
            )}
            {!overdue && tool.next_calibration_date && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> Next calibration: {tool.next_calibration_date}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            <Button onClick={() => setShowCalForm((s) => !s)} variant="outline" size="sm">
              {showCalForm ? 'Cancel' : 'Log calibration'}
            </Button>
            {openCheckout ? (
              <Button onClick={returnTool} disabled={busy} size="sm" variant="outline">
                {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <LogIn className="h-3 w-3 mr-1" />}
                Return
              </Button>
            ) : (
              <Button onClick={checkOut} disabled={busy || tool.status !== 'available'} size="sm">
                {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <LogOut className="h-3 w-3 mr-1" />}
                Check out
              </Button>
            )}
          </div>
        </div>

        {showCalForm && (
          <CalibrationLogForm
            toolId={tool.id}
            intervalMonths={tool.calibration_interval_months ?? 12}
            onLogged={() => { setShowCalForm(false); void reload() }}
          />
        )}
      </div>

      {/* Calibration history */}
      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border">
          <h2 className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>Calibration history</h2>
        </div>
        {calibrations.length === 0 ? (
          <p className="text-[12px] text-muted-foreground/60 italic p-4">No calibrations logged yet.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                {['Date', 'Performed by', 'Cert #', 'Result', 'Cost', 'Next due'].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {calibrations.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2 tabular-nums text-foreground">{c.performed_at}</td>
                  <td className="px-3 py-2 text-foreground">{c.performed_by}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{c.certificate_number ?? '—'}</td>
                  <td className="px-3 py-2 capitalize">{c.result}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{c.cost != null ? `$${c.cost.toFixed(2)}` : '—'}</td>
                  <td className="px-3 py-2 tabular-nums text-foreground" style={{ fontWeight: 600 }}>{c.next_due_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Checkout history */}
      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border">
          <h2 className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>Checkout history</h2>
        </div>
        {checkouts.length === 0 ? (
          <p className="text-[12px] text-muted-foreground/60 italic p-4">Never checked out.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                {['Out', 'Returned', 'Condition', 'Notes'].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {checkouts.map((co) => (
                <tr key={co.id} className={!co.returned_at ? 'bg-blue-50/30' : ''}>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{new Date(co.checked_out_at).toLocaleString()}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{co.returned_at ? new Date(co.returned_at).toLocaleString() : <span className="text-blue-700" style={{ fontWeight: 600 }}>still out</span>}</td>
                  <td className="px-3 py-2 text-muted-foreground">{co.condition_at_return ?? '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground truncate max-w-[280px]">{co.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

/* ─── Inline calibration log form ──────────────────────────── */
function CalibrationLogForm({
  toolId, intervalMonths, onLogged,
}: { toolId: string; intervalMonths: number; onLogged: () => void }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [performedBy, setPerformedBy] = useState('in-house')
  const [certNum, setCertNum] = useState('')
  const [result, setResult] = useState<'pass' | 'fail' | 'adjusted'>('pass')
  const [cost, setCost] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Auto-compute next-due preview from interval
  const nextDuePreview = (() => {
    const d = new Date(date + 'T00:00:00')
    d.setMonth(d.getMonth() + (intervalMonths || 12))
    return d.toISOString().slice(0, 10)
  })()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!performedBy.trim()) { toast.error('Who performed the calibration?'); return }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/tools/${toolId}/calibrations`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          performed_at: date,
          performed_by: performedBy.trim(),
          certificate_number: certNum.trim() || null,
          result,
          cost: cost ? Number(cost) : null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error ?? `Failed (${res.status})`); return }
      toast.success(`Calibration logged · next due ${data.tool?.next_calibration_date ?? '?'}`)
      onLogged()
    } finally { setSubmitting(false) }
  }

  return (
    <form onSubmit={submit} className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Date</Label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Performed by</Label>
        <Input value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} placeholder='Vendor name or "in-house"' />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Cert #</Label>
        <Input value={certNum} onChange={(e) => setCertNum(e.target.value)} className="font-mono" placeholder="optional" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Result</Label>
        <select value={result} onChange={(e) => setResult(e.target.value as any)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
          <option value="pass">Pass</option>
          <option value="adjusted">Adjusted</option>
          <option value="fail">Fail</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Cost ($)</Label>
        <Input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="optional" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Next due (auto)</Label>
        <Input value={nextDuePreview} readOnly className="bg-muted/40 cursor-not-allowed" />
      </div>
      <div className="col-span-2 flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
          Log calibration
        </Button>
      </div>
    </form>
  )
}
