'use client'

/**
 * ShiftCoversList — open + claimed cover requests (Spec 2.5.1).
 *
 * Per row:
 *  - The original shift (date, time, original assignee, name)
 *  - The requester + reason
 *  - Status pill
 *  - Action buttons:
 *      open      → "I'll cover this" (any teammate except requester)
 *      claimed   → "Approve" / "Reject" (owner/admin only) +
 *                  "Withdraw claim" (the covering tech, until approved)
 *      requester → always sees "Withdraw request"
 */

import { useState } from 'react'
import { ArrowLeftRight, CheckCircle2, XCircle, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { Shift, ShiftCover } from '@/types'

interface Props {
  covers: ShiftCover[]
  shiftsById: Map<string, Shift>
  techNameById: Map<string, string>
  currentUserId: string
  isAdmin: boolean
  onChanged: () => void
}

export function ShiftCoversList({
  covers, shiftsById, techNameById, currentUserId, isAdmin, onChanged,
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)

  async function patch(id: string, status: 'claimed' | 'approved' | 'rejected') {
    setBusyId(id)
    try {
      const res = await fetch(`/api/shift-covers/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j?.error ?? `Failed (${res.status})`)
        return
      }
      const verb = status === 'claimed' ? 'Claimed'
        : status === 'approved' ? 'Approved'
        : 'Rejected'
      toast.success(`${verb}`)
      onChanged()
    } finally {
      setBusyId(null)
    }
  }

  async function withdraw(id: string) {
    if (!confirm('Withdraw this cover request?')) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/shift-covers/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j?.error ?? `Failed (${res.status})`)
        return
      }
      toast.success('Withdrawn')
      onChanged()
    } finally {
      setBusyId(null)
    }
  }

  if (covers.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-sm font-medium text-foreground">No open cover requests</p>
        <p className="text-xs text-muted-foreground mt-1">When a tech can't make a shift, this is where it shows up.</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <ul className="space-y-2">
        {covers.map((c) => {
          const s = shiftsById.get(c.original_shift_id)
          const requesterName = techNameById.get(c.requested_by) ?? 'Unknown'
          const coveringName = c.covering_tech_id ? (techNameById.get(c.covering_tech_id) ?? 'Unknown') : null
          const isRequester = c.requested_by === currentUserId
          const isCoverer = c.covering_tech_id === currentUserId
          const dateLabel = s
            ? new Date(s.start_time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
            : '—'
          const timeLabel = s
            ? `${new Date(s.start_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} – ${new Date(s.end_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
            : ''

          return (
            <li key={c.id} className="bg-white rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <ArrowLeftRight className="h-4 w-4 text-amber-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[14px] text-foreground truncate" style={{ fontWeight: 600 }}>
                      {s?.name ?? 'Unknown shift'} · {dateLabel}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {timeLabel} · originally {requesterName}
                      {coveringName && <> · claimed by {coveringName}</>}
                    </div>
                  </div>
                </div>
                <CoverStatusPill status={c.status} />
              </div>

              {c.reason && (
                <p className="mt-2 text-[12px] text-muted-foreground italic line-clamp-2">"{c.reason}"</p>
              )}

              <div className="mt-3 flex items-center justify-end gap-2">
                {isRequester && c.status !== 'approved' && (
                  <Button size="sm" variant="ghost" onClick={() => withdraw(c.id)}
                    disabled={busyId === c.id} className="text-red-600 hover:bg-red-50">
                    <Trash2 className="h-3 w-3 mr-1" /> Withdraw
                  </Button>
                )}
                {!isRequester && c.status === 'open' && (
                  <Button size="sm" onClick={() => patch(c.id, 'claimed')} disabled={busyId === c.id}>
                    {busyId === c.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ArrowLeftRight className="h-3 w-3 mr-1" />}
                    I'll cover this
                  </Button>
                )}
                {isAdmin && c.status === 'claimed' && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => patch(c.id, 'rejected')} disabled={busyId === c.id}>
                      <XCircle className="h-3 w-3 mr-1" /> Reject
                    </Button>
                    <Button size="sm" onClick={() => patch(c.id, 'approved')} disabled={busyId === c.id}>
                      {busyId === c.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                      Approve swap
                    </Button>
                  </>
                )}
                {isCoverer && c.status === 'claimed' && (
                  <Button size="sm" variant="ghost" onClick={() => withdraw(c.id)}
                    disabled={busyId === c.id} className="text-muted-foreground">
                    Cancel claim
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

function CoverStatusPill({ status }: { status: ShiftCover['status'] }) {
  const tone =
    status === 'open'     ? 'bg-amber-50 text-amber-700 border-amber-200' :
    status === 'claimed'  ? 'bg-blue-50 text-blue-700 border-blue-200' :
    status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                             'bg-slate-50 text-slate-600 border-slate-200'
  return (
    <span className={`shrink-0 text-[9.5px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${tone}`}
      style={{ fontWeight: 700 }}>
      {status}
    </span>
  )
}
