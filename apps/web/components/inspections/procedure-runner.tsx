'use client'

/**
 * ProcedureRunner (Spec 1.3) — execute a procedure against an inspection.
 *
 * Self-fetches /api/inspections/[id] (returns inspection + procedure +
 * existing results) on mount. Each item gets the right input UI based on
 * its `input_type`. Saving a row UPSERTs via PUT /api/inspections/[id]/
 * results — first save flips inspection status from draft -> in-progress.
 *
 * The "Complete inspection" button POSTs to /complete which derives the
 * final status (complete vs complete-requires-attention) from the results
 * server-side; refuses unanswered items unless ?force=1.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Check, X, Camera, Save, ClipboardCheck, AlertTriangle } from 'lucide-react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  computeInspectionProgress,
  INSPECTION_STATUS_LABEL,
} from '@/lib/inspections/status'
import type {
  Inspection,
  InspectionResult,
  Procedure,
  ProcedureItem,
  ProcedureSection,
  OrgRole,
} from '@/types'

type FullProcedure = Procedure & { sections: Array<ProcedureSection & { items: ProcedureItem[] }> }

interface RunnerData {
  inspection: Inspection
  procedure: FullProcedure
  results: InspectionResult[]
}

const READ_ONLY_ROLES = new Set<OrgRole>(['viewer', 'auditor'])

export function ProcedureRunner({
  inspectionId,
  userRole,
}: {
  inspectionId: string
  userRole: OrgRole
}) {
  const canMutate = !READ_ONLY_ROLES.has(userRole)
  const [data, setData] = useState<RunnerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingItemId, setSavingItemId] = useState<string | null>(null)
  const [completing, setCompleting] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/inspections/${inspectionId}`, { cache: 'no-store' })
      if (!res.ok) return
      const payload = await res.json()
      setData(payload as RunnerData)
    } finally {
      setLoading(false)
    }
  }, [inspectionId])

  useEffect(() => { refresh() }, [refresh])

  const items = useMemo<ProcedureItem[]>(
    () => data ? data.procedure.sections.flatMap((s) => s.items) : [],
    [data],
  )
  const progress = data ? computeInspectionProgress(items, data.results) : null
  const resultByItemId = useMemo(() => {
    const m = new Map<string, InspectionResult>()
    for (const r of data?.results ?? []) m.set(r.procedure_item_id, r)
    return m
  }, [data])

  async function saveResult(itemId: string, patch: Partial<InspectionResult>) {
    if (!canMutate) return
    setSavingItemId(itemId)
    try {
      const existing = resultByItemId.get(itemId)
      const res = await fetch(`/api/inspections/${inspectionId}/results`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          procedure_item_id: itemId,
          value:    'value'    in patch ? patch.value    : existing?.value,
          passed:   'passed'   in patch ? patch.passed   : existing?.passed ?? null,
          photo_urls: 'photo_urls' in patch ? patch.photo_urls : existing?.photo_urls ?? [],
          comments: 'comments' in patch ? patch.comments : existing?.comments ?? null,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(payload?.error || 'Save failed')
        return
      }
      // Optimistic merge so the UI reflects the save without a full refetch.
      setData((prev) => {
        if (!prev) return prev
        const next = (payload?.result ?? null) as InspectionResult | null
        if (!next) return prev
        const without = prev.results.filter((r) => r.procedure_item_id !== itemId)
        return { ...prev, results: [...without, next] }
      })
    } finally {
      setSavingItemId(null)
    }
  }

  async function complete(force: boolean) {
    setCompleting(true)
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/complete${force ? '?force=1' : ''}`,
        { method: 'POST' },
      )
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 409 && payload?.pending_count > 0) {
          if (confirm(`${payload.pending_count} item(s) still unanswered. Complete anyway as "complete-requires-attention"?`)) {
            await complete(true)
            return
          }
          return
        }
        toast.error(payload?.error || 'Complete failed')
        return
      }
      toast.success('Inspection completed')
      refresh()
    } finally {
      setCompleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    )
  }
  if (!data) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
        <p className="text-[12.5px] text-muted-foreground">Could not load this inspection.</p>
      </div>
    )
  }

  const { inspection, procedure } = data
  const isDone = inspection.status === 'complete' || inspection.status === 'complete-requires-attention'

  return (
    <div className="space-y-5">
      {/* Header card */}
      <div className="bg-white rounded-2xl border border-border p-4 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>
              {inspection.procedure_name_snapshot || procedure.name}
            </h2>
            <span className={cn('inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border', statusTint(inspection.status))} style={{ fontWeight: 700 }}>
              {INSPECTION_STATUS_LABEL[inspection.status]}
            </span>
          </div>
          {progress && progress.total > 0 && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                <span>{progress.answered} of {progress.total} answered</span>
                {progress.failed > 0 && (
                  <span className="text-rose-600 inline-flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {progress.failed} failed
                  </span>
                )}
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${Math.round(progress.fraction_answered * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
        {canMutate && !isDone && (
          <Button onClick={() => complete(false)} disabled={completing}>
            {completing ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Check className="h-3 w-3 mr-1.5" />}
            Complete inspection
          </Button>
        )}
      </div>

      {/* Sections + items */}
      {procedure.sections.map((section) => (
        <div key={section.id} className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/30">
            <h3 className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>{section.title}</h3>
          </div>
          <ul className="divide-y divide-border">
            {section.items.map((item) => (
              <RunnerItem
                key={item.id}
                item={item}
                result={resultByItemId.get(item.id) ?? null}
                saving={savingItemId === item.id}
                onSave={(patch) => saveResult(item.id, patch)}
                disabled={!canMutate || isDone}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function RunnerItem({
  item,
  result,
  saving,
  onSave,
  disabled,
}: {
  item: ProcedureItem
  result: InspectionResult | null
  saving: boolean
  onSave: (patch: Partial<InspectionResult>) => void
  disabled: boolean
}) {
  const [comments, setComments] = useState<string>(result?.comments ?? '')
  const [valueDraft, setValueDraft] = useState<string>(
    result?.value != null ? String(result.value) : '',
  )

  const passedTrue = result?.passed === true
  const passedFalse = result?.passed === false
  const checked = result?.value === true

  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] text-foreground" style={{ fontWeight: 500 }}>
              {item.text}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/50 border border-border px-1.5 py-0.5 rounded-full" style={{ fontWeight: 700 }}>
              {item.input_type}
            </span>
            {item.requires_photo && (
              <span className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wider bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 700 }}>
                <Camera className="h-2.5 w-2.5" /> photo
              </span>
            )}
          </div>
          {item.reference && (
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Ref: <span className="font-mono">{item.reference}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {item.input_type === 'checkbox' && (
            <button
              onClick={() => onSave({ value: !checked, passed: !checked ? true : null })}
              disabled={disabled || saving}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] border transition-colors',
                checked
                  ? 'bg-emerald-500 border-emerald-500 text-white'
                  : 'border-border bg-white text-foreground hover:bg-muted',
              )}
              style={{ fontWeight: 500 }}
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              {checked ? 'Done' : 'Mark done'}
            </button>
          )}

          {item.input_type === 'pass-fail' && (
            <div className="inline-flex bg-muted rounded-lg p-0.5">
              <button
                onClick={() => onSave({ passed: true, value: 'pass' })}
                disabled={disabled || saving}
                className={cn(
                  'px-3 py-1 rounded-md text-[12px] inline-flex items-center gap-1',
                  passedTrue ? 'bg-emerald-500 text-white' : 'text-foreground hover:bg-white',
                )}
                style={{ fontWeight: 500 }}
              >
                <Check className="h-3 w-3" /> Pass
              </button>
              <button
                onClick={() => onSave({ passed: false, value: 'fail' })}
                disabled={disabled || saving}
                className={cn(
                  'px-3 py-1 rounded-md text-[12px] inline-flex items-center gap-1',
                  passedFalse ? 'bg-rose-500 text-white' : 'text-foreground hover:bg-white',
                )}
                style={{ fontWeight: 500 }}
              >
                <X className="h-3 w-3" /> Fail
              </button>
            </div>
          )}

          {item.input_type === 'value' && (
            <div className="flex items-center gap-1.5">
              <input
                value={valueDraft}
                onChange={(e) => setValueDraft(e.target.value)}
                onBlur={() => {
                  if (valueDraft !== (result?.value ?? '')) onSave({ value: valueDraft })
                }}
                disabled={disabled || saving}
                placeholder="value"
                className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-primary w-32"
              />
              {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </div>
          )}

          {(item.input_type === 'photo' || item.input_type === 'signature') && (
            <button
              onClick={() => onSave({ value: '__placeholder__' })}
              disabled={disabled || saving}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] border border-border bg-white text-muted-foreground"
              style={{ fontWeight: 500 }}
              title="Photo / signature uploads are a logged follow-up — clicking marks the item recorded for now."
            >
              <Camera className="h-3 w-3" />
              Mark recorded
            </button>
          )}
        </div>
      </div>

      {/* Inline comments — saved on blur */}
      <input
        value={comments}
        onChange={(e) => setComments(e.target.value)}
        onBlur={() => {
          if (comments !== (result?.comments ?? '')) onSave({ comments })
        }}
        disabled={disabled || saving}
        placeholder="Comments (optional)"
        className="mt-2 w-full rounded-lg border border-border bg-white/50 px-3 py-1.5 text-[12px] outline-none focus:border-primary"
      />

      {result?.completed_at && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-1 flex items-center gap-1 text-[10.5px] text-muted-foreground"
        >
          <Save className="h-2.5 w-2.5" />
          saved {new Date(result.completed_at).toLocaleString()}
        </motion.div>
      )}
    </li>
  )
}

function statusTint(status: Inspection['status']) {
  switch (status) {
    case 'draft':                         return 'bg-slate-100 text-slate-600 border-slate-200'
    case 'in-progress':                   return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'complete':                      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'complete-requires-attention':   return 'bg-amber-50 text-amber-700 border-amber-200'
  }
}
