'use client'

/**
 * ViewSelector (Spec 2.4) — dropdown showing all views for the active
 * module + actions to save / save-as / delete the current view.
 *
 * Persisted views appear first, then seeded defaults. The active view
 * sticks across navigations via sessionStorage (handled in
 * useSavedViews). View-type pills inline communicate the layout — list /
 * calendar / table / board.
 */

import { useState } from 'react'
import {
  ChevronDown, List, Calendar, LayoutGrid, Table as TableIcon,
  Save, Trash2, Plus, Star, Eye,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SavedViewType } from '@/types'
import type { ResolvedView, UseSavedViewsResult } from '@/lib/views/use-saved-views'

const VIEW_TYPE_ICON: Record<SavedViewType, any> = {
  list:     List,
  calendar: Calendar,
  table:    TableIcon,
  board:    LayoutGrid,
}

const VIEW_TYPE_LABEL: Record<SavedViewType, string> = {
  list:     'List',
  calendar: 'Calendar',
  table:    'Table',
  board:    'Board',
}

export function ViewSelector({
  viewsState,
  onSaveAs,
}: {
  viewsState: UseSavedViewsResult
  /** Called when the user clicks "Save as new view" — opens the parent's settings dialog. */
  onSaveAs: () => void
}) {
  const { views, active, setActiveById, deleteActive } = viewsState
  const [open, setOpen] = useState(false)
  const ActiveIcon = VIEW_TYPE_ICON[active.view_type]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-white hover:bg-muted text-[13px] text-foreground transition-colors"
        style={{ fontWeight: 500 }}
      >
        <ActiveIcon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="truncate max-w-[180px]">{active.name}</span>
        {active.is_default && <Star className="h-3 w-3 text-amber-500" />}
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Click-away */}
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.12 }}
              className="absolute left-0 top-full mt-1 z-40 w-80 bg-white border border-border rounded-xl shadow-lg overflow-hidden"
            >
              <div className="px-3 py-2 border-b border-border bg-muted/30">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
                  Views
                </div>
              </div>
              <ul className="max-h-80 overflow-y-auto">
                {views.map((v) => {
                  const Icon = VIEW_TYPE_ICON[v.view_type]
                  const isActive = v.id === active.id
                  return (
                    <li key={v.id}>
                      <button
                        onClick={() => { setActiveById(v.id); setOpen(false) }}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 text-[12.5px] transition-colors',
                          isActive ? 'bg-blue-50' : 'hover:bg-muted',
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className={cn('flex-1 text-left truncate', isActive && 'text-foreground')} style={{ fontWeight: isActive ? 600 : 500 }}>
                          {v.name}
                        </span>
                        {v.is_default && <Star className="h-3 w-3 text-amber-500 shrink-0" />}
                        <ViewBadge type={v.view_type} />
                        {v.is_seeded && (
                          <span className="text-[9px] uppercase tracking-wider text-muted-foreground/80 bg-muted/60 px-1 py-0.5 rounded" style={{ fontWeight: 600 }}>
                            seed
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
              <div className="border-t border-border bg-muted/20 px-2 py-2 flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => { onSaveAs(); setOpen(false) }} className="h-7 text-[11.5px]">
                  <Plus className="h-3 w-3 mr-1" />
                  Save as new
                </Button>
                <div className="flex-1" />
                {active.is_persisted && (
                  <Button size="sm" variant="ghost" onClick={() => { deleteActive(); setOpen(false) }} className="h-7 text-[11.5px] text-rose-600 hover:text-rose-700">
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

function ViewBadge({ type }: { type: SavedViewType }) {
  return (
    <span className="text-[9px] uppercase tracking-wider text-muted-foreground/80 bg-muted/60 px-1 py-0.5 rounded" style={{ fontWeight: 600 }}>
      {VIEW_TYPE_LABEL[type]}
    </span>
  )
}

/**
 * ViewTypeSwitcher — segmented control for switching the active view
 * type inline (without opening the selector). Updates the active view
 * in place if it's persisted, or shows a "save as" prompt for seeded.
 */
export function ViewTypeSwitcher({
  current,
  onChange,
}: {
  current: SavedViewType
  onChange: (next: SavedViewType) => void
}) {
  const types: SavedViewType[] = ['list', 'calendar', 'table', 'board']
  return (
    <div className="inline-flex items-center bg-muted/50 rounded-lg p-0.5">
      {types.map((t) => {
        const Icon = VIEW_TYPE_ICON[t]
        const active = current === t
        return (
          <button
            key={t}
            onClick={() => onChange(t)}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] transition-colors',
              active ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
            style={{ fontWeight: active ? 600 : 500 }}
            title={VIEW_TYPE_LABEL[t]}
          >
            <Icon className="h-3 w-3" />
            <span className="hidden sm:inline">{VIEW_TYPE_LABEL[t]}</span>
          </button>
        )
      })}
    </div>
  )
}
