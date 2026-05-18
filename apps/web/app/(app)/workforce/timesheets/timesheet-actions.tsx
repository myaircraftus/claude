'use client'

/**
 * SOP-WRK-001 §8 — timesheet action buttons.
 * Submit is self-service (any employee, own week). Approve is manager/admin/
 * payroll only — the API re-checks the role, so this is a UX affordance.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export function SubmitTimesheetButton({ weekStart }: { weekStart: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/workforce/timesheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_start: weekStart }),
      })
      if (!res.ok) throw new Error('Submit failed')
      router.refresh()
    } catch {
      setError('Could not submit. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {busy ? 'Submitting…' : 'Submit for Approval'}
      </button>
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </div>
  )
}

export function ApproveTimesheetButton({
  employeeId,
  weekStart,
}: {
  employeeId: string
  weekStart: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function approve() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/workforce/timesheets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employeeId, week_start: weekStart }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Approve failed')
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={approve}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-[12px] font-medium text-foreground hover:bg-muted/50 disabled:opacity-50"
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Approve
      </button>
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </div>
  )
}
