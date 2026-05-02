'use client'

/**
 * CalendarView (Spec 2.4) — month grid keyed by config.dateField.
 *
 * Rows without a value on the date field don't render — the operator
 * sees them in list/table view instead. Click a day to (in future)
 * open a day-detail modal; for v0 just shows event chips.
 */

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Calendar as CalIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ModuleViewConfig } from '@/lib/views/configs'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function CalendarView<T extends { id: string }>({
  rows,
  config,
  onEventClick,
}: {
  rows: T[]
  config: ModuleViewConfig
  onEventClick?: (row: T) => void
}) {
  const [month, setMonth] = useState<Date>(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const dateField = config.dateField

  // Hooks must run unconditionally (rules-of-hooks). The empty-state early
  // return below sits AFTER this memo. When dateField is undefined the memo
  // produces an empty map and we never read it, so the cost is trivial.
  const eventsByDay = useMemo(() => {
    const map = new Map<string, T[]>()
    if (!dateField) return map
    for (const r of rows) {
      const raw = (r as any)[dateField]
      if (!raw) continue
      const key = typeof raw === 'string' ? raw.slice(0, 10) : new Date(raw).toISOString().slice(0, 10)
      let bucket = map.get(key)
      if (!bucket) {
        bucket = []
        map.set(key, bucket)
      }
      bucket.push(r)
    }
    return map
  }, [rows, dateField])

  if (!dateField) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
        <CalIcon className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
        <p className="text-[12.5px] text-muted-foreground">
          This module's view config doesn't declare a calendar date field.
        </p>
      </div>
    )
  }

  const monthStart = month
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const gridStart = new Date(monthStart)
  gridStart.setDate(monthStart.getDate() - monthStart.getDay()) // align to Sunday
  const gridDays: Date[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    gridDays.push(d)
  }

  const monthLabel = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  function shiftMonth(delta: number) {
    setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }

  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{monthLabel}</span>
          <span className="text-[10.5px] text-muted-foreground/80">
            · {config.fields.find((f) => f.key === dateField)?.label ?? dateField}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => shiftMonth(-1)} className="p-1 rounded-md hover:bg-muted text-muted-foreground" title="Previous month">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} className="text-[11px] text-muted-foreground hover:text-foreground px-2" style={{ fontWeight: 500 }}>
            Today
          </button>
          <button onClick={() => shiftMonth(1)} className="p-1 rounded-md hover:bg-muted text-muted-foreground" title="Next month">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-border bg-muted/20">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {gridDays.map((d, i) => {
          const inMonth = d.getMonth() === month.getMonth()
          const key = d.toISOString().slice(0, 10)
          const events = eventsByDay.get(key) ?? []
          const isToday = key === new Date().toISOString().slice(0, 10)
          return (
            <div
              key={i}
              className={cn(
                'min-h-[84px] border-r border-b border-border p-1.5 last-of-row:border-r-0',
                !inMonth && 'bg-muted/10',
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={cn(
                    'text-[11px]',
                    isToday ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white' : '',
                    !inMonth && 'text-muted-foreground/60',
                    inMonth && !isToday && 'text-foreground',
                  )}
                  style={{ fontWeight: isToday ? 700 : 500 }}
                >
                  {d.getDate()}
                </span>
                {events.length > 3 && (
                  <span className="text-[9px] text-muted-foreground/80">+{events.length - 3}</span>
                )}
              </div>
              <ul className="space-y-0.5">
                {events.slice(0, 3).map((e) => (
                  <li key={e.id}>
                    <button
                      onClick={onEventClick ? () => onEventClick(e) : undefined}
                      className="w-full text-left text-[10.5px] text-foreground bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded truncate block"
                      style={{ fontWeight: 500 }}
                    >
                      {String((e as any)[config.primaryField] ?? '(unnamed)')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
