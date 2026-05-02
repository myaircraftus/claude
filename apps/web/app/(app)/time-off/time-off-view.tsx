'use client'

/**
 * TimeOffView — three-tab shell for /time-off (Spec 2.5.2).
 *
 *   1. My Requests       — current user's history, "Request time off" CTA
 *   2. Team Requests     — full org list (admin manages via approval list)
 *   3. Calendar overlay  — month grid showing approved PTO (gray bars)
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Calendar, User as UserIcon, Inbox, Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TimeOffForm } from './time-off-form'
import { TimeOffApprovalList } from './time-off-approval-list'
import type { TimeOffRequest, TimeOffStatus } from '@/types'

type Tab = 'mine' | 'team' | 'calendar'

export interface TeamMember {
  id: string
  full_name: string
  role: string
}

interface Props {
  team: TeamMember[]
  currentUserId: string
  isAdmin: boolean
}

const TYPE_TONE: Record<string, string> = {
  Holiday:      'bg-blue-50 text-blue-700 border-blue-200',
  Medical:      'bg-rose-50 text-rose-700 border-rose-200',
  Personal:     'bg-violet-50 text-violet-700 border-violet-200',
  Bereavement:  'bg-slate-50 text-slate-700 border-slate-200',
  'Jury Duty':  'bg-amber-50 text-amber-700 border-amber-200',
}

const STATUS_TONE: Record<TimeOffStatus, string> = {
  draft:     'bg-slate-100 text-slate-600 border-slate-200',
  pending:   'bg-amber-50 text-amber-700 border-amber-200',
  approved:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  denied:    'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
}

export function TimeOffView({ team, currentUserId, isAdmin }: Props) {
  const [tab, setTab] = useState<Tab>('mine')
  const [showForm, setShowForm] = useState(false)
  const [requests, setRequests] = useState<TimeOffRequest[]>([])
  const [loading, setLoading] = useState(true)

  const teamNameById = useMemo(() => new Map(team.map((t) => [t.id, t.full_name])), [team])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/time-off-requests')
      if (!res.ok) return
      const data = await res.json()
      setRequests((data.requests ?? []) as TimeOffRequest[])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  const myRequests = useMemo(
    () => requests.filter((r) => r.employee_id === currentUserId),
    [requests, currentUserId],
  )
  const pendingCount = requests.filter((r) => r.status === 'pending').length

  const TABS: Array<{ id: Tab; label: string; icon: any; count?: number }> = [
    { id: 'mine',     label: 'My Requests',     icon: UserIcon, count: myRequests.length },
    { id: 'team',     label: 'Team Requests',   icon: Inbox,    count: pendingCount },
    { id: 'calendar', label: 'Calendar overlay', icon: Calendar },
  ]

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-6 py-4 border-b border-border bg-white shrink-0 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Time Off
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            PTO requests. Manager approves. Scheduler shows blocked days.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Request time off
        </Button>
      </div>

      <div className="px-6 pt-3 border-b border-border bg-white shrink-0">
        <div className="inline-flex gap-1 bg-muted/40 rounded-lg p-1">
          {TABS.map((t) => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] transition-colors',
                  active ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
                style={{ fontWeight: active ? 600 : 500 }}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
                {typeof t.count === 'number' && t.count > 0 && (
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full',
                    active ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-600',
                  )} style={{ fontWeight: 700 }}>
                    {t.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="text-center py-20 text-[12px] text-muted-foreground">Loading…</div>
        ) : tab === 'mine' ? (
          <RequestList rows={myRequests} teamNameById={teamNameById} onChanged={reload} canCancelOwn />
        ) : tab === 'team' ? (
          <TimeOffApprovalList
            requests={requests}
            teamNameById={teamNameById}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
            onChanged={reload}
          />
        ) : (
          <CalendarOverlay requests={requests.filter((r) => r.status === 'approved')} teamNameById={teamNameById} />
        )}
      </div>

      {showForm && (
        <TimeOffForm
          team={team}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); void reload() }}
        />
      )}
    </div>
  )
}

/* ─── Plain list (My Requests) ──────────────────────────────────── */
function RequestList({
  rows, teamNameById, onChanged, canCancelOwn = false,
}: {
  rows: TimeOffRequest[]
  teamNameById: Map<string, string>
  onChanged: () => void
  canCancelOwn?: boolean
}) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-sm font-medium text-foreground">No requests yet</p>
        <p className="text-xs text-muted-foreground mt-1">Submit one with the "Request time off" button.</p>
      </div>
    )
  }

  async function cancel(id: string) {
    if (!confirm('Cancel this request?')) return
    const res = await fetch(`/api/time-off-requests/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    })
    if (res.ok) onChanged()
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <ul className="space-y-2">
        {rows.map((r) => {
          const days = daysBetween(r.start_date, r.end_date)
          return (
            <li key={r.id} className="bg-white rounded-xl border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${TYPE_TONE[r.request_type] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`} style={{ fontWeight: 700 }}>
                      {r.request_type}
                    </span>
                    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${STATUS_TONE[r.status]}`} style={{ fontWeight: 700 }}>
                      {r.status}
                    </span>
                    <span className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>
                      {formatDate(r.start_date)}{r.end_date !== r.start_date ? ` → ${formatDate(r.end_date)}` : ''}
                    </span>
                    <span className="text-[11px] text-muted-foreground">({days} day{days !== 1 ? 's' : ''})</span>
                  </div>
                  {r.reason && <p className="text-[12px] text-muted-foreground mt-1.5">{r.reason}</p>}
                  {r.manager_comment && (
                    <p className="text-[11px] text-foreground mt-1.5 italic">
                      Manager: "{r.manager_comment}"
                      {r.decided_by && <span className="text-muted-foreground"> — {teamNameById.get(r.decided_by) ?? 'Unknown'}</span>}
                    </p>
                  )}
                </div>
                {canCancelOwn && r.status === 'pending' && (
                  <Button size="sm" variant="ghost" onClick={() => cancel(r.id)} className="text-red-600 hover:bg-red-50">
                    Cancel
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ─── Calendar overlay (approved PTO month grid) ────────────────── */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function CalendarOverlay({ requests, teamNameById }: { requests: TimeOffRequest[]; teamNameById: Map<string, string> }) {
  const [anchor, setAnchor] = useState<Date>(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const days: Date[] = useMemo(() => {
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
  }, [anchor])

  const ptoByDay = useMemo(() => {
    const map = new Map<string, TimeOffRequest[]>()
    for (const r of requests) {
      const start = new Date(r.start_date + 'T00:00:00')
      const end = new Date(r.end_date + 'T00:00:00')
      const cur = new Date(start)
      while (cur <= end) {
        const k = isoDateKey(cur)
        const list = map.get(k) ?? []
        list.push(r)
        map.set(k, list)
        cur.setDate(cur.getDate() + 1)
      }
    }
    return map
  }, [requests])

  const headerLabel = anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const todayKey = isoDateKey(new Date())

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <span className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>{headerLabel}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))} className="p-1 rounded-md hover:bg-muted text-muted-foreground"><ChevronLeft className="h-3.5 w-3.5" /></button>
            <button onClick={() => { const t = new Date(); setAnchor(new Date(t.getFullYear(), t.getMonth(), 1)) }} className="text-[11px] text-muted-foreground hover:text-foreground px-2" style={{ fontWeight: 500 }}>Today</button>
            <button onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))} className="p-1 rounded-md hover:bg-muted text-muted-foreground"><ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 border-b border-border bg-muted/20">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const inMonth = d.getMonth() === anchor.getMonth()
            const k = isoDateKey(d)
            const blocks = ptoByDay.get(k) ?? []
            const isToday = k === todayKey
            return (
              <div key={i} className={cn('min-h-[110px] border-r border-b border-border p-1.5 last:border-r-0', !inMonth && 'bg-muted/10')}>
                <div className="flex items-center justify-between mb-1">
                  <span className={cn('text-[11px]', isToday ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white' : '', !inMonth && 'text-muted-foreground/60', inMonth && !isToday && 'text-foreground')} style={{ fontWeight: isToday ? 700 : 500 }}>
                    {d.getDate()}
                  </span>
                </div>
                <ul className="space-y-0.5">
                  {blocks.slice(0, 3).map((b) => (
                    <li key={b.id} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/60 text-slate-700 truncate" style={{ fontWeight: 500 }}>
                      {teamNameById.get(b.employee_id) ?? 'Tech'} · {b.request_type}
                    </li>
                  ))}
                  {blocks.length > 3 && <li className="text-[9px] text-muted-foreground/80">+{blocks.length - 3}</li>}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ─── Helpers ───────────────────────────────────────────────────── */
function daysBetween(startIso: string, endIso: string): number {
  const a = new Date(startIso + 'T00:00:00')
  const b = new Date(endIso + 'T00:00:00')
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)) + 1
}
function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
function isoDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
