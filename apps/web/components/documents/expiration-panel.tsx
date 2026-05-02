'use client'

/**
 * DocumentExpirationPanel — embeddable Dashboard tile (Spec 2.6.2).
 *
 * Pulls /api/documents/expiring (server recomputes status) and renders a
 * compact list grouped by status: expired (red), expiring-soon (amber),
 * current (green/dim). Designed to drop into Dashboard.tsx.
 *
 * NOT yet mounted on Dashboard.tsx — that 703-line legacy component
 * needs surgical insertion best done with the operator. Component is
 * ready; logged as 2.6.2 follow-up.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarClock, ArrowRight, AlertTriangle } from 'lucide-react'
import type { Document, ExpirationPersona, ExpirationStatus } from '@/types'

const TONE: Record<ExpirationStatus, { dot: string; text: string; label: string }> = {
  expired:        { dot: 'bg-red-500',     text: 'text-red-700',    label: 'Expired' },
  'expiring-soon': { dot: 'bg-amber-500',   text: 'text-amber-700',  label: 'Expiring soon' },
  current:        { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Current' },
}

interface Props {
  className?: string
  /** Default 60 days. */
  lookAheadDays?: number
  persona?: ExpirationPersona | null
  /** Cap on rows per section. Default 5. */
  maxPerSection?: number
}

export function DocumentExpirationPanel({
  className = '',
  lookAheadDays = 60,
  persona = null,
  maxPerSection = 5,
}: Props) {
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const params = new URLSearchParams()
        params.set('lookAhead', String(lookAheadDays))
        if (persona) params.set('persona', persona)
        const res = await fetch(`/api/documents/expiring?${params.toString()}`)
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setDocs((data?.documents ?? []) as Document[])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [lookAheadDays, persona])

  const expired = docs.filter((d) => d.expiration_status === 'expired')
  const expiring = docs.filter((d) => d.expiration_status === 'expiring-soon')
  const current = docs.filter((d) => d.expiration_status === 'current')

  return (
    <div className={`bg-white rounded-2xl border border-border overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>Document expirations</h3>
        </div>
        <Link
          href="/documents/expiring"
          className="text-[11px] text-primary inline-flex items-center gap-0.5"
        >
          Review all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="p-3 space-y-2">
        {loading ? (
          <div className="text-[11.5px] text-muted-foreground py-3 text-center">Loading…</div>
        ) : docs.length === 0 ? (
          <div className="text-[11.5px] text-muted-foreground py-3 text-center">
            No documents expiring in the next {lookAheadDays} days.
          </div>
        ) : (
          <>
            <Section label={TONE.expired.label}        rows={expired.slice(0, maxPerSection)}  status="expired" />
            <Section label={TONE['expiring-soon'].label} rows={expiring.slice(0, maxPerSection)} status="expiring-soon" />
            {expired.length === 0 && expiring.length === 0 && (
              <Section label={TONE.current.label}      rows={current.slice(0, maxPerSection)}    status="current" dim />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Section({
  label, rows, status, dim = false,
}: {
  label: string
  rows: Document[]
  status: ExpirationStatus
  dim?: boolean
}) {
  if (rows.length === 0) return null
  const tone = TONE[status]
  return (
    <div className={dim ? 'opacity-70' : ''}>
      <div className="flex items-center gap-1.5 px-1 mb-1">
        <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider" style={{ fontWeight: 700 }}>
          {label} <span className="text-muted-foreground/60">· {rows.length}</span>
        </span>
      </div>
      <ul className="space-y-1">
        {rows.map((d) => (
          <li key={d.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/30">
            {status === 'expired' && <AlertTriangle className={`h-3 w-3 ${tone.text} shrink-0`} />}
            <Link
              href={`/documents/expiring`}
              className="text-[12px] text-foreground truncate flex-1 hover:underline"
              style={{ fontWeight: 600 }}
            >
              {d.title ?? '(untitled)'}
            </Link>
            <span className="text-[10.5px] text-muted-foreground tabular-nums shrink-0">
              {d.expiration_date ?? '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
