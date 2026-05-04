'use client'

/**
 * BulkActionBar (Spec 6.7) — drop-in primitive for any list view that
 * supports multi-select. Caller passes the entity type + selected ids;
 * this component renders the count + an "Apply to N selected" picker
 * that posts to /api/bulk-updates with a JSON patch.
 *
 * Per-list integration is intentionally left to the caller — wire up a
 * checkbox column + this component into the existing list shell. The
 * cross-cutting batch already provides the API + audit page; this
 * primitive is the missing UI piece.
 */

import { useState } from 'react'
import { Loader2, X, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface PresetPatch {
  label: string
  patch: Record<string, unknown>
  /** Optional confirmation prompt — shown via window.confirm before submit. */
  confirm?: string
}

interface Props {
  entity_type: string
  selected_ids: string[]
  presets: PresetPatch[]
  /** Called after a successful job creation. Caller typically refetches the list. */
  onApplied?: () => void
  /** Called when the X button clears the selection. */
  onClear?: () => void
  className?: string
}

export function BulkActionBar({ entity_type, selected_ids, presets, onApplied, onClear, className }: Props) {
  const [submitting, setSubmitting] = useState<string | null>(null)
  if (selected_ids.length === 0) return null

  async function apply(preset: PresetPatch) {
    if (preset.confirm && !window.confirm(preset.confirm.replace('{n}', String(selected_ids.length)))) return
    setSubmitting(preset.label)
    try {
      const res = await fetch('/api/bulk-updates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entity_type, entity_ids: selected_ids, patch: preset.patch }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
      toast.success(`Bulk job queued: ${preset.label} for ${selected_ids.length} row${selected_ids.length === 1 ? '' : 's'}`)
      onApplied?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk update failed')
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div className={cn(
      'sticky bottom-3 z-10 mx-auto inline-flex items-center gap-2 px-3 py-2 rounded-full border border-border bg-white shadow-lg',
      className,
    )}>
      <span className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>
        {selected_ids.length} selected
      </span>
      {presets.map((p) => (
        <Button
          key={p.label}
          size="sm"
          variant="outline"
          onClick={() => void apply(p)}
          disabled={submitting !== null}
          title={`Apply "${p.label}" to ${selected_ids.length} rows`}
        >
          {submitting === p.label ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1" />}
          {p.label}
        </Button>
      ))}
      {onClear && (
        <button onClick={onClear} className="text-muted-foreground hover:text-foreground p-1 rounded">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
