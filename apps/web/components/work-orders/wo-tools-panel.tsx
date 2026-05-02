'use client'

/**
 * WoToolsPanel — embeddable "Tools Used" section for the WO detail
 * (Spec 2.6.1 cross-wire). Adding an overdue tool is BLOCKED server-
 * side at /api/work-orders/[id]/tools (returns 409 + reason); the UI
 * surfaces the error inline with a "Tool requires calibration before
 * use" toast.
 */

import { useCallback, useEffect, useState } from 'react'
import { Wrench, Plus, AlertTriangle, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { Tool, WorkOrderToolUse } from '@/types'

type UseRow = WorkOrderToolUse & {
  tools?: { id: string; name: string; serial_number: string; category: string; status: string; next_calibration_date: string | null } | null
}

export function WoToolsPanel({ workOrderId }: { workOrderId: string }) {
  const [uses, setUses] = useState<UseRow[]>([])
  const [available, setAvailable] = useState<Tool[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [usesRes, availRes] = await Promise.all([
        fetch(`/api/work-orders/${workOrderId}/tools`),
        fetch('/api/tools'),
      ])
      const usesJson = usesRes.ok ? await usesRes.json() : { uses: [] }
      const availJson = availRes.ok ? await availRes.json() : { tools: [] }
      setUses((usesJson.uses ?? []) as UseRow[])
      setAvailable((availJson.tools ?? []) as Tool[])
    } finally { setLoading(false) }
  }, [workOrderId])

  useEffect(() => { void reload() }, [reload])

  async function addTool(toolId: string) {
    setBusyId(toolId)
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/tools`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tool_id: toolId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data?.code === 'TOOL_REQUIRES_CALIBRATION') {
          toast.error(data.error, { description: 'Adding this tool was blocked. Recalibrate it first.' })
        } else {
          toast.error(data?.error ?? `Failed (${res.status})`)
        }
        return
      }
      toast.success('Tool added')
      setPickerOpen(false)
      void reload()
    } finally { setBusyId(null) }
  }

  async function removeTool(useId: string) {
    if (!confirm('Remove this tool use?')) return
    setBusyId(useId)
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/tools`, {
        method: 'DELETE', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ use_id: useId }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j?.error ?? `Failed (${res.status})`)
        return
      }
      void reload()
    } finally { setBusyId(null) }
  }

  const today = new Date().toISOString().slice(0, 10)
  const toolsAlreadyOnWO = new Set(uses.map((u) => u.tool_id))

  return (
    <div className="bg-white rounded-xl border border-border p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>Tools used</h3>
          <span className="text-[11px] text-muted-foreground">{uses.length}</span>
        </div>
        <Button size="sm" onClick={() => setPickerOpen((o) => !o)}>
          <Plus className="h-3 w-3 mr-1" /> {pickerOpen ? 'Cancel' : 'Add tool'}
        </Button>
      </div>

      {loading ? (
        <div className="text-[12px] text-muted-foreground py-3 text-center">Loading…</div>
      ) : uses.length === 0 ? (
        <p className="text-[12px] text-muted-foreground/60 italic">No tools recorded on this WO yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {uses.map((u) => {
            const t = u.tools
            const overdue = !!(t?.next_calibration_date && t.next_calibration_date < today)
            return (
              <li key={u.id} className={`flex items-center justify-between gap-3 px-3 py-2 rounded-md border ${u.was_overdue ? 'border-red-200 bg-red-50/40' : overdue ? 'border-amber-200 bg-amber-50/40' : 'border-border bg-muted/20'}`}>
                <div className="min-w-0">
                  <div className="text-[12.5px] text-foreground truncate" style={{ fontWeight: 600 }}>
                    {t?.name ?? 'Unknown tool'} <span className="font-mono text-[11px] text-muted-foreground">{t?.serial_number}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Used {new Date(u.used_at).toLocaleString()}
                    {u.was_overdue && <span className="ml-2 text-red-700 inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Logged while overdue</span>}
                    {!u.was_overdue && overdue && <span className="ml-2 text-amber-700">Now overdue (was current at use)</span>}
                  </div>
                </div>
                <button onClick={() => removeTool(u.id)} disabled={busyId === u.id}
                  className="text-muted-foreground hover:text-red-600 p-1 rounded">
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {pickerOpen && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2" style={{ fontWeight: 700 }}>
            Pick a tool — overdue tools will be blocked
          </p>
          <div className="max-h-[260px] overflow-auto space-y-1">
            {available.length === 0 ? (
              <p className="text-[12px] text-muted-foreground italic p-2">No tools registered.</p>
            ) : available.map((t) => {
              const overdue = !!(t.calibration_required && t.next_calibration_date && t.next_calibration_date < today)
              const already = toolsAlreadyOnWO.has(t.id)
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={busyId === t.id || already}
                  onClick={() => addTool(t.id)}
                  className={`w-full text-left px-2.5 py-1.5 rounded border flex items-center justify-between gap-2 transition-colors ${
                    already ? 'border-border bg-muted/30 text-muted-foreground cursor-not-allowed'
                    : overdue ? 'border-red-200 bg-red-50/30 hover:bg-red-100/30 text-red-900'
                    : 'border-border hover:bg-muted/30'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-[12px]" style={{ fontWeight: 500 }}>
                    {overdue && <AlertTriangle className="h-3 w-3 inline mr-1 text-red-600" />}
                    {t.name}
                    <span className="ml-1 font-mono text-[11px] text-muted-foreground">{t.serial_number}</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {already ? 'on WO' : overdue ? `overdue · ${t.next_calibration_date}` : t.next_calibration_date ? `due ${t.next_calibration_date}` : 'no cal'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
