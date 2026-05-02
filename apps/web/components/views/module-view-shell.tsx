'use client'

/**
 * ModuleViewShell (Spec 2.4) — orchestrates the multi-view system for a
 * single module.
 *
 * Pulls saved views via `useSavedViews(module)`, applies the active
 * view's filters/sort/groupBy to a caller-provided `rows` array, and
 * renders the appropriate view component (list / table / calendar /
 * board).
 *
 * The caller is responsible for fetching the rows. This component
 * doesn't know how to fetch; it just orchestrates filter + render.
 */

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { ReactNode } from 'react'
import { ViewSelector, ViewTypeSwitcher } from './view-selector'
import { ViewSettingsDialog } from './view-settings'
import { ListView } from './list-view'
import { TableView } from './table-view'
import { CalendarView } from './calendar-view'
import { BoardView } from './board-view'
import { applySavedView, getModuleConfig } from '@/lib/views/configs'
import { useSavedViews } from '@/lib/views/use-saved-views'
import type { SavedViewModule } from '@/types'

export function ModuleViewShell<T extends { id: string }>({
  module,
  rows,
  loading,
  emptyState,
  renderListRow,
  onRowClick,
}: {
  module: SavedViewModule
  rows: T[]
  loading?: boolean
  /** Rendered when there are no rows AND no filter is active. */
  emptyState?: ReactNode
  /** Required for list view — caller decides how a row looks. */
  renderListRow: (row: T) => ReactNode
  onRowClick?: (row: T) => void
}) {
  const config = useMemo(() => getModuleConfig(module), [module])
  const viewsState = useSavedViews(module)
  const [showSettings, setShowSettings] = useState(false)

  // Apply filters + sort to the caller-fetched rows. Local-only — the
  // module endpoint can return everything; the saved view filters down.
  const filtered = useMemo(
    () => applySavedView(rows, viewsState.active),
    [rows, viewsState.active],
  )

  async function onSaveSettings(
    name: string,
    viewType: typeof viewsState.active.view_type,
    filters: Record<string, unknown>,
    sort: typeof viewsState.active.sort,
    groupBy: string | null,
    displayConfig: Record<string, unknown>,
  ) {
    const next = await viewsState.saveAs(name, viewType, filters, sort, groupBy, displayConfig)
    if (next) setShowSettings(false)
  }

  // Inline view-type switch: if active is persisted, PATCH; if seeded,
  // we can't edit-in-place, so just temporarily swap by transient state.
  const [transientType, setTransientType] = useState<typeof viewsState.active.view_type | null>(null)
  const effectiveType = transientType ?? viewsState.active.view_type

  function changeViewType(next: typeof viewsState.active.view_type) {
    if (viewsState.active.is_persisted) {
      viewsState.updateActive({ view_type: next })
      setTransientType(null)
    } else {
      setTransientType(next)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <ViewSelector viewsState={viewsState} onSaveAs={() => setShowSettings(true)} />
        <div className="flex items-center gap-3">
          <span className="text-[11.5px] text-muted-foreground">
            {filtered.length} of {rows.length}
          </span>
          <ViewTypeSwitcher current={effectiveType} onChange={changeViewType} />
        </div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
          >
            <ViewSettingsDialog
              config={config}
              initial={viewsState.active}
              onSave={onSaveSettings}
              onCancel={() => setShowSettings(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center">
          {emptyState ?? (
            <p className="text-[12.5px] text-muted-foreground">
              No matches for the active view.
            </p>
          )}
        </div>
      )}

      {/* The view */}
      {filtered.length > 0 && (
        effectiveType === 'list' ? (
          <ListView rows={filtered} config={config} renderRow={renderListRow} />
        ) : effectiveType === 'table' ? (
          <TableView rows={filtered} config={config} onRowClick={onRowClick} />
        ) : effectiveType === 'calendar' ? (
          <CalendarView rows={filtered} config={config} onEventClick={onRowClick} />
        ) : (
          <BoardView rows={filtered} config={config} groupBy={viewsState.active.group_by ?? undefined} onCardClick={onRowClick} />
        )
      )}
    </div>
  )
}
