'use client'

/**
 * TimeOffApprovalList — manager queue + full team history (Spec 2.5.2).
 *
 * Pending requests at top with Approve / Deny buttons (admin only).
 * Decided rows shown below with their decision + manager comment.
 */

import { useState } from 'react'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { TimeOffRequest, TimeOffStatus } from '@/types'

const STATUS_TONE: Record<TimeOffStatus, string> = {
  draft:     'bg-slate-100 text-slate-600 border-slate-200',
  pending:   'bg-amber-50 text-amber-700 border-amber-200',
  approved:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  denied:    'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
}

const TYPE_TONE: Record<string, string> = {
  Holiday: 'bg-blue-50 text-blue-700 border-blue-200',
  Medical: 'bg-rose-50 text-rose-700 border-rose-200',
  Personal: 'bg-violet-50 text-violet-700 border-violet-200',
  Bereavement: 'bg-slate-50 text-slate-700 border-slate-200',
  'Jury Duty': 'bg-amber-50 text-amber-700 border-amber-200',
}

interface Props {
  requests: TimeOffRequest[]
  teamNameById: Map<string, string>
  isAdmin: boolean
  currentUserId: string
  onChanged: () => void
}

export function TimeOffApprovalList({ requests, teamNameById, isAdmin, currentUserId, onChanged }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)

  const pending = requests.filter((r) => r.status === 'pending')
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
  const decided = requests.filter((r) => r.status !== 'pending')
    .sort((a, b) => (b.decided_at ?? b.updated_at).localeCompare(a.decided_at ?? a.updated_at))

  async function decide(id: string, decision: 'approved' | 'denied') {
    const comment = decision === 'denied'
      ? prompt('Reason for denial (optional)') ?? ''
      : prompt('Approval comment (optional)') ?? ''
    setBusyId(id)
    try {
      const res = await fetch(`/api/time-off-requests/${id}/decide`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, manager_comment: comment }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j?.error ?? `Failed (${res.status})`)
        return
      }
      toast.success(decision === 'approved' ? 'Approved' : 'Denied')
      onChanged()
    } finally {
      setBusyId(null)
    }
  }

  if (requests.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-sm font-medium text-foreground">No team requests yet</p>
        <p className="text-xs text-muted-foreground mt-1">When teammates submit, they show up here.</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Section
        title={`Pending${pending.length > 0 ? ` · ${pending.length}` : ''}`}
        rows={pending}
        teamNameById={teamNameById}
        actions={(r) =>
          isAdmin ? (
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" onClick={() => decide(r.id, 'denied')} disabled={busyId === r.id}>
                <XCircle className="h-3 w-3 mr-1" /> Deny
              </Button>
              <Button size="sm" onClick={() => decide(r.id, 'approved')} disabled={busyId === r.id}>
                {busyId === r.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                Approve
              </Button>
            </div>
          ) : null
        }
        emptyHint="Nothing waiting on the manager."
      />
      <Section
        title="Decided"
        rows={decided}
        teamNameById={teamNameById}
        emptyHint="No decisions yet."
        dim
      />
    </div>
  )
}

function Section({
  title, rows, teamNameById, actions, emptyHint, dim = false,
}: {
  title: string
  rows: TimeOffRequest[]
  teamNameById: Map<string, string>
  actions?: (r: TimeOffRequest) => React.ReactNode
  emptyHint: string
  dim?: boolean
}) {
  return (
    <div>
      <h2 className="text-[12px] uppercase tracking-wider text-muted-foreground mb-2" style={{ fontWeight: 700 }}>{title}</h2>
      {rows.length === 0 ? (
        <p className="text-[12px] text-muted-foreground/60 italic">{emptyHint}</p>
      ) : (
        <ul className={`space-y-2 ${dim ? 'opacity-80' : ''}`}>
          {rows.map((r) => {
            const employeeName = teamNameById.get(r.employee_id) ?? 'Unknown'
            const days = daysBetween(r.start_date, r.end_date)
            return (
              <li key={r.id} className="bg-white rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>{employeeName}</span>
                      <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${TYPE_TONE[r.request_type] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`} style={{ fontWeight: 700 }}>
                        {r.request_type}
                      </span>
                      <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${STATUS_TONE[r.status]}`} style={{ fontWeight: 700 }}>
                        {r.status}
                      </span>
                    </div>
                    <div className="text-[12px] text-muted-foreground mt-1">
                      {formatDate(r.start_date)}{r.end_date !== r.start_date ? ` → ${formatDate(r.end_date)}` : ''} · {days} day{days !== 1 ? 's' : ''}
                    </div>
                    {r.reason && <p className="text-[12px] text-foreground mt-1.5">{r.reason}</p>}
                    {r.manager_comment && (
                      <p className="text-[11px] text-muted-foreground mt-1.5 italic">
                        Manager: "{r.manager_comment}"
                        {r.decided_by && <> — {teamNameById.get(r.decided_by) ?? 'Unknown'}</>}
                      </p>
                    )}
                  </div>
                  {actions?.(r)}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function daysBetween(startIso: string, endIso: string): number {
  const a = new Date(startIso + 'T00:00:00')
  const b = new Date(endIso + 'T00:00:00')
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)) + 1
}
function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
