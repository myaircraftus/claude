'use client'

/**
 * useSavedViews(module) — client hook for the active module's saved views.
 *
 * Combines:
 *   - Server-persisted views (own + org-shared) from /api/saved-views?module=
 *   - The module's seedViews (synthesized client-side as virtual rows that
 *     the user can pick but can't edit/delete; "Save as" turns one into a
 *     real persisted view).
 *
 * Returns the active view + setters that PATCH the server. The active
 * view selection is local-only (sessionStorage) — if the user picks
 * "Calendar" on /inspections, navigates away, and comes back, they
 * get the same view back.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  getModuleConfig,
  type ModuleViewConfig,
  type SeedView,
} from './configs'
import type { SavedView, SavedViewModule, SavedViewType } from '@/types'

const ACTIVE_VIEW_STORAGE_KEY = (module: string) => `myaircraft_active_view_${module}`

export interface ResolvedView {
  /** Stable id — UUID for persisted views, "seed:<idx>" for seeded. */
  id: string
  name: string
  view_type: SavedViewType
  filters: Record<string, unknown>
  sort: SavedView['sort']
  group_by: string | null
  display_config: Record<string, unknown>
  is_seeded: boolean
  is_default: boolean
  /** True if persisted (i.e. there's a row in saved_views). */
  is_persisted: boolean
}

export interface UseSavedViewsResult {
  config: ModuleViewConfig
  views: ResolvedView[]
  active: ResolvedView
  loading: boolean
  setActiveById: (id: string) => void
  saveAs: (name: string, viewType: SavedViewType, filters: Record<string, unknown>, sort: SavedView['sort'], groupBy: string | null, displayConfig: Record<string, unknown>) => Promise<ResolvedView | null>
  updateActive: (patch: Partial<Pick<ResolvedView, 'name' | 'view_type' | 'filters' | 'sort' | 'group_by' | 'display_config'>>) => Promise<void>
  deleteActive: () => Promise<void>
  refresh: () => Promise<void>
}

function seedToResolved(idx: number, seed: SeedView): ResolvedView {
  return {
    id: `seed:${idx}`,
    name: seed.name,
    view_type: seed.view_type,
    filters: seed.filters ?? {},
    sort: seed.sort ?? null,
    group_by: seed.group_by ?? null,
    display_config: seed.display_config ?? {},
    is_seeded: true,
    is_default: Boolean(seed.is_default),
    is_persisted: false,
  }
}

function persistedToResolved(v: SavedView): ResolvedView {
  return {
    id: v.id,
    name: v.name,
    view_type: v.view_type,
    filters: v.filters ?? {},
    sort: v.sort ?? null,
    group_by: v.group_by ?? null,
    display_config: v.display_config ?? {},
    is_seeded: false,
    is_default: v.is_default,
    is_persisted: true,
  }
}

export function useSavedViews(module: SavedViewModule): UseSavedViewsResult {
  const config = useMemo(() => getModuleConfig(module), [module])
  const [persisted, setPersisted] = useState<SavedView[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveIdState] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return window.sessionStorage.getItem(ACTIVE_VIEW_STORAGE_KEY(module)) ?? ''
  })

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/saved-views?module=${encodeURIComponent(module)}`, { cache: 'no-store' })
      if (!res.ok) return
      const payload = await res.json()
      setPersisted((payload.views ?? []) as SavedView[])
    } finally {
      setLoading(false)
    }
  }, [module])

  useEffect(() => { refresh() }, [refresh])

  const views = useMemo<ResolvedView[]>(() => {
    const seedRows = (config.seedViews ?? []).map((s, i) => seedToResolved(i, s))
    const persistedRows = persisted.map(persistedToResolved)
    // Persisted first (most recently customized), then seeded defaults.
    return [...persistedRows, ...seedRows]
  }, [config.seedViews, persisted])

  const active = useMemo<ResolvedView>(() => {
    const byId = views.find((v) => v.id === activeId)
    if (byId) return byId
    const def = views.find((v) => v.is_default) ?? views[0]
    return def ?? {
      id: 'fallback',
      name: 'All',
      view_type: config.defaultViewType,
      filters: {},
      sort: null,
      group_by: null,
      display_config: {},
      is_seeded: true,
      is_default: true,
      is_persisted: false,
    }
  }, [views, activeId, config.defaultViewType])

  const setActiveById = useCallback((id: string) => {
    setActiveIdState(id)
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(ACTIVE_VIEW_STORAGE_KEY(module), id)
    }
  }, [module])

  const saveAs = useCallback<UseSavedViewsResult['saveAs']>(
    async (name, viewType, filters, sort, groupBy, displayConfig) => {
      try {
        const res = await fetch('/api/saved-views', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            module,
            name,
            view_type: viewType,
            filters,
            sort,
            group_by: groupBy,
            display_config: displayConfig,
          }),
        })
        const out = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(out?.error || 'Save failed')
          return null
        }
        const v = persistedToResolved(out.view as SavedView)
        toast.success(`Saved "${name}"`)
        await refresh()
        setActiveById(v.id)
        return v
      } catch {
        toast.error('Save failed')
        return null
      }
    },
    [module, refresh, setActiveById],
  )

  const updateActive = useCallback<UseSavedViewsResult['updateActive']>(
    async (patch) => {
      if (!active.is_persisted) {
        toast.error('Use Save As to capture changes — seeded views can\'t be edited in place')
        return
      }
      try {
        const res = await fetch(`/api/saved-views/${active.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
        const out = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(out?.error || 'Update failed')
          return
        }
        toast.success('View updated')
        await refresh()
      } catch {
        toast.error('Update failed')
      }
    },
    [active, refresh],
  )

  const deleteActive = useCallback<UseSavedViewsResult['deleteActive']>(async () => {
    if (!active.is_persisted) {
      toast.error('Seeded views can\'t be deleted')
      return
    }
    if (!confirm(`Delete view "${active.name}"?`)) return
    try {
      const res = await fetch(`/api/saved-views/${active.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const out = await res.json().catch(() => ({}))
        toast.error(out?.error || 'Delete failed')
        return
      }
      toast.success('View deleted')
      // Pop active id; effect will fall back to default.
      setActiveById('')
      await refresh()
    } catch {
      toast.error('Delete failed')
    }
  }, [active, refresh, setActiveById])

  return { config, views, active, loading, setActiveById, saveAs, updateActive, deleteActive, refresh }
}
