'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'

/**
 * Tiny client-side button on each needs_human agent_runs row. Calls
 * /api/admin/agents/runs/[id]/ack which flips acknowledged_at +
 * acknowledged_by. The topbar approval-count chip polls every 60s and
 * decrements after the next poll; we router.refresh() here to reflect
 * the row's new state immediately.
 *
 * Acknowledged rows are intentionally still visible in /admin/agents
 * (so audit history stays intact) — the chip just stops counting them.
 */
export function AcknowledgeButton({
  runId,
  acknowledged,
}: {
  runId: string
  acknowledged: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [acked, setAcked] = useState(acknowledged)

  if (acked) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
        <Check className="h-3 w-3" />
        ack'd
      </span>
    )
  }
  async function onClick() {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/agents/runs/${runId}/ack`, {
        method: 'POST',
        credentials: 'include',
      })
      if (res.ok) {
        setAcked(true)
        router.refresh()
      }
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors disabled:opacity-50"
      title="Mark this recommendation as triaged"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
      Acknowledge
    </button>
  )
}
