'use client'

/**
 * TimeClockOverview (Spec 2.3) — org-wide time clock dashboard.
 *
 * Shows the current user's open entry + recent entries across the org.
 * Operators+admins see everyone's entries; regular technicians see all
 * (RLS allows org-wide read so the team's "currently working" board
 * works) but can only edit their own.
 */

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Timer, Clock } from 'lucide-react'
import { motion } from 'motion/react'
import Link from '@/components/shared/tenant-link'
import { cn } from '@/lib/utils'
import { useTimeClock, formatElapsed } from './use-time-clock'
import type { TimeEntry, OrgRole } from '@/types'

interface OverviewData {
  recent: TimeEntry[]
  woNumberById: Record<string, string | null>
}

export function TimeClockOverview({ userRole: _userRole }: { userRole: OrgRole }) {
  const tc = useTimeClock()
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/time-entries?limit=50', { cache: 'no-store' })
        if (!res.ok) return
        const payload = await res.json()
        const entries = (payload.entries ?? []) as TimeEntry[]
        // Look up WO numbers for the unique work_order_ids in the list.
        const ids = Array.from(new Set(entries.map((e) => e.work_order_id)))
        const woMap: Record<string, string | null> = {}
        if (ids.length > 0) {
          // Cheap N=1 lookup via comma list — Supabase-js IN syntax via a
          // single fetch path. We piggyback on the existing /api/work-orders
          // endpoint; if it doesn't accept IN-list queries we fall back to
          // showing the UUID prefix.
          await Promise.all(ids.map(async (id) => {
            try {
              const r = await fetch(`/api/work-orders/${id}`, { cache: 'no-store' })
              if (r.ok) {
                const p = await r.json()
                woMap[id] = p?.work_order_number ?? p?.work_order?.work_order_number ?? null
              }
            } catch { /* noop */ }
          }))
        }
        if (cancelled) return
        setData({ recent: entries, woNumberById: woMap })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [tc.openEntry?.id])

  const openEntries = useMemo(
    () => (data?.recent ?? []).filter((e) => !e.end_time),
    [data],
  )

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <div>
        <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
          Time clock
        </h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          Live labor timer per work order. Clock in from the WO time-clock view.
        </p>
      </div>

      {/* My current state */}
      <div className="bg-white rounded-2xl border border-border p-5">
        {tc.openEntry ? (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center">
                <Timer className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
                  You're clocked in
                </div>
                <div className="text-[12px] text-muted-foreground">
                  Running for <span className="font-mono text-foreground">{formatElapsed(tc.elapsedMs)}</span>
                  {tc.openWorkOrder?.work_order_number && (
                    <> · WO <span className="font-mono">{tc.openWorkOrder.work_order_number}</span></>
                  )}
                  {tc.openWorkOrder?.aircraft_tail && (
                    <> · {tc.openWorkOrder.aircraft_tail}</>
                  )}
                </div>
              </div>
            </div>
            {tc.openWorkOrder?.id && (
              <Link
                href={`/work-orders/${tc.openWorkOrder.id}/time-clock`}
                className="text-[12px] text-primary hover:underline"
                style={{ fontWeight: 500 }}
              >
                Open WO →
              </Link>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-muted/40 border border-border text-muted-foreground flex items-center justify-center">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>
                Not clocked in
              </div>
              <div className="text-[12px] text-muted-foreground">
                Open a work order's time-clock view to start a timer.
              </div>
            </div>
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Today closed hours" value={tc.todayClosedHours.toFixed(1)} />
          <Stat label="Today closed cost"  value={`$${tc.todayClosedCost.toFixed(2)}`} />
        </div>
      </div>

      {/* Currently-running across the org */}
      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border">
          <h3 className="text-[12px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
            Currently running ({openEntries.length})
          </h3>
        </div>
        {openEntries.length === 0 ? (
          <div className="p-6 text-center text-[12.5px] text-muted-foreground">
            Nobody's on the clock right now.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {openEntries.map((e) => {
              const ms = Math.max(0, Date.now() - new Date(e.start_time).getTime())
              const woNum = data?.woNumberById[e.work_order_id]
              return (
                <li key={e.id} className="px-4 py-3 flex items-center gap-3 bg-emerald-50/30">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                    <Timer className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] text-foreground font-mono" style={{ fontWeight: 600 }}>
                        {formatElapsed(ms)}
                      </span>
                      <span className="text-[12px] text-muted-foreground">
                        on WO <span className="font-mono">{woNum ?? e.work_order_id.slice(0, 8)}</span>
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground/80 mt-0.5">
                      Started {new Date(e.start_time).toLocaleTimeString()}
                    </div>
                  </div>
                  <Link href={`/work-orders/${e.work_order_id}/time-clock`} className="text-[11.5px] text-primary hover:underline" style={{ fontWeight: 500 }}>
                    View →
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Recent (closed) entries */}
      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border">
          <h3 className="text-[12px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
            Recent entries
          </h3>
        </div>
        {loading ? (
          <div className="p-8 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : (data?.recent ?? []).filter((e) => e.end_time).length === 0 ? (
          <div className="p-6 text-center text-[12.5px] text-muted-foreground">
            No closed entries yet.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {(data?.recent ?? []).filter((e) => e.end_time).slice(0, 25).map((e) => {
              const startMs = new Date(e.start_time).getTime()
              const endMs   = new Date(e.end_time!).getTime()
              const hours = Math.max(0, (endMs - startMs) / 3_600_000)
              const cost = hours * Number(e.hourly_rate)
              const woNum = data?.woNumberById[e.work_order_id]
              return (
                <motion.li
                  key={e.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="px-4 py-2.5 flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-lg bg-muted/40 border border-border text-muted-foreground flex items-center justify-center shrink-0">
                    <Clock className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
                    <span className="text-[13px] text-foreground font-mono" style={{ fontWeight: 600 }}>{hours.toFixed(2)} hr</span>
                    <span className="text-[12px] text-muted-foreground">
                      WO <span className="font-mono">{woNum ?? e.work_order_id.slice(0, 8)}</span>
                    </span>
                    <span className="text-[12px] text-foreground font-mono">${cost.toFixed(2)}</span>
                    <span className={cn('inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border bg-muted/40 text-muted-foreground border-border')} style={{ fontWeight: 700 }}>
                      {e.work_type}
                    </span>
                    <span className="text-[11px] text-muted-foreground/80">
                      {new Date(e.start_time).toLocaleDateString()}
                    </span>
                  </div>
                  <Link href={`/work-orders/${e.work_order_id}/time-clock`} className="text-[11.5px] text-primary hover:underline" style={{ fontWeight: 500 }}>
                    →
                  </Link>
                </motion.li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>{label}</div>
      <div className="text-[18px] font-mono text-foreground mt-0.5" style={{ fontWeight: 700 }}>{value}</div>
    </div>
  )
}
