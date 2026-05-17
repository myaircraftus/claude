'use client'

/**
 * Time Clock — daily shift punch board.
 *
 * Header, a roster list with a per-mechanic Clock In / Clock Out toggle,
 * and a punch log of every clock_event recorded today. A mechanic is
 * "Clocked In" when they hold a clock_event today with a null clock_out_at.
 *
 * Clock In  → POST /api/clock-events            { employee_id }
 * Clock Out → POST /api/clock-events/{id}/clock-out
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Clock, LogIn, LogOut, Loader2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ClockEvent {
  id: string
  organization_id: string
  employee_id: string
  status: string
  clock_in_at: string
  clock_out_at: string | null
  breaks: unknown
  total_hours: number | null
  shift_id: string | null
  notes: string | null
  created_at: string
}

interface RosterEntry {
  user_id: string
  name: string
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function fmtHours(h: number): string {
  if (!h || h <= 0) return '0.00'
  return h.toFixed(2)
}

export function TimeClockClient({
  roster, events,
}: {
  roster: RosterEntry[]
  events: ClockEvent[]
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)

  // Live "now" — anchored once per render so live-elapsed hours are stable.
  const nowMs = Date.now()

  // Group today's events by employee.
  const byEmployee = useMemo(() => {
    const m = new Map<string, ClockEvent[]>()
    for (const ev of events) {
      const arr = m.get(ev.employee_id) ?? []
      arr.push(ev)
      m.set(ev.employee_id, arr)
    }
    return m
  }, [events])

  const rows = useMemo(() => {
    return roster.map((person) => {
      const evs = byEmployee.get(person.user_id) ?? []
      const openEvent = evs.find((e) => !e.clock_out_at) ?? null
      const clockedIn = !!openEvent

      // Total hours today: sum completed totals + live elapsed for open one.
      let hours = 0
      for (const e of evs) {
        if (e.clock_out_at) {
          hours += e.total_hours ?? 0
        } else {
          const start = new Date(e.clock_in_at).getTime()
          if (!Number.isNaN(start)) hours += Math.max(0, (nowMs - start) / 3_600_000)
        }
      }

      // Most recent action time across the day.
      let lastAction: string | null = null
      for (const e of evs) {
        const t = e.clock_out_at ?? e.clock_in_at
        if (!lastAction || (t && new Date(t) > new Date(lastAction))) lastAction = t
      }

      return { person, clockedIn, openEvent, hours, lastAction }
    })
  }, [roster, byEmployee, nowMs])

  const nameOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of roster) m.set(r.user_id, r.name)
    return m
  }, [roster])

  async function toggle(row: (typeof rows)[number]) {
    setBusyId(row.person.user_id)
    try {
      let res: Response
      if (row.clockedIn && row.openEvent) {
        res = await fetch(`/api/clock-events/${row.openEvent.id}/clock-out`, { method: 'POST' })
      } else {
        res = await fetch('/api/clock-events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employee_id: row.person.user_id }),
        })
      }
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(j?.error ?? 'Could not update clock status')
        return
      }
      toast.success(row.clockedIn ? `${row.person.name} clocked out` : `${row.person.name} clocked in`)
      router.refresh()
    } catch {
      toast.error('Network error')
    } finally {
      setBusyId(null)
    }
  }

  const clockedInCount = rows.filter((r) => r.clockedIn).length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-white shrink-0">
        <h1 className="text-[20px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
          Time Clock
        </h1>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          {roster.length > 0
            ? `${clockedInCount} of ${roster.length} clocked in today.`
            : 'Daily shift punch board for your shop.'}
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {roster.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Roster list */}
            <section>
              <div className="text-[12px] text-foreground mb-2" style={{ fontWeight: 700 }}>
                Mechanic Roster
              </div>
              <div className="bg-white border border-border rounded-xl divide-y divide-border overflow-hidden">
                {rows.map((row) => (
                  <div key={row.person.user_id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>
                        {row.person.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Last action {fmtTime(row.lastAction)} · {fmtHours(row.hours)} h today
                      </div>
                    </div>
                    <StatusBadge clockedIn={row.clockedIn} />
                    <Button
                      size="sm"
                      variant={row.clockedIn ? 'outline' : 'default'}
                      disabled={busyId === row.person.user_id}
                      onClick={() => toggle(row)}
                    >
                      {busyId === row.person.user_id ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : row.clockedIn ? (
                        <LogOut className="h-3.5 w-3.5 mr-1.5" />
                      ) : (
                        <LogIn className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      {row.clockedIn ? 'Clock Out' : 'Clock In'}
                    </Button>
                  </div>
                ))}
              </div>
            </section>

            {/* Today's punch log */}
            <section>
              <div className="text-[12px] text-foreground mb-2" style={{ fontWeight: 700 }}>
                Today&apos;s Punch Log
              </div>
              {events.length === 0 ? (
                <div className="bg-white border border-border rounded-xl py-10 text-center text-[13px] text-muted-foreground">
                  No punches recorded today yet.
                </div>
              ) : (
                <div className="bg-white border border-border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 border-b border-border">
                      <tr>
                        {['Mechanic', 'Clock In', 'Clock Out', 'Hours'].map((h) => (
                          <th
                            key={h}
                            className="text-left px-3 py-2.5 text-[10.5px] uppercase tracking-wider text-muted-foreground"
                            style={{ fontWeight: 600 }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {events.map((ev) => {
                        const open = !ev.clock_out_at
                        const liveHours = open
                          ? Math.max(0, (nowMs - new Date(ev.clock_in_at).getTime()) / 3_600_000)
                          : ev.total_hours ?? 0
                        return (
                          <tr key={ev.id} className="hover:bg-muted/20">
                            <td className="px-3 py-2.5 text-[13px] text-foreground" style={{ fontWeight: 600 }}>
                              {nameOf.get(ev.employee_id) ?? 'Unknown'}
                            </td>
                            <td className="px-3 py-2.5 text-[12px] text-muted-foreground tabular-nums">
                              {fmtTime(ev.clock_in_at)}
                            </td>
                            <td className="px-3 py-2.5 text-[12px] text-muted-foreground tabular-nums">
                              {open ? (
                                <span className="text-emerald-600" style={{ fontWeight: 600 }}>
                                  In progress
                                </span>
                              ) : (
                                fmtTime(ev.clock_out_at)
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-[12px] text-muted-foreground tabular-nums">
                              {fmtHours(liveHours)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ clockedIn }: { clockedIn: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] border ${
        clockedIn
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-slate-50 text-slate-600 border-slate-200'
      }`}
      style={{ fontWeight: 700 }}
    >
      <Clock className="h-3 w-3" />
      {clockedIn ? 'Clocked In' : 'Clocked Out'}
    </span>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
        <Users className="h-7 w-7 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">No mechanics on the roster yet</p>
      <p className="text-xs text-muted-foreground text-center max-w-sm">
        Invite team members to your organization and they&apos;ll appear here ready to punch in.
      </p>
    </div>
  )
}
