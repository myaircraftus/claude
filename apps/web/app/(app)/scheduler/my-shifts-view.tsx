'use client'

/**
 * MyShiftsView — current user's shifts only (Spec 2.5.1).
 *
 * Splits into "Upcoming" + "Past 30 days." Per row: name, time window,
 * skill tags, checklist progress, "Request cover" button when the shift
 * is still scheduled or in-progress.
 */

import { useState, useMemo } from 'react'
import { ArrowLeftRight, CheckCircle2, Loader2, ClipboardCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Shift } from '@/types'

interface Props {
  shifts: Shift[]
  currentUserId: string
  onChanged: () => void
}

export function MyShiftsView({ shifts, currentUserId: _currentUserId, onChanged }: Props) {
  const [requestingId, setRequestingId] = useState<string | null>(null)

  const { upcoming, past } = useMemo(() => {
    const now = Date.now()
    const cutoff = now - 30 * 24 * 60 * 60 * 1000
    const u: Shift[] = []
    const p: Shift[] = []
    for (const s of shifts) {
      const endTs = new Date(s.end_time).getTime()
      if (endTs >= now) u.push(s)
      else if (endTs >= cutoff) p.push(s)
    }
    u.sort((a, b) => a.start_time.localeCompare(b.start_time))
    p.sort((a, b) => b.start_time.localeCompare(a.start_time))
    return { upcoming: u, past: p }
  }, [shifts])

  async function handleRequestCover(shiftId: string) {
    const reason = prompt('Why do you need cover? (optional)') ?? ''
    setRequestingId(shiftId)
    try {
      const res = await fetch(`/api/shifts/${shiftId}/request-cover`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j?.error ?? `Failed (${res.status})`)
        return
      }
      toast.success('Cover request posted — teammates will see it')
      onChanged()
    } finally {
      setRequestingId(null)
    }
  }

  if (shifts.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-sm font-medium text-foreground">No shifts assigned</p>
        <p className="text-xs text-muted-foreground mt-1">Your manager hasn't scheduled you yet.</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Section title="Upcoming" rows={upcoming} requestingId={requestingId} onRequestCover={handleRequestCover} />
      <Section title="Past 30 days" rows={past} dim />
    </div>
  )
}

function Section({
  title,
  rows,
  requestingId,
  onRequestCover,
  dim = false,
}: {
  title: string
  rows: Shift[]
  requestingId?: string | null
  onRequestCover?: (id: string) => void
  dim?: boolean
}) {
  if (rows.length === 0) {
    return (
      <div>
        <h2 className="text-[12px] uppercase tracking-wider text-muted-foreground mb-2" style={{ fontWeight: 700 }}>{title}</h2>
        <p className="text-[12px] text-muted-foreground/60 italic">None.</p>
      </div>
    )
  }
  return (
    <div>
      <h2 className="text-[12px] uppercase tracking-wider text-muted-foreground mb-2" style={{ fontWeight: 700 }}>{title}</h2>
      <ul className="space-y-2">
        {rows.map((s) => {
          const total = s.checklist.length
          const done = s.checklist.filter((c) => c.completed).length
          const startD = new Date(s.start_time)
          const endD = new Date(s.end_time)
          const dayLabel = startD.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
          const timeLabel = `${startD.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} – ${endD.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
          const canRequestCover = !!onRequestCover
            && (s.status === 'scheduled' || s.status === 'in-progress')
          return (
            <li key={s.id}
              className={cn(
                'bg-white rounded-xl border border-border p-4 flex items-center gap-4 transition-colors',
                dim && 'opacity-70',
              )}
            >
              <div className="w-12 text-center shrink-0">
                <div className="text-[20px] text-foreground tabular-nums" style={{ fontWeight: 700 }}>
                  {startD.getDate()}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {startD.toLocaleDateString(undefined, { month: 'short' })}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>{s.name}</span>
                  <span className="text-[11px] text-muted-foreground">{dayLabel} · {timeLabel}</span>
                  <StatusPill status={s.status} />
                </div>
                <div className="mt-1 flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                  {s.roles.length > 0 && (
                    <span>{s.roles.join(' · ')}</span>
                  )}
                  {total > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <ClipboardCheck className="h-3 w-3" /> {done}/{total} checklist
                      {total > 0 && done === total && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
                    </span>
                  )}
                  {s.notes && <span className="italic truncate max-w-md">"{s.notes}"</span>}
                </div>
              </div>
              {canRequestCover && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRequestCover?.(s.id)}
                  disabled={requestingId === s.id}
                >
                  {requestingId === s.id
                    ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Posting…</>
                    : <><ArrowLeftRight className="h-3 w-3 mr-1" /> Request cover</>
                  }
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function StatusPill({ status }: { status: Shift['status'] }) {
  const tone =
    status === 'in-progress' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    status === 'completed'   ? 'bg-slate-50 text-slate-600 border-slate-200' :
    status === 'missed'      ? 'bg-red-50 text-red-700 border-red-200' :
    status === 'swapped'     ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                'bg-blue-50 text-blue-700 border-blue-200'
  return (
    <span className={`text-[9.5px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${tone}`}
      style={{ fontWeight: 700 }}>
      {status.replace('-', ' ')}
    </span>
  )
}
