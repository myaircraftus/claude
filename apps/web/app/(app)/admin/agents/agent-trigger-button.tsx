'use client'

/**
 * Tiny "Run now" button for cron-triggered agents on /admin/agents.
 * Posts to /api/admin/agents/trigger with the agent id; the API
 * dispatches to the right impl (kb-curator, ocr-date-sanitiser, etc.)
 * and audits via runAgent.
 */
import { useState } from 'react'
import { Loader2 } from 'lucide-react'

export function AgentTriggerButton({ agentId }: { agentId: string }) {
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState<string | null>(null)

  async function go() {
    if (busy) return
    setBusy(true)
    setLast(null)
    try {
      const res = await fetch('/api/admin/agents/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLast(`error: ${j?.error ?? res.status}`)
      } else {
        setLast(`ok · run ${(j?.run_id ?? '').slice(0, 8) || '✓'}`)
      }
    } catch (e) {
      setLast(`error: ${e instanceof Error ? e.message : 'failed'}`)
    } finally {
      setBusy(false)
      // Refresh the page so the new run shows up in the table.
      setTimeout(() => {
        if (typeof window !== 'undefined') window.location.reload()
      }, 1500)
    }
  }

  return (
    <div className="text-right shrink-0">
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-violet-300 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-60"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
        {busy ? 'Running…' : 'Run now'}
      </button>
      {last && (
        <div className="mt-1 text-[10px] text-muted-foreground font-mono">{last}</div>
      )}
    </div>
  )
}
