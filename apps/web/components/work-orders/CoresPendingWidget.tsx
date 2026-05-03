'use client'

/**
 * CoresPendingWidget (Spec 3.2) — small dashboard tile.
 *
 * Shows count of org's core_obligations rows with status='pending' (or
 * 'overdue'), with a CTA linking to the future /core-obligations page.
 * Mountable on the dashboard or any persona-aware home surface.
 */

import { useEffect, useState } from 'react'
import { Package } from 'lucide-react'
import { cn } from '@/lib/utils'

export function CoresPendingWidget({ className }: { className?: string }) {
  const [pending, setPending] = useState<number | null>(null)
  const [overdue, setOverdue] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/core-obligations?status=pending').then((r) => r.json()).catch(() => ({})),
      fetch('/api/core-obligations?status=overdue').then((r) => r.json()).catch(() => ({})),
    ]).then(([p, o]) => {
      if (cancelled) return
      setPending((p as { obligations?: unknown[] }).obligations?.length ?? 0)
      setOverdue((o as { obligations?: unknown[] }).obligations?.length ?? 0)
    })
    return () => { cancelled = true }
  }, [])

  const total = (pending ?? 0) + (overdue ?? 0)
  const tone =
    overdue && overdue > 0 ? 'bg-rose-50 border-rose-200 text-rose-800' :
    total > 0 ? 'bg-amber-50 border-amber-200 text-amber-800' :
    'bg-emerald-50 border-emerald-200 text-emerald-800'

  return (
    <div className={cn('rounded-2xl border p-4 flex items-center gap-3', tone, className)}>
      <Package className="h-5 w-5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[10.5px] uppercase tracking-wider" style={{ fontWeight: 700 }}>
          Cores pending
        </div>
        <div className="text-[18px] tabular-nums" style={{ fontWeight: 700 }}>
          {total === 0 ? 'All clear' : `${total}${overdue && overdue > 0 ? ` · ${overdue} overdue` : ''}`}
        </div>
      </div>
    </div>
  )
}
