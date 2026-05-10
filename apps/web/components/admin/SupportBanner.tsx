'use client'

/**
 * Phase 16 Sprint 16.4 — admin-page top banner that surfaces P0 SLA
 * breaches. Polls /api/admin/support/counts every 60s. Hidden when
 * p0_breaching === 0.
 *
 * Mounted at the top of the /admin/* layout in the admin layout.tsx.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

interface Counts {
  awaiting_admin: number
  p0_breaching: number
}

export function SupportBanner() {
  const [counts, setCounts] = useState<Counts | null>(null)

  useEffect(() => {
    let cancelled = false
    async function tick() {
      try {
        const res = await fetch('/api/admin/support/counts', { cache: 'no-store' })
        if (cancelled) return
        if (!res.ok) return
        setCounts(await res.json())
      } catch { /* tolerate */ }
    }
    tick()
    const id = setInterval(tick, 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  if (!counts || counts.p0_breaching === 0) return null

  return (
    <div className="border-b border-red-300 bg-gradient-to-r from-red-50 to-orange-50 px-4 py-2 text-sm">
      <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-red-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <span className="font-semibold">{counts.p0_breaching} P0 ticket{counts.p0_breaching === 1 ? '' : 's'}</span>
            {' '}past SLA — needs immediate response.
          </span>
        </div>
        <Link
          href="/admin/support/inbox?status=awaiting_admin&severity=P0"
          className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
        >
          Open inbox
        </Link>
      </div>
    </div>
  )
}
