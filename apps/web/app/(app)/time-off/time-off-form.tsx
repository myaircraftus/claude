'use client'

/**
 * TimeOffForm — submit a request (Spec 2.5.2).
 *
 * Employee picks type + date range; admins can submit on behalf of any tech.
 * notify_user_ids defaults to all admins so managers see the queue.
 */

import { useState } from 'react'
import { X, Loader2, Bell, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { TimeOffType } from '@/types'
import type { TeamMember } from './time-off-view'

const TYPES: TimeOffType[] = ['Holiday', 'Medical', 'Personal', 'Bereavement', 'Jury Duty']

interface Props {
  team: TeamMember[]
  currentUserId: string
  isAdmin: boolean
  onClose: () => void
  onSaved: () => void
}

function todayIso() { return new Date().toISOString().slice(0, 10) }

export function TimeOffForm({ team, currentUserId, isAdmin, onClose, onSaved }: Props) {
  const [employeeId, setEmployeeId] = useState(currentUserId)
  const [requestType, setRequestType] = useState<TimeOffType>('Personal')
  const [start, setStart] = useState(todayIso())
  const [end, setEnd] = useState(todayIso())
  const [reason, setReason] = useState('')
  const [notifyIds, setNotifyIds] = useState<Set<string>>(() => {
    // Default: notify all admins/owners (so managers see new requests)
    return new Set(team.filter((t) => t.role === 'owner' || t.role === 'admin').map((t) => t.id))
  })
  const [submitting, setSubmitting] = useState(false)

  function toggleNotify(id: string) {
    setNotifyIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (end < start) { toast.error('End date must be on/after start'); return }
    setSubmitting(true)
    try {
      const body: any = {
        request_type: requestType,
        start_date: start,
        end_date: end,
        reason: reason.trim() || null,
        notify_user_ids: Array.from(notifyIds),
      }
      if (isAdmin && employeeId !== currentUserId) body.employee_id = employeeId

      const res = await fetch('/api/time-off-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j?.error ?? `Failed (${res.status})`)
        return
      }
      toast.success('Request submitted')
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-[520px] max-h-[88vh] flex flex-col overflow-hidden"
      >
        <div className="px-5 py-3.5 border-b border-border bg-gradient-to-br from-[#0A1628] to-[#1E3A5F] flex items-center justify-between">
          <div>
            <div className="text-[15px] text-white" style={{ fontWeight: 700 }}>Request Time Off</div>
            <div className="text-[11px] text-white/60 mt-0.5">Pending until your manager decides.</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-white/10 rounded-lg text-white/70 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isAdmin && (
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Employee</Label>
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                {team.map((t) => <option key={t.id} value={t.id}>{t.full_name}{t.id === currentUserId ? ' (me)' : ''} · {t.role}</option>)}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Type</Label>
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map((t) => {
                const active = requestType === t
                return (
                  <button key={t} type="button" onClick={() => setRequestType(t)}
                    className={`text-[12px] px-2 py-1.5 rounded-lg border transition-colors ${active ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-background border-border text-muted-foreground hover:bg-muted/40'}`}
                    style={{ fontWeight: active ? 600 : 500 }}>
                    {active && <Check className="h-2.5 w-2.5 inline mr-0.5" />}{t}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Start</Label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>End (inclusive)</Label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Reason (optional)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Family vacation" />
          </div>

          {team.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1" style={{ fontWeight: 600 }}>
                <Bell className="h-3 w-3" /> Notify on decision
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {team.filter((t) => t.id !== currentUserId).map((t) => {
                  const active = notifyIds.has(t.id)
                  return (
                    <button key={t.id} type="button" onClick={() => toggleNotify(t.id)}
                      className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${active ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-background border-border text-muted-foreground hover:bg-muted/40'}`}
                      style={{ fontWeight: active ? 600 : 500 }}>
                      {active && <Check className="h-2.5 w-2.5 inline mr-0.5" />}
                      {t.full_name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-border bg-muted/20 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Submit request
          </Button>
        </div>
      </form>
    </div>
  )
}
