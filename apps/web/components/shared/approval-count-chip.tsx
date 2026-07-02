'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { CheckCircle2, ClipboardList } from 'lucide-react'

/**
 * Topbar chip that surfaces pending-approval counts across the
 * platform — agent recommendations needing human review + inbox
 * drafts (receipt / estimate / invoice) awaiting founder approval.
 *
 * Only renders when the API confirms the user is a platform admin.
 * Polls every 60s.
 *
 * Click → /admin/agents (where the founder triages).
 */
interface Breakdown {
  agent_recommendations: number
  inbox_pending: number
  tach_review_pending: number
}

interface ApprovalResponse {
  ok: boolean
  is_admin: boolean
  count: number
  breakdown?: Breakdown
}

export function ApprovalCountChip() {
  const [data, setData] = useState<ApprovalResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/admin/approvals/count', { credentials: 'include' })
        if (!res.ok) return
        const json = (await res.json()) as ApprovalResponse
        if (!cancelled) setData(json)
      } catch {
        // best-effort — leave the chip hidden on error
      }
    }
    load()
    const id = window.setInterval(load, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  if (!data?.ok || !data.is_admin) return null
  const count = data.count
  const breakdown = data.breakdown
  const tooltip = breakdown
    ? `${breakdown.agent_recommendations} agent recs · ${breakdown.inbox_pending} inbox drafts${
        breakdown.tach_review_pending > 0
          ? ` · ${breakdown.tach_review_pending} tach reviews`
          : ''
      }`
    : 'Pending approvals'

  if (count === 0) {
    return (
      <Link
        href="/admin/agents"
        className="hidden md:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[12px] text-emerald-700 hover:bg-emerald-50 transition-colors"
        title="All caught up — nothing waiting for admin review"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Admin queue
      </Link>
    )
  }

  return (
    <Link
      href="/admin/agents"
      className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[12px] text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors"
      title={tooltip}
    >
      <ClipboardList className="h-3.5 w-3.5" />
      <span className="font-medium">{count}</span>
      <span className="hidden md:inline">to review</span>
    </Link>
  )
}
