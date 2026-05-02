'use client'

/**
 * TableView (Spec 2.4) — column-configurable table.
 *
 * Renders one column per `ModuleViewConfig.fields[]` where defaultVisible
 * is true (or all when display_config doesn't override). Built-in
 * formatters per field-type; custom renderers can be passed through
 * the optional renderCell callback.
 */

import { cn } from '@/lib/utils'
import type { FieldDef, ModuleViewConfig } from '@/lib/views/configs'

export function TableView<T extends { id: string }>({
  rows,
  config,
  onRowClick,
}: {
  rows: T[]
  config: ModuleViewConfig
  onRowClick?: (row: T) => void
}) {
  const visible = config.fields.filter((f) => f.defaultVisible !== false)

  if (rows.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-muted/30 border-b border-border">
              {visible.map((f) => (
                <th
                  key={f.key}
                  className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground"
                  style={{ fontWeight: 700, width: f.width }}
                >
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-border last:border-b-0 hover:bg-muted/20',
                  onRowClick && 'cursor-pointer',
                )}
              >
                {visible.map((f) => (
                  <td key={f.key} className="px-3 py-2 align-top" style={{ width: f.width }}>
                    {renderCell(f, (row as any)[f.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function renderCell(field: FieldDef, value: unknown) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground/60">—</span>
  }

  switch (field.type) {
    case 'date': {
      const s = typeof value === 'string' ? value.slice(0, 10) : String(value)
      return <span className="text-foreground font-mono">{s}</span>
    }
    case 'datetime': {
      try {
        const d = new Date(value as string)
        return <span className="text-foreground font-mono">{d.toLocaleString()}</span>
      } catch {
        return <span className="text-muted-foreground/60">—</span>
      }
    }
    case 'number':
      return <span className="text-foreground font-mono">{Number(value).toLocaleString()}</span>
    case 'currency':
      return <span className="text-foreground font-mono">${Number(value).toFixed(2)}</span>
    case 'status':
    case 'enum': {
      const opt = (field.options ?? []).find((o) => o.value === String(value))
      const label = opt?.label ?? String(value)
      const tint = opt?.tint ?? 'bg-muted text-muted-foreground border-border'
      return (
        <span
          className={cn('inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border', tint)}
          style={{ fontWeight: 700 }}
        >
          {label}
        </span>
      )
    }
    case 'priority': {
      const opt = (field.options ?? []).find((o) => o.value === String(value))
      const tint = opt?.tint ?? 'bg-muted text-muted-foreground border-border'
      return (
        <span
          className={cn('inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border', tint)}
          style={{ fontWeight: 700 }}
        >
          {String(value)}
        </span>
      )
    }
    default:
      return <span className="text-foreground truncate inline-block max-w-md">{String(value)}</span>
  }
}
