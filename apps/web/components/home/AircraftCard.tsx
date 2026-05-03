'use client'

/**
 * AircraftCard (Spec 5.1) — live tile per aircraft on Owner SmartHome.
 *
 * Layout:
 *   🛩 N12345 Cessna 172
 *     Hobbs 38.5  Tach 32.7
 *     Open squawks: 0
 *     Last flight: 2.1 hr today  (from Airbly/ADSB)
 *     Insurance: 142 days
 *
 * Data flow: parent server component fetches aircraft + meter readings +
 * squawks + next expiring doc and passes a flat `summary` prop. Keeps
 * this component pure-render so it can also be used in a Phase 5.2
 * "fleet" filter later.
 */

import Link from '@/components/shared/tenant-link'
import { Plane, AlertTriangle, ShieldCheck, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AircraftCardSummary {
  id: string
  tail_number: string
  make?: string | null
  model?: string | null
  hobbs?: number | null
  tach?: number | null
  /** Open squawk count. */
  open_squawks?: number
  /** Most recent ADSB/Airbly flight detected today, in hours. NULL if none. */
  today_airborne_hours?: number | null
  /** Days until the next expiring document (registration / insurance / etc). */
  days_until_next_expiration?: number | null
  next_expiring_label?: string | null
}

export function AircraftCard({ summary }: { summary: AircraftCardSummary }) {
  const { id, tail_number, make, model, hobbs, tach, open_squawks, today_airborne_hours,
          days_until_next_expiration, next_expiring_label } = summary

  const isExpiringSoon = days_until_next_expiration != null && days_until_next_expiration <= 30
  const hasOpenSquawks = (open_squawks ?? 0) > 0

  return (
    <Link
      href={`/aircraft/${id}`}
      className="block bg-white rounded-2xl border border-border p-5 hover:border-blue-300 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <Plane className="h-5 w-5 text-blue-700" />
          </div>
          <div>
            <div className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>
              {tail_number}
            </div>
            <div className="text-[11.5px] text-muted-foreground">
              {[make, model].filter(Boolean).join(' ') || 'Aircraft'}
            </div>
          </div>
        </div>
        {today_airborne_hours != null && today_airborne_hours > 0 && (
          <span className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200" style={{ fontWeight: 700 }}>
            <Clock className="h-3 w-3" />
            {today_airborne_hours.toFixed(1)} hr today
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-[12.5px]">
        <Stat label="Hobbs" value={hobbs?.toFixed?.(1) ?? '—'} />
        <Stat label="Tach"  value={tach?.toFixed?.(1) ?? '—'} />
        <Stat
          label="Open squawks"
          value={String(open_squawks ?? 0)}
          tone={hasOpenSquawks ? 'warning' : undefined}
        />
        <Stat
          label={next_expiring_label ?? 'Next expiry'}
          value={
            days_until_next_expiration != null
              ? `${days_until_next_expiration} ${days_until_next_expiration === 1 ? 'day' : 'days'}`
              : '—'
          }
          tone={isExpiringSoon ? 'warning' : undefined}
        />
      </div>

      {(hasOpenSquawks || isExpiringSoon) && (
        <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 text-[11.5px]">
          {hasOpenSquawks && (
            <span className="inline-flex items-center gap-1 text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              {open_squawks} open squawk{open_squawks === 1 ? '' : 's'}
            </span>
          )}
          {isExpiringSoon && next_expiring_label && (
            <span className="inline-flex items-center gap-1 text-amber-700">
              <ShieldCheck className="h-3 w-3" />
              {next_expiring_label} expires in {days_until_next_expiration} {days_until_next_expiration === 1 ? 'day' : 'days'}
            </span>
          )}
        </div>
      )}
    </Link>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warning' }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-2 py-1.5 rounded-md bg-muted/30">
      <span className="text-[10.5px] text-muted-foreground uppercase tracking-wider" style={{ fontWeight: 600 }}>
        {label}
      </span>
      <span
        className={cn(
          'tabular-nums',
          tone === 'warning' ? 'text-amber-700 font-semibold' : 'text-foreground',
        )}
        style={{ fontWeight: tone === 'warning' ? 700 : 600 }}
      >
        {value}
      </span>
    </div>
  )
}
