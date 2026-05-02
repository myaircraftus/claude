'use client'

/**
 * TodaysShiftsWidget — embeddable Dashboard tile (Spec 2.5.1).
 *
 * Renders the on-shift / off-shift / scheduled-later state for today,
 * pulling /api/shifts filtered to the current calendar day. Shape is
 * a vertical pill list designed to drop into Dashboard.tsx's grid.
 *
 * NOT yet mounted on Dashboard.tsx — that 703-line legacy component
 * needs surgical insertion best done with the operator. Component is
 * ready; logged as 2.5.1 follow-up.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, ArrowRight } from 'lucide-react'
import type { Shift } from '@/types'

interface ShiftWithTech extends Shift {
  /** Joined display name for the assignee — populated from
   *  organization_memberships if available; falls back to id. */
  technician_name?: string
}

export function TodaysShiftsWidget({ className = '' }: { className?: string }) {
  const [shifts, setShifts] = useState<ShiftWithTech[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        const end = new Date(start)
        end.setHours(23, 59, 59, 999)

        const res = await fetch(`/api/shifts?from=${start.toISOString()}&to=${end.toISOString()}`)
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        const list = ((data?.shifts ?? []) as Shift[])
          .filter((s) => s.status !== 'missed' && s.status !== 'swapped')
          .sort((a, b) => a.start_time.localeCompare(b.start_time))
        setShifts(list)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const now = Date.now()
  const onShift = shifts.filter((s) =>
    new Date(s.start_time).getTime() <= now && new Date(s.end_time).getTime() > now,
  )
  const upcoming = shifts.filter((s) => new Date(s.start_time).getTime() > now)
  const completed = shifts.filter((s) => new Date(s.end_time).getTime() <= now)

  return (
    <div className={`bg-white rounded-2xl border border-border overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>Today's Shifts</h3>
        </div>
        <Link href="/scheduler" className="text-[11px] text-primary inline-flex items-center gap-0.5">
          Open scheduler <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="p-3 space-y-2">
        {loading ? (
          <div className="text-[11.5px] text-muted-foreground py-3 text-center">Loading…</div>
        ) : shifts.length === 0 ? (
          <div className="text-[11.5px] text-muted-foreground py-3 text-center">
            No shifts scheduled today.
          </div>
        ) : (
          <>
            <Section label="On shift now" rows={onShift} tone="emerald" />
            <Section label="Coming up" rows={upcoming} tone="blue" />
            <Section label="Completed" rows={completed} tone="slate" dim />
          </>
        )}
      </div>
    </div>
  )
}

function Section({
  label, rows, tone, dim = false,
}: {
  label: string
  rows: ShiftWithTech[]
  tone: 'emerald' | 'blue' | 'slate'
  dim?: boolean
}) {
  if (rows.length === 0) return null
  const dotClass =
    tone === 'emerald' ? 'bg-emerald-500' :
    tone === 'blue'    ? 'bg-blue-500' :
                          'bg-slate-400'
  return (
    <div className={dim ? 'opacity-70' : ''}>
      <div className="flex items-center gap-1.5 px-1 mb-1">
        <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider" style={{ fontWeight: 700 }}>
          {label} <span className="text-muted-foreground/60">· {rows.length}</span>
        </span>
      </div>
      <ul className="space-y-1">
        {rows.map((s) => {
          const start = new Date(s.start_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
          const end = new Date(s.end_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
          return (
            <li key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/30">
              <span className="text-[12px] text-foreground truncate flex-1" style={{ fontWeight: 600 }}>{s.name}</span>
              <span className="text-[10.5px] text-muted-foreground tabular-nums shrink-0">{start} – {end}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
