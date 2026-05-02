'use client'

/**
 * BoardView (Spec 2.4) — kanban grouped by `view.group_by` (or
 * config.groupable[0] as fallback).
 *
 * Cards show `config.primaryField` as title + optional `secondaryField`
 * as subtitle. Each column is the unique values of the group field +
 * a "(none)" bucket for nulls.
 *
 * Drag-to-reorder / drag-between-columns is a logged follow-up — for
 * v0 the board is read-only.
 */

import { LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { groupRows } from '@/lib/views/configs'
import type { ModuleViewConfig } from '@/lib/views/configs'

export function BoardView<T extends { id: string }>({
  rows,
  config,
  groupBy,
  onCardClick,
}: {
  rows: T[]
  config: ModuleViewConfig
  groupBy?: string | null
  onCardClick?: (row: T) => void
}) {
  const field = groupBy || config.groupable[0]
  if (!field) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
        <LayoutGrid className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
        <p className="text-[12.5px] text-muted-foreground">
          This module's view config doesn't declare any groupable fields.
        </p>
      </div>
    )
  }

  const fieldDef = config.fields.find((f) => f.key === field)
  const groups = groupRows(rows, field)

  // For status/enum fields, sort the columns by the option order from the
  // config (so e.g. draft → in-progress → complete reads naturally). For
  // other fields, alphabetical.
  if (fieldDef && (fieldDef.type === 'status' || fieldDef.type === 'enum') && Array.isArray(fieldDef.options)) {
    const orderIndex = new Map(fieldDef.options.map((o, i) => [o.value, i]))
    groups.sort((a, b) => {
      const ai = orderIndex.has(a.key) ? orderIndex.get(a.key)! : 999
      const bi = orderIndex.has(b.key) ? orderIndex.get(b.key)! : 999
      return ai - bi || a.key.localeCompare(b.key)
    })
  } else {
    groups.sort((a, b) => a.key.localeCompare(b.key))
  }

  function tintFor(value: string): string {
    const opt = (fieldDef?.options ?? []).find((o) => o.value === value)
    return opt?.tint ?? 'bg-muted text-muted-foreground border-border'
  }
  function labelFor(value: string): string {
    const opt = (fieldDef?.options ?? []).find((o) => o.value === value)
    return opt?.label ?? value
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-3 min-w-max">
        {groups.map((g) => (
          <div key={g.key} className="w-72 shrink-0 bg-muted/20 rounded-2xl border border-border overflow-hidden">
            <div className="px-3 py-2 border-b border-border bg-white flex items-center justify-between">
              <span className={cn('inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border', tintFor(g.key))} style={{ fontWeight: 700 }}>
                {labelFor(g.key)}
              </span>
              <span className="text-[10.5px] text-muted-foreground/80" style={{ fontWeight: 600 }}>
                {g.rows.length}
              </span>
            </div>
            <ul className="p-2 space-y-2 max-h-[600px] overflow-y-auto">
              {g.rows.length === 0 ? (
                <li className="text-[11.5px] text-muted-foreground/60 text-center py-4">No items</li>
              ) : g.rows.map((r) => {
                const title = String((r as any)[config.primaryField] ?? '(unnamed)')
                const subtitle = config.secondaryField ? (r as any)[config.secondaryField] : null
                return (
                  <li key={r.id}>
                    <button
                      onClick={onCardClick ? () => onCardClick(r) : undefined}
                      className="w-full text-left bg-white border border-border rounded-xl p-2.5 hover:shadow-sm hover:border-primary/30 transition-all"
                    >
                      <div className="text-[12.5px] text-foreground line-clamp-2" style={{ fontWeight: 600 }}>
                        {title}
                      </div>
                      {subtitle && (
                        <div className="mt-1 text-[10.5px] text-muted-foreground line-clamp-1">
                          {String(subtitle)}
                        </div>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
