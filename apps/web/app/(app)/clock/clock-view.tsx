'use client'

/**
 * ClockView — clock event list (Spec 2.5.3).
 *
 *   Tabs: Today (live status) · This week · All
 *   Admin filter: by employee.
 *   Per row: employee, in/out times, break minutes, total hours, status pill.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ClockEvent, ClockEventStatus } from '@/types'

type Tab = 'today' | 'week' | 'all'
interface TeamMember { id: string; full_name: string; role: string }

const STATUS_TONE: Record<ClockEventStatus, string> = {
  'clocked-in':  'bg-emerald-50 text-emerald-700 border-emerald-200',
  'on-break':    'bg-amber-50 text-amber-800 border-amber-200',
  'clocked-out': 'bg-slate-100 text-slate-600 border-slate-200',
}

export function ClockView({ team, currentUserId, isAdmin }: { team: TeamMember[]; currentUserId: string; isAdmin: boolean }) {
  const [tab, setTab] = useState<Tab>('today')
  const [filterEmp, setFilterEmp] = useState<string>(isAdmin ? 'all' : currentUserId)
  const [events, setEvents] = useState<ClockEvent[]>([])
  const [loading, setLoading] = useState(true)
  const teamNameById = useMemo(() => new Map(team.map((t) => [t.id, t.full_name])), [team])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterEmp !== 'all') params.set('employee_id', filterEmp)
      else if (!isAdmin) params.set('scope', 'mine')

      if (tab === 'today') {
        const today = new Date().toISOString().slice(0, 10)
        params.set('from', today); params.set('to', today)
      } else if (tab === 'week') {
        const start = new Date(); start.setDate(start.getDate() - 6)
        params.set('from', start.toISOString().slice(0, 10))
        params.set('to', new Date().toISOString().slice(0, 10))
      }
      const res = await fetch(`/api/clock-events?${params.toString()}`)
      if (!res.ok) return
      const data = await res.json()
      setEvents((data.events ?? []) as ClockEvent[])
    } finally {
      setLoading(false)
    }
  }, [tab, filterEmp, isAdmin])

  useEffect(() => { void reload() }, [reload])

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-6 py-4 border-b border-border bg-white shrink-0 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>Clock In/Out</h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Daily start/end of workday. Per-WO time still rolls up under here.
          </p>
        </div>
        {isAdmin && team.length > 0 && (
          <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Filter className="w-3.5 h-3.5" />
            <select value={filterEmp} onChange={(e) => setFilterEmp(e.target.value)}
              className="bg-white border border-border rounded-lg px-2.5 py-1.5 text-[12px] outline-none">
              <option value="all">All employees</option>
              {team.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="px-6 pt-3 border-b border-border bg-white shrink-0">
        <div className="inline-flex gap-1 bg-muted/40 rounded-lg p-1">
          {(['today', 'week', 'all'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('px-3 py-1.5 rounded-md text-[12px] transition-colors capitalize',
                tab === t ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              style={{ fontWeight: tab === t ? 600 : 500 }}
            >
              {t === 'week' ? 'This week' : t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="text-center py-20 text-[12px] text-muted-foreground">Loading…</div>
        ) : events.length === 0 ? (
          <div className="text-center py-20">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <CalendarClock className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No clock events</p>
            <p className="text-xs text-muted-foreground mt-1">
              {tab === 'today' ? 'Nobody has clocked in today yet.' : 'Adjust the window or filter to see more.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-border overflow-hidden max-w-5xl mx-auto">
            <table className="w-full text-[12.5px]">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  {['Employee', 'Status', 'Clock in', 'Clock out', 'Break', 'Total hrs'].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.map((e) => {
                  const breakMs = (e.breaks ?? []).reduce((acc, b) => {
                    const s = new Date(b.start).getTime()
                    const en = b.end ? new Date(b.end).getTime() : Date.now()
                    return acc + (en - s)
                  }, 0)
                  const breakMins = Math.floor(breakMs / 60000)
                  return (
                    <tr key={e.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2 text-foreground" style={{ fontWeight: 600 }}>{teamNameById.get(e.employee_id) ?? 'Unknown'}</td>
                      <td className="px-3 py-2">
                        <span className={cn('inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border', STATUS_TONE[e.status])} style={{ fontWeight: 700 }}>
                          {e.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-foreground tabular-nums">{fmt(e.clock_in_at)}</td>
                      <td className="px-3 py-2 text-foreground tabular-nums">{e.clock_out_at ? fmt(e.clock_out_at) : '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground tabular-nums">{breakMins > 0 ? `${breakMins}m` : '—'}</td>
                      <td className="px-3 py-2 text-foreground tabular-nums" style={{ fontWeight: 600 }}>
                        {typeof e.total_hours === 'number' ? `${e.total_hours.toFixed(2)}h` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function fmt(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
