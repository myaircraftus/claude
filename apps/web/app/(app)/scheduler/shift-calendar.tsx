'use client'

/**
 * ShiftCalendar — month/week calendar of shifts (Spec 2.5.1).
 *
 * Reuses the visual + day-grid pattern from Sprint 2.4 calendar-view.tsx
 * but is purpose-built for shifts (so we can render multiple shifts per
 * day with assignee names + colored borders by status).
 */

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Plane } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Shift, ShiftStatus } from '@/types'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const STATUS_COLOR: Record<ShiftStatus, { bg: string; ring: string; text: string }> = {
  scheduled:     { bg: 'bg-blue-50',    ring: 'ring-blue-200',    text: 'text-blue-700' },
  'in-progress': { bg: 'bg-emerald-50', ring: 'ring-emerald-200', text: 'text-emerald-700' },
  completed:     { bg: 'bg-slate-50',   ring: 'ring-slate-200',   text: 'text-slate-600' },
  missed:        { bg: 'bg-red-50',     ring: 'ring-red-200',     text: 'text-red-700' },
  swapped:       { bg: 'bg-amber-50',   ring: 'ring-amber-200',   text: 'text-amber-700' },
}

function formatTimeShort(iso: string): string {
  const d = new Date(iso)
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'p' : 'a'
  const h12 = ((h + 11) % 12) + 1
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, '0')}${ampm}`
}

interface Props {
  shifts: Shift[]
  techNameById: Map<string, string>
  onShiftClick?: (s: Shift) => void
}

export function ShiftCalendar({ shifts, techNameById, onShiftClick }: Props) {
  const [view, setView] = useState<'month' | 'week'>('month')
  const [anchor, setAnchor] = useState<Date>(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const shiftsByDay = useMemo(() => {
    const map = new Map<string, Shift[]>()
    for (const s of shifts) {
      // Keyed by YYYY-MM-DD of start_time (local). Long shifts spanning
      // midnight only render on their start day for v0; multi-day display
      // is a follow-up.
      const d = new Date(s.start_time)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const list = map.get(key) ?? []
      list.push(s)
      map.set(key, list)
    }
    // Sort each day's shifts by start_time ascending.
    for (const list of map.values()) {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time))
    }
    return map
  }, [shifts])

  // Build the day list — month view = 6×7 grid, week view = 7 days
  const days: Date[] = useMemo(() => {
    if (view === 'month') {
      const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
      const gridStart = new Date(start)
      gridStart.setDate(start.getDate() - start.getDay())
      const out: Date[] = []
      for (let i = 0; i < 42; i++) {
        const d = new Date(gridStart)
        d.setDate(gridStart.getDate() + i)
        out.push(d)
      }
      return out
    }
    // Week view — anchor is the first day of the week (Sunday)
    const weekStart = new Date(anchor)
    weekStart.setDate(anchor.getDate() - anchor.getDay())
    const out: Date[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart)
      d.setDate(weekStart.getDate() + i)
      out.push(d)
    }
    return out
  }, [anchor, view])

  function shift(deltaDays: number) {
    if (view === 'month') {
      setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + (deltaDays / 30 | 0 || (deltaDays > 0 ? 1 : -1)), 1))
    } else {
      setAnchor((a) => {
        const next = new Date(a)
        next.setDate(a.getDate() + deltaDays)
        return next
      })
    }
  }

  const headerLabel = view === 'month'
    ? anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : (() => {
        const start = days[0]
        const end = days[days.length - 1]
        const sameMonth = start.getMonth() === end.getMonth()
        return sameMonth
          ? `${start.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}–${end.getDate()}, ${end.getFullYear()}`
          : `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}–${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${end.getFullYear()}`
      })()

  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Toolbar */}
      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>{headerLabel}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex bg-muted/40 rounded-md p-0.5">
              {(['month', 'week'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    'px-2.5 py-1 rounded text-[11px] transition-colors capitalize',
                    view === v ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                  style={{ fontWeight: view === v ? 600 : 500 }}
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => shift(view === 'month' ? -30 : -7)}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground"
                title={view === 'month' ? 'Previous month' : 'Previous week'}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => {
                  const t = new Date()
                  setAnchor(view === 'month' ? new Date(t.getFullYear(), t.getMonth(), 1) : t)
                }}
                className="text-[11px] text-muted-foreground hover:text-foreground px-2"
                style={{ fontWeight: 500 }}
              >
                Today
              </button>
              <button
                onClick={() => shift(view === 'month' ? 30 : 7)}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground"
                title={view === 'month' ? 'Next month' : 'Next week'}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 border-b border-border bg-muted/20">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const inMonth = view === 'week' || d.getMonth() === anchor.getMonth()
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            const dayShifts = shiftsByDay.get(key) ?? []
            const isToday = key === todayKey
            const cellHeight = view === 'week' ? 'min-h-[420px]' : 'min-h-[120px]'
            return (
              <div
                key={i}
                className={cn(
                  cellHeight,
                  'border-r border-b border-border p-1.5 last:border-r-0',
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
                  {dayShifts.length > 4 && view === 'month' && (
                    <span className="text-[9px] text-muted-foreground/80">+{dayShifts.length - 4}</span>
                  )}
                </div>
                <ul className="space-y-0.5">
                  {(view === 'week' ? dayShifts : dayShifts.slice(0, 4)).map((s) => {
                    const tone = STATUS_COLOR[s.status] ?? STATUS_COLOR.scheduled
                    const techName = techNameById.get(s.technician_id) ?? 'Unknown'
                    return (
                      <li key={s.id}>
                        <button
                          onClick={onShiftClick ? () => onShiftClick(s) : undefined}
                          className={cn(
                            'w-full text-left text-[10.5px] px-1.5 py-1 rounded ring-1',
                            tone.bg, tone.ring, tone.text,
                            'hover:brightness-95',
                          )}
                          style={{ fontWeight: 500 }}
                        >
                          <span className="block truncate" style={{ fontWeight: 600 }}>
                            {formatTimeShort(s.start_time)}–{formatTimeShort(s.end_time)} {s.name}
                          </span>
                          <span className="block truncate flex items-center gap-1">
                            <Plane className="h-2.5 w-2.5 opacity-60 inline" /> {techName}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
