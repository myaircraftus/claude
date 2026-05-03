'use client'

/**
 * ReserveStatusCard (Spec 7.5).
 *
 * Engine TBO + prop overhaul countdown. Reads the reserve assumptions
 * from the calculator output (defaults until per-aircraft overrides
 * land — logged 7.4 follow-up) plus the aircraft's current total time.
 *
 * Math: hoursRemaining = tboHours − totalTimeHours. We don't track
 * "time since overhaul" separately yet — the simplifying assumption
 * here is that aircraft.total_time_hours represents the engine's time
 * since the last overhaul. Future: pull from a maintenance_events row
 * tagged 'engine_overhaul' and compute (TT − last_overhaul_TT).
 */

import { Wrench, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OperatingCostBreakdown } from '@/lib/costs/calculator'

interface Props {
  data: OperatingCostBreakdown
  totalTimeHours: number | null
}

function fmtHours(n: number) {
  if (!Number.isFinite(n)) return '0 hr'
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} hr`
}

interface ReserveDisplay {
  title: string
  tbo: number
  tt: number | null
  perHour: number
  isDefault: boolean
}

function Row({ d }: { d: ReserveDisplay }) {
  const remaining = d.tt == null ? null : Math.max(0, d.tbo - d.tt)
  const pct = d.tt == null ? null : Math.min(100, Math.max(0, (d.tt / d.tbo) * 100))
  const overdue = d.tt != null && d.tt > d.tbo
  const dueSoon = pct != null && pct >= 85 && !overdue

  const tone = overdue ? 'text-rose-700' : dueSoon ? 'text-amber-700' : 'text-emerald-700'
  const Icon = overdue ? AlertTriangle : dueSoon ? AlertTriangle : CheckCircle2
  const barTone = overdue ? 'bg-rose-500' : dueSoon ? 'bg-amber-500' : 'bg-emerald-500'

  return (
    <div className="py-3">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{d.title}</span>
        </div>
        <span className={cn('inline-flex items-center gap-1 text-[11px]', tone)} style={{ fontWeight: 600 }}>
          <Icon className="h-3 w-3" />
          {d.tt == null ? 'No TT recorded' : remaining === 0 || overdue ? 'Overdue' : `${fmtHours(remaining ?? 0)} remaining`}
        </span>
      </div>
      {pct != null && (
        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
          <div className={cn('h-full transition-all', barTone)} style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground tabular-nums">
        <span>
          {d.tt == null ? 'Total time unknown' : `${fmtHours(d.tt)} of ${fmtHours(d.tbo)}`}
          {d.isDefault && <span className="ml-1.5 italic">(default)</span>}
        </span>
        <span>${d.perHour.toFixed(2)}/hr reserve</span>
      </div>
    </div>
  )
}

export function ReserveStatusCard({ data, totalTimeHours }: Props) {
  const engine: ReserveDisplay = {
    title: 'Engine TBO',
    tbo: data.breakdown.engineReserve.tboHours,
    tt: totalTimeHours,
    perHour: data.engineReservePerHour,
    isDefault: data.breakdown.engineReserve.isDefault,
  }
  const prop: ReserveDisplay = {
    title: 'Prop overhaul',
    tbo: data.breakdown.propReserve.tboHours,
    tt: totalTimeHours,
    perHour: data.propReservePerHour,
    isDefault: data.breakdown.propReserve.isDefault,
  }

  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <h3 className="text-[14px] tracking-tight text-foreground mb-1" style={{ fontWeight: 700 }}>
        Reserve status
      </h3>
      <p className="text-[11.5px] text-muted-foreground">
        Hours-to-overhaul countdown using current total time. Per-aircraft TBO overrides land when the aircraft schema gains the column (logged 7.4 follow-up).
      </p>
      <div className="mt-3 divide-y divide-border">
        <Row d={engine} />
        <Row d={prop} />
      </div>
    </div>
  )
}
