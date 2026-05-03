'use client'

/**
 * ProfitabilityCard (Spec 7.5).
 *
 * Headline KPIs for the period: Revenue, True Cost, Net Profit, and
 * Profit / hour. Net Profit is color-coded green when ≥ 0, red when < 0.
 *
 * Revenue source — TODO(7.x): aircraft.rental_rate column doesn't exist
 * yet. Caller passes `revenueTotal` derived from rate × flight hours;
 * when rate is null caller passes 0 + we render the "Set rental rate"
 * empty state.
 */

import { TrendingUp, TrendingDown, DollarSign, Plane } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SourceBadge } from '@/lib/ui/SourceBadge'

interface Props {
  revenueTotal: number
  costTotal: number
  flightHours: number
  rentalRate: number | null
  period: '30d' | '90d' | '365d'
}

function fmt(n: number) {
  if (!Number.isFinite(n)) return '$0'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}
function fmt2(n: number) {
  if (!Number.isFinite(n)) return '$0.00'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)
}

export function ProfitabilityCard({ revenueTotal, costTotal, flightHours, rentalRate, period }: Props) {
  const netProfit = revenueTotal - costTotal
  const profitable = netProfit >= 0
  const profitPerHour = flightHours > 0 ? netProfit / flightHours : 0

  const profitTone = profitable ? 'text-emerald-700' : 'text-rose-700'
  const profitBg = profitable ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'

  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-[14px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Profitability — {period.replace('d', '-day')} period
          </h2>
          {/* Spec 7.8 — confidence badge keyed on revenue source. Today
              there's no rental ledger (logged 7.4 follow-up) so the
              numbers are estimated. Once aircraft.rental_rate lands the
              caller can pass an explicit source string. */}
          <SourceBadge tier={rentalRate == null ? 'estimated' : 'verified'} />
        </div>
        <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 600 }}>
          {flightHours.toFixed(1)} hr flown
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label="Revenue"
          value={fmt(revenueTotal)}
          icon={DollarSign}
          tone="text-blue-700"
          bg="bg-blue-50 border-blue-200"
          footnote={rentalRate == null ? 'Set rental rate to compute revenue.' : `Rate ${fmt2(rentalRate)}/hr`}
        />
        <Kpi
          label="True cost"
          value={fmt(costTotal)}
          icon={TrendingDown}
          tone="text-amber-700"
          bg="bg-amber-50 border-amber-200"
          footnote="Wet — fuel + reserves + fixed"
        />
        <Kpi
          label="Net profit"
          value={fmt(netProfit)}
          icon={profitable ? TrendingUp : TrendingDown}
          tone={profitTone}
          bg={profitBg}
          footnote={profitable ? 'In the black' : 'In the red'}
        />
        <Kpi
          label="Per hour"
          value={fmt2(profitPerHour)}
          icon={Plane}
          tone={profitTone}
          bg={profitBg}
          footnote="Net / flight hours"
        />
      </div>
    </div>
  )
}

function Kpi({
  label, value, icon: Icon, tone, bg, footnote,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  tone: string
  bg: string
  footnote: string
}) {
  return (
    <div className={cn('rounded-xl border p-3', bg)}>
      <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1.5" style={{ fontWeight: 700 }}>
        <Icon className={cn('h-3 w-3', tone)} />
        {label}
      </div>
      <div className={cn('text-[20px] tabular-nums', tone)} style={{ fontWeight: 700 }}>
        {value}
      </div>
      <div className="text-[10.5px] text-muted-foreground mt-1">{footnote}</div>
    </div>
  )
}
