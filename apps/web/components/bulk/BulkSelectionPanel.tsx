'use client'

/**
 * BulkSelectionPanel (Spec polish.bulk-ui-rollout) — drop-in companion
 * panel for any list view. Pairs with the list's GET API; lets the
 * operator multi-select rows + apply a whitelisted patch via
 * /api/bulk-updates.
 *
 * Why this shape (not inline checkbox columns on each list)?
 *   13 list views are bespoke — some use ModuleViewShell, some have
 *   custom tables, some have card grids. Threading a checkbox column
 *   through each is high regression risk. This panel is purely
 *   additive: mount it as a sibling on each page, give it the same
 *   API endpoint the list uses, and BulkActionBar fires on 2+ rows.
 *
 *  Caller passes:
 *    apiPath        — GET endpoint (e.g. '/api/inspections')
 *    apiKey         — JSON key the list lives under (e.g. 'inspections')
 *    labelKey       — column to render as the row label
 *    entityType     — must match BULK_ENTITY_TABLES key in lib/bulk/processor.ts
 *    presets        — bulk-action presets (label + patch + optional confirm prompt)
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ListChecks, X, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BulkActionBar } from './BulkActionBar'

interface PresetPatch {
  label: string
  patch: Record<string, unknown>
  confirm?: string
}

interface Props {
  apiPath: string
  apiKey: string
  labelKey: string
  /** Optional secondary key shown in muted text under labelKey. */
  subLabelKey?: string
  entityType: string
  presets: PresetPatch[]
  /** Heading + subtitle for the panel. */
  title?: string
  subtitle?: string
  /** Default closed; opening it triggers the fetch. */
  defaultOpen?: boolean
  className?: string
}

interface AnyRow {
  id: string
  [k: string]: unknown
}

export function BulkSelectionPanel({
  apiPath, apiKey, labelKey, subLabelKey, entityType, presets,
  title = 'Bulk update', subtitle = 'Select 2+ rows to enable bulk actions.',
  defaultOpen = false, className,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [rows, setRows] = useState<AnyRow[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(apiPath)
      const json = (await res.json()) as Record<string, unknown> & { error?: string }
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`)
        return
      }
      const list = (json[apiKey] as AnyRow[]) ?? []
      setRows(list.slice(0, 200))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [apiPath, apiKey])

  useEffect(() => {
    if (open && rows.length === 0) void load()
  }, [open, rows.length, load])

  function toggleRow(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === rows.length) setSelected(new Set())
    else setSelected(new Set(rows.map((r) => r.id)))
  }

  function clear() { setSelected(new Set()) }

  const onApplied = useCallback(() => {
    // Refetch local panel rows + tell App Router to refresh the parent list.
    setSelected(new Set())
    void load()
    router.refresh()
  }, [load, router])

  const selectedIds = Array.from(selected)
  const labelOf = (r: AnyRow) => (r[labelKey] as string | null | undefined) ?? r.id
  const subOf = (r: AnyRow) => subLabelKey ? (r[subLabelKey] as string | null | undefined) : null

  return (
    <div className={cn('rounded-2xl border border-border bg-white', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between gap-2 hover:bg-muted/15 rounded-2xl"
      >
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          <div className="text-left">
            <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{title}</div>
            <div className="text-[11px] text-muted-foreground">{subtitle}</div>
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border p-3">
          {error && (
            <div className="mb-2 rounded-md border border-rose-200 bg-rose-50 p-2 text-[11.5px] text-rose-800">
              {error}
            </div>
          )}
          {loading ? (
            <div className="text-[12px] text-muted-foreground py-6 text-center">
              <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1" /> Loading rows…
            </div>
          ) : rows.length === 0 ? (
            <div className="text-[12px] text-muted-foreground py-6 text-center">
              No rows.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2 pl-1">
                <label className="inline-flex items-center gap-2 text-[11px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.size > 0 && selected.size === rows.length}
                    ref={(el) => { if (el) el.indeterminate = selected.size > 0 && selected.size < rows.length }}
                    onChange={toggleAll}
                  />
                  Select all ({rows.length})
                </label>
                {selected.size > 0 && (
                  <button onClick={clear} className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-foreground">
                    <X className="h-3 w-3" /> Clear
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-border border border-border rounded-md">
                {rows.map((r) => {
                  const checked = selected.has(r.id)
                  const sub = subOf(r)
                  return (
                    <label
                      key={r.id}
                      className={cn('flex items-center gap-2 px-2 py-1.5 cursor-pointer text-[12px]', checked ? 'bg-primary/5' : 'hover:bg-muted/15')}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleRow(r.id)} />
                      <span className="flex-1 min-w-0 truncate">
                        <span className="text-foreground" style={{ fontWeight: 500 }}>{String(labelOf(r) ?? '(unnamed)')}</span>
                        {sub && <span className="text-muted-foreground ml-1">· {String(sub)}</span>}
                      </span>
                    </label>
                  )
                })}
              </div>
              {selectedIds.length >= 2 && (
                <div className="mt-3 flex justify-center">
                  <BulkActionBar
                    entity_type={entityType}
                    selected_ids={selectedIds}
                    presets={presets}
                    onApplied={onApplied}
                    onClear={clear}
                  />
                </div>
              )}
              {selectedIds.length === 1 && (
                <div className="mt-3 text-[11px] text-muted-foreground text-center">
                  Select one more row to enable bulk actions.
                </div>
              )}
            </>
          )}
          <div className="mt-2 text-right">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>Refresh</Button>
          </div>
        </div>
      )}
    </div>
  )
}
