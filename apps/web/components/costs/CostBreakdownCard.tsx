'use client'

/**
 * CostBreakdownCard (Spec 7.4) — small reusable card showing per-hour
 * operating cost components. Used standalone on /aircraft/[id]/economics
 * (sprint 7.5) and in any future surface that needs the same breakdown.
 *
 * The card is presentation-only — caller fetches the breakdown via the
 * /api/aircraft/[id]/operating-cost endpoint and passes it in.
 */

import { Plane, Fuel, Wrench, Shield, Home, Banknote, TrendingDown, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OperatingCostBreakdown } from '@/lib/costs/calculator'

interface Props {
  data: OperatingCostBreakdown
  /** Optional title override; default "Cost per hour". */
  title?: string
  className?: string
}

function fmt(n: number) {
  if (!Number.isFinite(n)) return '$0.00'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)
}

export function CostBreakdownCard({ data, title = 'Cost per hour', className }: Props) {
  const rows: Array<{ label: string; value: number; icon: React.ComponentType<{ className?: string }>; tone: string }> = [
    { label: 'Fuel',                value: data.fuelPerHour,             icon: Fuel,         tone: 'text-amber-700' },
    { label: 'Oil',                 value: data.oilPerHour,              icon: Fuel,         tone: 'text-amber-700' },
    { label: 'Engine reserve',      value: data.engineReservePerHour,    icon: Wrench,       tone: 'text-rose-700' },
    { label: 'Prop reserve',        value: data.propReservePerHour,      icon: Wrench,       tone: 'text-rose-700' },
    { label: 'Annual inspection',   value: data.annualInspectionPerHour, icon: Wrench,       tone: 'text-rose-700' },
    { label: 'Insurance',           value: data.insurancePerHour,        icon: Shield,       tone: 'text-blue-700' },
    { label: 'Hangar / tiedown',    value: data.hangarPerHour,           icon: Home,         tone: 'text-blue-700' },
    { label: 'Loan',                value: data.loanPerHour,             icon: Banknote,     tone: 'text-slate-700' },
    { label: 'Depreciation',        value: data.depreciationPerHour,     icon: TrendingDown, tone: 'text-slate-700' },
    { label: 'Other',               value: data.otherPerHour,            icon: Plane,        tone: 'text-muted-foreground' },
  ].filter((r) => r.value > 0)

  const confidencePct = Math.round(data.confidence * 100)
  const confidenceTone =
    confidencePct >= 85 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    confidencePct >= 60 ? 'bg-amber-50 text-amber-700 border-amber-200' :
    'bg-rose-50 text-rose-700 border-rose-200'

  return (
    <div className={cn('rounded-2xl border border-border bg-white p-5', className)}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[14px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            {title}
          </h3>
          <p className="text-[11.5px] text-muted-foreground mt-0.5 capitalize">
            {data.breakdown.period.replace('d', '-day')} lookback · {data.breakdown.flightHours.toFixed(1)} hr flown · {data.breakdown.costEntryCount} entries
          </p>
        </div>
        <span
          className={cn('inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border tabular-nums', confidenceTone)}
          style={{ fontWeight: 700 }}
          title="Confidence: 0.85 if ≥50 flight hours AND ≥10 cost entries; else 0.55"
        >
          {confidencePct}% conf
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="text-[12px] text-muted-foreground py-6 text-center">
          No per-hour components computed for this period.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((r) => {
            const Icon = r.icon
            return (
              <div key={r.label} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <Icon className={cn('h-3.5 w-3.5', r.tone)} />
                  <span className="text-[12.5px] text-foreground">{r.label}</span>
                </div>
                <span className="text-[12.5px] tabular-nums text-foreground" style={{ fontWeight: 600 }}>
                  {fmt(r.value)}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Wet + Dry totals */}
      <div className="mt-4 pt-4 border-t border-border space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-muted-foreground">Dry cost / hour</span>
          <span className="text-[13px] tabular-nums" style={{ fontWeight: 700 }}>{fmt(data.dryCostPerHour)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>Wet cost / hour</span>
          <span className="text-[15px] tabular-nums text-foreground" style={{ fontWeight: 700 }}>
            {fmt(data.wetCostPerHour)}
          </span>
        </div>
      </div>

      {data.breakdown.notes.length > 0 && (
        <div className="mt-3 rounded-md bg-muted/30 border border-border p-2.5 text-[11px] text-muted-foreground space-y-1">
          {data.breakdown.notes.map((n, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{n}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
