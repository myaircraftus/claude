'use client'

/**
 * ClockInWidget — top-bar widget (Spec 2.5.3).
 *
 * Three states:
 *   - No open event       → "Clock In" button (POST /api/clock-events)
 *   - Clocked in          → mm:ss elapsed + "Take break" + "Clock out" buttons
 *   - On break            → "End break" + "Clock out" + still ticks elapsed
 *
 * Polls /api/me/clock-state every 30s + ticks the elapsed counter every
 * second when an event is open. Mounted in shared/topbar.tsx alongside
 * the sprint 2.3 RunningTimerChip.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Clock, Coffee, LogOut, Loader2, Play } from 'lucide-react'
import { toast } from 'sonner'
import type { ClockEvent } from '@/types'

function fmtElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

export function ClockInWidget() {
  const [event, setEvent] = useState<ClockEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState<number>(Date.now())
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/me/clock-state', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setEvent((data?.event ?? null) as ClockEvent | null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const poll = setInterval(refresh, 30_000)
    return () => clearInterval(poll)
  }, [refresh])

  // Tick once a second only while an event is open.
  useEffect(() => {
    if (event && !event.clock_out_at) {
      tickRef.current = setInterval(() => setNow(Date.now()), 1000)
      return () => { if (tickRef.current) clearInterval(tickRef.current) }
    }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
  }, [event])

  // Display elapsed = (now - clock_in_at) - (sum of closed break durations) - (current open break, if any).
  const displayMs = (() => {
    if (!event) return 0
    const start = new Date(event.clock_in_at).getTime()
    let breakMs = 0
    for (const b of event.breaks ?? []) {
      const bStart = new Date(b.start).getTime()
      const bEnd = b.end ? new Date(b.end).getTime() : now
      breakMs += bEnd - bStart
    }
    return now - start - breakMs
  })()

  async function clockIn() {
    setBusy(true)
    try {
      const res = await fetch('/api/clock-events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error ?? `Failed (${res.status})`); return }
      setEvent(data.event as ClockEvent)
      toast.success('Clocked in')
    } finally { setBusy(false) }
  }
  async function startBreak() {
    if (!event) return
    setBusy(true)
    try {
      const reason = prompt('Break reason (e.g. Lunch)') ?? ''
      const res = await fetch(`/api/clock-events/${event.id}/break`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error ?? `Failed (${res.status})`); return }
      setEvent(data.event as ClockEvent)
    } finally { setBusy(false) }
  }
  async function endBreak() {
    if (!event) return
    setBusy(true)
    try {
      const res = await fetch(`/api/clock-events/${event.id}/break`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error ?? `Failed (${res.status})`); return }
      setEvent(data.event as ClockEvent)
    } finally { setBusy(false) }
  }
  async function clockOut() {
    if (!event) return
    if (!confirm('Clock out for the day? Any running per-WO timers will close too.')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/clock-events/${event.id}/clock-out`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error ?? `Failed (${res.status})`); return }
      setEvent(null)
      toast.success(`Clocked out · ${data.closed_time_entries ?? 0} per-WO timer${(data.closed_time_entries ?? 0) === 1 ? '' : 's'} closed`)
    } finally { setBusy(false) }
  }

  if (loading) return null

  if (!event) {
    return (
      <button
        onClick={clockIn}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors"
        style={{ fontWeight: 600 }}
        title="Start your workday"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        Clock In
      </button>
    )
  }

  const onBreak = event.status === 'on-break'
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] border transition-colors ${
        onBreak
          ? 'bg-amber-50 text-amber-800 border-amber-200'
          : 'bg-blue-50 text-blue-800 border-blue-200'
      }`}
      style={{ fontWeight: 600 }}
    >
      <Clock className="h-3.5 w-3.5" />
      <span className="tabular-nums">{onBreak ? 'Break' : fmtElapsed(displayMs)}</span>
      {onBreak ? (
        <button onClick={endBreak} disabled={busy} className="ml-1 underline-offset-2 hover:underline" title="End break">
          End break
        </button>
      ) : (
        <button onClick={startBreak} disabled={busy} className="ml-1 inline-flex items-center gap-0.5 hover:underline" title="Start break">
          <Coffee className="h-3 w-3" /> Break
        </button>
      )}
      <button onClick={clockOut} disabled={busy} className="ml-0.5 inline-flex items-center gap-0.5 hover:underline" title="Clock out">
        <LogOut className="h-3 w-3" /> Out
      </button>
    </div>
  )
}
