'use client'

/**
 * ViewSettingsDialog (Spec 2.4) — modal/inline form to "Save as new view"
 * or edit the active view's name + display options.
 *
 * Filter editing is intentionally simple in v0: enum/status filters as
 * checkbox lists. Free-text + numeric range filters are a logged
 * follow-up; module configs declare the field types so we know which
 * filter widget to show.
 */

import { useState } from 'react'
import { Save, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ModuleViewConfig } from '@/lib/views/configs'
import type { ResolvedView } from '@/lib/views/use-saved-views'
import type { SavedView, SavedViewType } from '@/types'

const VIEW_TYPES: SavedViewType[] = ['list', 'calendar', 'table', 'board']

export function ViewSettingsDialog({
  config,
  initial,
  onSave,
  onCancel,
}: {
  config: ModuleViewConfig
  /** Seed for the form — usually the currently-active view. */
  initial: ResolvedView
  onSave: (
    name: string,
    viewType: SavedViewType,
    filters: Record<string, unknown>,
    sort: SavedView['sort'],
    groupBy: string | null,
    displayConfig: Record<string, unknown>,
  ) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial.is_seeded ? `${initial.name} (copy)` : initial.name)
  const [viewType, setViewType] = useState<SavedViewType>(initial.view_type)
  const [filters, setFilters] = useState<Record<string, unknown>>({ ...initial.filters })
  const [sortField, setSortField] = useState<string>(initial.sort?.field ?? '')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initial.sort?.direction ?? 'desc')
  const [groupBy, setGroupBy] = useState<string>(initial.group_by ?? '')
  const [submitting, setSubmitting] = useState(false)

  const enumFields = config.fields.filter((f) => (f.type === 'status' || f.type === 'enum') && Array.isArray(f.options))

  function toggleFilter(fieldKey: string, value: string) {
    setFilters((prev) => {
      const cur = Array.isArray(prev[fieldKey]) ? (prev[fieldKey] as string[]) : []
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
      const out = { ...prev }
      if (next.length === 0) delete out[fieldKey]
      else out[fieldKey] = next
      return out
    })
  }

  async function handleSave() {
    if (!name.trim()) return
    setSubmitting(true)
    try {
      await onSave(
        name.trim(),
        viewType,
        filters,
        sortField ? { field: sortField, direction: sortDir } : null,
        groupBy || null,
        initial.display_config,
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-border p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Save className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
          Save view
        </h3>
        <button onClick={onCancel} className="ml-auto p-1 rounded-md hover:bg-muted text-muted-foreground" title="Close">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="My overdue inspections" />
      </Field>

      <Field label="Layout">
        <div className="mt-1 inline-flex bg-muted/50 rounded-lg p-0.5">
          {VIEW_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setViewType(t)}
              className={cn(
                'px-3 py-1 rounded-md text-[12px] transition-colors capitalize',
                viewType === t ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
              style={{ fontWeight: viewType === t ? 600 : 500 }}
            >
              {t}
            </button>
          ))}
        </div>
      </Field>

      {viewType === 'board' && (
        <Field label="Group by">
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className={inputCls}>
            <option value="">(none)</option>
            {config.groupable.map((g) => (
              <option key={g} value={g}>{config.fields.find((f) => f.key === g)?.label ?? g}</option>
            ))}
          </select>
        </Field>
      )}

      {enumFields.length > 0 && (
        <Field label="Filters">
          <div className="space-y-2">
            {enumFields.map((f) => {
              const cur = Array.isArray(filters[f.key]) ? (filters[f.key] as string[]) : []
              return (
                <div key={f.key}>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 mb-1" style={{ fontWeight: 700 }}>
                    {f.label}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(f.options ?? []).map((o) => {
                      const active = cur.includes(o.value)
                      return (
                        <button
                          key={o.value}
                          onClick={() => toggleFilter(f.key, o.value)}
                          className={cn(
                            'inline-flex items-center text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full border transition-opacity',
                            o.tint || 'bg-muted text-muted-foreground border-border',
                            !active && 'opacity-40',
                          )}
                          style={{ fontWeight: 600 }}
                        >
                          {o.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </Field>
      )}

      <Field label="Sort">
        <div className="flex items-center gap-2">
          <select value={sortField} onChange={(e) => setSortField(e.target.value)} className={inputCls}>
            <option value="">(none)</option>
            {config.fields.map((f) => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>
          <select value={sortDir} onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')} className={inputCls}>
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </div>
      </Field>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button onClick={handleSave} disabled={submitting || !name.trim()}>
          {submitting ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Save className="h-3 w-3 mr-1.5" />}
          Save view
        </Button>
      </div>
    </div>
  )
}

const inputCls =
  'mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-primary'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 600 }}>
        {label}
      </label>
      {children}
    </div>
  )
}
