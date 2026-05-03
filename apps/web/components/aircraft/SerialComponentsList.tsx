'use client'

/**
 * SerialComponentsList (Spec 3.2) — currently-installed components on an
 * aircraft + their move history. Mounts on the AircraftDetail "Engines &
 * Props" tab (or as a sub-route — same Path-B pattern as 1.2/3.1).
 */

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, History, Wrench, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SerialComponent, ComponentClass, ComponentStatus, ComponentMove } from '@/types'

interface Props {
  aircraftId: string
  tailNumber: string
  canWrite: boolean
}

const CLASSES: ComponentClass[] = ['engine', 'propeller', 'magneto', 'alternator', 'starter', 'other']

export function SerialComponentsList({ aircraftId, tailNumber, canWrite }: Props) {
  const [items, setItems] = useState<SerialComponent[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showHistoryFor, setShowHistoryFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/serial-components?aircraft_id=${aircraftId}`)
      const json = (await res.json()) as { components?: SerialComponent[]; error?: string }
      if (!res.ok) { setError(json.error ?? `HTTP ${res.status}`); return }
      setItems(json.components ?? [])
    } finally {
      setLoading(false)
    }
  }, [aircraftId])

  useEffect(() => { void load() }, [load])

  async function quickCreate(klass: ComponentClass) {
    const partNumber = window.prompt(`Part number for new ${klass}:`)
    if (!partNumber) return
    const serialNumber = window.prompt(`Serial number for ${partNumber}:`)
    if (!serialNumber) return
    setCreating(true)
    try {
      const res = await fetch('/api/serial-components', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          part_number: partNumber, serial_number: serialNumber,
          component_class: klass, installed_on_aircraft: aircraftId, status: 'installed',
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
      toast.success(`${klass} ${serialNumber} installed`)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-white p-8 text-center text-[12px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" /> Loading…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-800 flex gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-white">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-[14px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
              Engines & Props — {tailNumber}
            </h3>
            <p className="text-[11.5px] text-muted-foreground">
              Currently installed serialized components. Persist across aircraft moves.
            </p>
          </div>
          {canWrite && (
            <div className="inline-flex gap-1 flex-wrap">
              {CLASSES.map((k) => (
                <Button
                  key={k}
                  variant="outline"
                  size="sm"
                  onClick={() => void quickCreate(k)}
                  disabled={creating}
                >
                  <Plus className="h-3 w-3 mr-0.5" /> {k}
                </Button>
              ))}
            </div>
          )}
        </div>
        {items.length === 0 ? (
          <div className="text-center py-10">
            <Wrench className="w-5 h-5 mx-auto mb-2 text-muted-foreground/50" />
            <p className="text-[12px] text-muted-foreground">No components recorded for this aircraft.</p>
          </div>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead className="bg-muted/15 border-b border-border">
              <tr>
                {['Class', 'P/N', 'S/N', 'Status', 'HSN', 'HSO', ''].map((h, i) => (
                  <th key={i} className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((c) => (
                <RowAndHistory
                  key={c.id}
                  c={c}
                  showHistory={showHistoryFor === c.id}
                  onToggleHistory={() => setShowHistoryFor((cur) => (cur === c.id ? null : c.id))}
                  canWrite={canWrite}
                  onMoved={load}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function RowAndHistory({
  c, showHistory, onToggleHistory, canWrite, onMoved,
}: {
  c: SerialComponent
  showHistory: boolean
  onToggleHistory: () => void
  canWrite: boolean
  onMoved: () => Promise<void> | void
}) {
  const statusTone =
    c.status === 'installed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    c.status === 'in-stock' ? 'bg-blue-50 text-blue-700 border-blue-200' :
    c.status === 'in-overhaul' ? 'bg-amber-50 text-amber-700 border-amber-200' :
    'bg-rose-50 text-rose-700 border-rose-200'

  return (
    <>
      <tr className="hover:bg-muted/15">
        <td className="px-3 py-1.5 capitalize">{c.component_class}</td>
        <td className="px-3 py-1.5 font-mono">{c.part_number}</td>
        <td className="px-3 py-1.5 font-mono">{c.serial_number}</td>
        <td className="px-3 py-1.5">
          <span className={cn('inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border', statusTone)} style={{ fontWeight: 700 }}>
            {c.status}
          </span>
        </td>
        <td className="px-3 py-1.5 tabular-nums">{c.hours_since_new.toFixed(1)}</td>
        <td className="px-3 py-1.5 tabular-nums">{c.hours_since_overhaul.toFixed(1)}</td>
        <td className="px-3 py-1.5 text-right">
          <button
            onClick={onToggleHistory}
            className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
            style={{ fontWeight: 600 }}
          >
            <History className="h-3 w-3" /> {(c.removal_history ?? []).length} moves
          </button>
        </td>
      </tr>
      {showHistory && (
        <tr>
          <td colSpan={7} className="px-3 py-2 bg-muted/10">
            <div className="space-y-1 text-[11.5px] font-mono">
              {(c.removal_history ?? []).map((m: ComponentMove, i) => (
                <div key={i}>
                  {m.date} · {m.from_status ?? '—'} → {m.to_status}{m.work_order_id ? ` · WO ${m.work_order_id.slice(0, 8)}` : ''}{m.notes ? ` · ${m.notes}` : ''}
                </div>
              ))}
            </div>
            {canWrite && (
              <div className="mt-2 inline-flex gap-2">
                {c.status !== 'in-overhaul' && (
                  <Button variant="outline" size="sm" onClick={() => void quickMove(c, 'in-overhaul', onMoved)}>Send to overhaul</Button>
                )}
                {c.status !== 'in-stock' && (
                  <Button variant="outline" size="sm" onClick={() => void quickMove(c, 'in-stock', onMoved)}>Mark in-stock</Button>
                )}
                {c.status !== 'scrapped' && (
                  <Button variant="outline" size="sm" onClick={() => void quickMove(c, 'scrapped', onMoved)} className="text-rose-700 hover:bg-rose-50">Scrap</Button>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

async function quickMove(c: SerialComponent, to_status: ComponentStatus, onDone: () => Promise<void> | void) {
  const notes = window.prompt(`Notes for moving ${c.serial_number} → ${to_status}:`) ?? ''
  try {
    const res = await fetch(`/api/serial-components/${c.id}/move`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to_status, notes }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
    toast.success(`Moved to ${to_status}`)
    await onDone()
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Move failed')
  }
}
