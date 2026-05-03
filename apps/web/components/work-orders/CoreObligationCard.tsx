'use client'

/**
 * CoreObligationCard (Spec 3.2) — surfaces core obligations for one WO.
 *
 * Mounts on the work-order detail surface. Lists pending/received/
 * overdue/waived rows and lets mechanic+ flip status with a single tap.
 */

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Package, AlertCircle, Check, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CoreObligation, CoreObligationStatus } from '@/types'

interface Props {
  workOrderId: string
  canWrite: boolean
}

const TONE: Record<CoreObligationStatus, string> = {
  pending:  'bg-amber-50 text-amber-700 border-amber-200',
  received: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  overdue:  'bg-rose-50 text-rose-700 border-rose-200',
  waived:   'bg-slate-50 text-slate-600 border-slate-200',
}

function fmt$(n: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)
}

export function CoreObligationCard({ workOrderId, canWrite }: Props) {
  const [items, setItems] = useState<CoreObligation[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/core-obligations?work_order_id=${workOrderId}`)
      const json = (await res.json()) as { obligations?: CoreObligation[]; error?: string }
      if (!res.ok) { setError(json.error ?? `HTTP ${res.status}`); return }
      setItems(json.obligations ?? [])
    } finally {
      setLoading(false)
    }
  }, [workOrderId])

  useEffect(() => { void load() }, [load])

  async function flip(o: CoreObligation, status: CoreObligationStatus) {
    setUpdating(o.id)
    try {
      const res = await fetch(`/api/core-obligations/${o.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
      toast.success(`Marked ${status}`)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setUpdating(null)
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-white p-4 text-center text-[12px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
      </div>
    )
  }
  if (items.length === 0) return null

  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <Package className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-[14px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
          Core obligations ({items.length})
        </h3>
      </div>
      {error && (
        <div className="mb-2 rounded-md border border-rose-200 bg-rose-50 p-2 text-[11.5px] text-rose-800 flex gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {error}
        </div>
      )}
      <div className="space-y-2">
        {items.map((o) => (
          <div key={o.id} className="border border-border rounded-lg p-3 bg-muted/10">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[12.5px] font-mono">{o.part_number}</div>
                {o.description && (
                  <div className="text-[11.5px] text-muted-foreground truncate">{o.description}</div>
                )}
              </div>
              <span className={cn('inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border', TONE[o.status])} style={{ fontWeight: 700 }}>
                {o.status}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11.5px] text-muted-foreground tabular-nums">
              <span>Charge: <strong>{fmt$(o.core_charge)}</strong></span>
              <span>Due: {o.due_date ?? '—'}</span>
            </div>
            {canWrite && (o.status === 'pending' || o.status === 'overdue') && (
              <div className="mt-2 inline-flex gap-2">
                <Button size="sm" onClick={() => void flip(o, 'received')} disabled={updating === o.id}>
                  {updating === o.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
                  Mark received
                </Button>
                <Button variant="outline" size="sm" onClick={() => void flip(o, 'waived')}>
                  <RotateCcw className="h-3 w-3 mr-1" /> Waive
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
