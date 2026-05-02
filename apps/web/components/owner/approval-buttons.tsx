'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  kind: 'estimate' | 'work_order'
  id: string
}

export function ApprovalButtons({ kind, id }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<'approve' | 'reject' | null>(null)

  async function submit(action: 'approve' | 'reject') {
    setError(null)
    setPendingAction(action)
    try {
      const res = await fetch(`/api/owner/approvals/${kind}/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.error ?? `HTTP ${res.status}`)
      }
      startTransition(() => router.refresh())
    } catch (e: any) {
      setError(e?.message ?? 'Failed to update')
      setPendingAction(null)
    }
  }

  const busy = isPending || pendingAction !== null
  const approveLabel = kind === 'work_order' ? 'Sign off' : 'Approve'
  const rejectLabel = kind === 'work_order' ? 'Dispute' : 'Reject'

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => submit('approve')}
        className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pendingAction === 'approve' ? 'Working…' : approveLabel}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => submit('reject')}
        className="px-3 py-1.5 rounded-md border border-border text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pendingAction === 'reject' ? 'Working…' : rejectLabel}
      </button>
      {error && <span className="text-xs text-red-600 ml-2">{error}</span>}
    </div>
  )
}
