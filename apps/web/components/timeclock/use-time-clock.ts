'use client'

/**
 * Shared hook for the current user's time-clock state. Used by both the
 * TimeClockPanel (per-WO) and the RunningTimerChip (Topbar).
 *
 * Polls /api/me/time-clock every 30s. Cheap — only touches the calling
 * user's row.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { TimeEntry } from '@/types'

const POLL_INTERVAL_MS = 30_000

export interface UseTimeClockResult {
  openEntry: TimeEntry | null
  openWorkOrder: {
    id: string
    work_order_number: string | null
    aircraft_id: string | null
    aircraft_tail: string | null
  } | null
  todayClosedHours: number
  todayClosedCost: number
  loading: boolean
  /** Returns ms elapsed on the open entry, recomputed every render. */
  elapsedMs: number
  refresh: () => Promise<void>
  stop: (notes?: string) => Promise<void>
}

export function useTimeClock(): UseTimeClockResult {
  const [openEntry, setOpenEntry] = useState<TimeEntry | null>(null)
  const [openWorkOrder, setOpenWorkOrder] = useState<UseTimeClockResult['openWorkOrder']>(null)
  const [todayClosedHours, setTodayClosedHours] = useState(0)
  const [todayClosedCost,  setTodayClosedCost]  = useState(0)
  const [loading, setLoading] = useState(true)
  // Tick once a second when an open entry exists so elapsedMs stays live.
  const [, setTickNow] = useState<number>(Date.now())
  const cancelledRef = useRef(false)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/me/time-clock', { cache: 'no-store' })
      if (!res.ok) return
      const payload = await res.json()
      if (cancelledRef.current) return
      setOpenEntry((payload?.open_entry ?? null) as TimeEntry | null)
      setOpenWorkOrder(payload?.open_work_order ?? null)
      setTodayClosedHours(Number(payload?.today?.closed_hours ?? 0))
      setTodayClosedCost(Number(payload?.today?.closed_cost ?? 0))
    } catch {
      // noop — keep prior state
    } finally {
      if (!cancelledRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    cancelledRef.current = false
    refresh()
    const poll = setInterval(refresh, POLL_INTERVAL_MS)
    return () => { cancelledRef.current = true; clearInterval(poll) }
  }, [refresh])

  // 1-second tick when an open entry exists so the chip's mm:ss updates
  // visibly. No tick when there's no open entry — saves cycles.
  useEffect(() => {
    if (!openEntry) return
    const t = setInterval(() => setTickNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [openEntry])

  const elapsedMs = openEntry
    ? Math.max(0, Date.now() - new Date(openEntry.start_time).getTime())
    : 0

  const stop = useCallback(async (notes?: string) => {
    if (!openEntry) return
    try {
      const res = await fetch(`/api/time-entries/${openEntry.id}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notes ? { notes } : {}),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(out?.error || 'Clock-out failed')
        return
      }
      toast.success('Clocked out')
      refresh()
    } catch {
      toast.error('Clock-out failed')
    }
  }, [openEntry, refresh])

  return {
    openEntry,
    openWorkOrder,
    todayClosedHours,
    todayClosedCost,
    loading,
    elapsedMs,
    refresh,
    stop,
  }
}

/** mm:ss for short durations, hh:mm for longer. */
export function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const hours = Math.floor(totalSec / 3600)
  const mins  = Math.floor((totalSec % 3600) / 60)
  const secs  = totalSec % 60
  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, '0')}`
  }
  return `${mins}:${String(secs).padStart(2, '0')}`
}
