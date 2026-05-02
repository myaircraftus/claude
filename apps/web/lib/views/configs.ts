/**
 * Module view configs (Spec 2.4).
 *
 * One entry per module key. Each entry declares:
 *   - `fields`: the columns the table view renders (with renderers + types)
 *   - `groupable`: which fields the board view can group by
 *   - `dateField`: which field the calendar view plots
 *   - `seedViews`: pre-seeded "default" views that ship with the module
 *
 * Add a new module by adding an entry here; the rest of the multi-view
 * system (selector / list / table / calendar / board / settings) reads
 * from this map without changes.
 */

import type { SavedView, SavedViewModule, SavedViewType } from '@/types'

export type FieldType =
  | 'text'
  | 'date'
  | 'datetime'
  | 'number'
  | 'currency'
  | 'status'
  | 'priority'
  | 'enum'

export interface FieldDef {
  /** Column key — must match the data row's property. */
  key: string
  /** Human label. */
  label: string
  type: FieldType
  /** Pixel width hint for table view. */
  width?: number
  /** When true, this field is shown by default in the table view. */
  defaultVisible?: boolean
  /** When type='enum' or 'status', the legal values + their tints. */
  options?: Array<{ value: string; label: string; tint?: string }>
}

export interface ModuleViewConfig {
  module: SavedViewModule
  /** Human label, used in breadcrumbs and the empty state. */
  label: string
  /** API endpoint that lists this module's rows. Plain GET; saved-view filters become query string. */
  listEndpoint: string
  /** All fields on the module (used by table view + filter editor). */
  fields: FieldDef[]
  /** Field keys that the board view can group by. First entry is the default. */
  groupable: string[]
  /** Field key used by the calendar view (must be a 'date' or 'datetime' typed field). */
  dateField?: string
  /** Field used to render the row's title on calendar/board cards. */
  primaryField: string
  /** Optional secondary subtitle on calendar/board cards. */
  secondaryField?: string
  /** Pre-seeded view definitions. Operator can edit/duplicate; can't delete seeded ones. */
  seedViews: SeedView[]
  /** Default view type when the user hasn't picked one. */
  defaultViewType: SavedViewType
}

export interface SeedView {
  name: string
  view_type: SavedViewType
  filters: Record<string, unknown>
  sort?: { field: string; direction: 'asc' | 'desc' } | null
  group_by?: string | null
  display_config?: Record<string, unknown>
  is_default?: boolean
}

/* ─── Module registry ─────────────────────────────────────────────────── */

export const MODULE_CONFIGS: Partial<Record<SavedViewModule, ModuleViewConfig>> = {
  /* Inspections — wired in this sprint; rich data exercises all 4 views. */
  inspections: {
    module: 'inspections',
    label: 'Inspections',
    listEndpoint: '/api/inspections',
    fields: [
      { key: 'procedure_name_snapshot', label: 'Procedure', type: 'text', defaultVisible: true, width: 280 },
      { key: 'aircraft_id',              label: 'Aircraft',  type: 'text', defaultVisible: true, width: 130 },
      {
        key: 'status', label: 'Status', type: 'status', defaultVisible: true, width: 160,
        options: [
          { value: 'draft',                          label: 'Draft',                  tint: 'bg-slate-100 text-slate-600 border-slate-200' },
          { value: 'in-progress',                    label: 'In progress',            tint: 'bg-blue-50 text-blue-700 border-blue-200' },
          { value: 'complete',                       label: 'Complete',               tint: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
          { value: 'complete-requires-attention',    label: 'Complete · attention',   tint: 'bg-amber-50 text-amber-700 border-amber-200' },
        ],
      },
      { key: 'due_date',       label: 'Due',          type: 'date',     defaultVisible: true, width: 120 },
      { key: 'start_date',     label: 'Started',      type: 'datetime', width: 160 },
      { key: 'completed_date', label: 'Completed',    type: 'datetime', width: 160 },
      { key: 'created_at',     label: 'Created',      type: 'datetime', width: 160 },
    ],
    groupable: ['status', 'aircraft_id'],
    dateField: 'due_date',
    primaryField: 'procedure_name_snapshot',
    secondaryField: 'status',
    defaultViewType: 'list',
    seedViews: [
      {
        name: 'All',
        view_type: 'list',
        filters: {},
        sort: { field: 'created_at', direction: 'desc' },
        is_default: true,
      },
      {
        name: 'Active',
        view_type: 'list',
        filters: { status: ['draft', 'in-progress'] },
        sort: { field: 'due_date', direction: 'asc' },
      },
      {
        name: 'Calendar',
        view_type: 'calendar',
        filters: {},
      },
      {
        name: 'By status',
        view_type: 'board',
        filters: {},
        group_by: 'status',
      },
      {
        name: 'Table',
        view_type: 'table',
        filters: {},
        sort: { field: 'created_at', direction: 'desc' },
      },
    ],
  },
}

/**
 * Helper — pull a module's config or throw a helpful error if the caller
 * passes an unconfigured key.
 */
export function getModuleConfig(module: SavedViewModule): ModuleViewConfig {
  const cfg = MODULE_CONFIGS[module]
  if (!cfg) {
    throw new Error(
      `Module "${module}" has no view config. Add an entry to lib/views/configs.ts MODULE_CONFIGS.`,
    )
  }
  return cfg
}

/**
 * Apply a saved view's filters / sort / groupBy to a flat data array.
 * Pure — useful for client-side rendering where the API endpoint already
 * returned the full set and we filter locally.
 */
export function applySavedView<T extends Record<string, any>>(
  rows: T[],
  view: Pick<SavedView, 'filters' | 'sort'>,
): T[] {
  let out = rows

  // Apply filters: each entry is either a string (exact match), array
  // (any-of), boolean, or numeric range { min?, max? }.
  for (const [key, val] of Object.entries(view.filters ?? {})) {
    if (val === undefined || val === null || val === '') continue
    if (Array.isArray(val)) {
      if (val.length === 0) continue
      out = out.filter((r) => val.includes(r[key]))
    } else if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      out = out.filter((r) => r[key] === val)
    } else if (typeof val === 'object' && ('min' in (val as any) || 'max' in (val as any))) {
      const min = (val as { min?: number }).min
      const max = (val as { max?: number }).max
      out = out.filter((r) => {
        const v = Number(r[key])
        if (!Number.isFinite(v)) return false
        if (min !== undefined && v < min) return false
        if (max !== undefined && v > max) return false
        return true
      })
    }
  }

  // Apply sort.
  if (view.sort?.field) {
    const dir = view.sort.direction === 'desc' ? -1 : 1
    const field = view.sort.field
    out = [...out].sort((a, b) => {
      const av = a[field]
      const bv = b[field]
      if (av == null && bv == null) return 0
      if (av == null) return 1 * dir
      if (bv == null) return -1 * dir
      if (av < bv) return -1 * dir
      if (av > bv) return  1 * dir
      return 0
    })
  }

  return out
}

/** Group rows by a field. Empty/null groups go under "(none)". */
export function groupRows<T extends Record<string, any>>(
  rows: T[],
  field: string,
): Array<{ key: string; rows: T[] }> {
  const buckets = new Map<string, T[]>()
  for (const r of rows) {
    const raw = r[field]
    const key = raw == null || raw === '' ? '(none)' : String(raw)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = []
      buckets.set(key, bucket)
    }
    bucket.push(r)
  }
  return Array.from(buckets.entries()).map(([key, rs]) => ({ key, rows: rs }))
}
