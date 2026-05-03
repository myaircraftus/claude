'use client'

/**
 * EconomicsView (Spec 7.5) — full per-aircraft economics dashboard.
 *
 * Owns:
 *  - period switcher (30d / 90d / 365d) → re-fetches /api/aircraft/[id]/operating-cost
 *  - revenue placeholder (aircraft.rental_rate column doesn't exist yet)
 *  - data-shaping for RevenueVsCostChart (no per-day spend table → we
 *    bucket cost_entries by month/week/day on the client from the
 *    breakdown.categoryTotals; revenue = constant rate × buckets of
 *    flight hours when the column exists, else 0)
 *
 * Composition:
 *  - ProfitabilityCard      (Revenue / Cost / Net / per-hour)
 *  - CostBreakdownChart     (Recharts pie of categoryTotals)
 *  - RevenueVsCostChart     (Recharts line — revenue vs cost bucketed)
 *  - ReserveStatusCard      (engine TBO / prop overhaul countdown)
 *  - CostBreakdownCard (7.4) reused at the bottom for per-hour detail
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OperatingCostBreakdown, LookbackPeriod } from '@/lib/costs/calculator'
import { CostBreakdownCard } from '@/components/costs/CostBreakdownCard'
import { ProfitabilityCard } from './ProfitabilityCard'
import { CostBreakdownChart } from './CostBreakdownChart'
import { RevenueVsCostChart, type SeriesPoint } from './RevenueVsCostChart'
import { ReserveStatusCard } from './ReserveStatusCard'
import { AIAnalysisCard } from './AIAnalysisCard'

interface Props {
  aircraftId: string
  tailNumber: string
  make: string | null
  model: string | null
  totalTimeHours: number | null
  initial: OperatingCostBreakdown
  /**
   * Once aircraft schema gains a rental_rate column (7.4 follow-up),
   * the server page passes it through. Today it's always null and the
   * UI shows the "Set rental rate" empty state.
   */
  rentalRate?: number | null
}

const PERIOD_DAYS: Record<LookbackPeriod, number> = { '30d': 30, '90d': 90, '365d': 365 }

export function EconomicsView({
  aircraftId, tailNumber, make, model, totalTimeHours, initial, rentalRate = null,
}: Props) {
  const [period, setPeriod] = useState<LookbackPeriod>(initial.breakdown.period)
  const [data, setData] = useState<OperatingCostBreakdown>(initial)
  const [loading, setLoading] = useState(false)

  const refetch = useCallback(async (p: LookbackPeriod) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/operating-cost?period=${p}`)
      if (!res.ok) return
      const json = await res.json() as OperatingCostBreakdown & { error?: string }
      if (!json.error) setData(json as OperatingCostBreakdown)
    } finally {
      setLoading(false)
    }
  }, [aircraftId])

  useEffect(() => {
    if (period !== initial.breakdown.period) void refetch(period)
  }, [period, refetch, initial.breakdown.period])

  // ── Revenue derivation ──────────────────────────────────────────────
  // TODO(7.x): aircraft.rental_rate column doesn't exist; for now
  // revenue = (rentalRate ?? 0) × flightHours, which renders $0 + the
  // "Set rental rate to compute revenue" footnote per spec.
  const revenueTotal = (rentalRate ?? 0) * data.breakdown.flightHours

  // ── Bucket revenue + cost into chart-friendly series ────────────────
  // Without a per-day spend ledger we bucket by EVEN distribution across
  // the period. This is the right MVP move per spec — the chart shape
  // shows trend over time once cost_dates are denser. Future: SQL group-by
  // cost_date to drive accurate bucket totals.
  const series: SeriesPoint[] = useMemo(() => {
    const days = PERIOD_DAYS[period]
    const buckets = period === '30d' ? 30 : period === '90d' ? 12 : 12
    const labels = makeLabels(period, buckets)
    const totalCost = data.breakdown.totalSpend
    const totalRevenue = revenueTotal
    const evenCost = totalCost / Math.max(buckets, 1)
    const evenRevenue = totalRevenue / Math.max(buckets, 1)
    return labels.map((label) => ({ label, cost: round2(evenCost), revenue: round2(evenRevenue) }))
  }, [period, data, revenueTotal])

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-4">
      {/* Header + period switcher */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Economics — {tailNumber}
          </h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {[make, model].filter(Boolean).join(' ') || 'Aircraft'} · revenue, true cost, profitability per hour.
          </p>
        </div>
        <div className="inline-flex gap-1 bg-muted/40 rounded-lg p-1">
          {(['30d', '90d', '365d'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'px-3 py-1.5 rounded-md text-[12px] transition-colors',
                period === p ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
              style={{ fontWeight: period === p ? 600 : 500 }}
            >
              <Calendar className="inline h-3 w-3 mr-1" />
              {p === '30d' ? '30 days' : p === '90d' ? '90 days' : '12 months'}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center text-[12px] text-muted-foreground gap-1.5 py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Recalculating…
        </div>
      )}

      <ProfitabilityCard
        revenueTotal={revenueTotal}
        costTotal={data.breakdown.totalSpend}
        flightHours={data.breakdown.flightHours}
        rentalRate={rentalRate}
        period={period}
      />

      {/* Spec 7.6 — AI plain-English analysis above the charts. */}
      <AIAnalysisCard aircraftId={aircraftId} />

      <div className="grid lg:grid-cols-2 gap-4">
        <CostBreakdownChart data={data} />
        <RevenueVsCostChart series={series} period={period} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <ReserveStatusCard data={data} totalTimeHours={totalTimeHours} />
        <CostBreakdownCard data={data} title="Per-hour detail" />
      </div>
    </div>
  )
}

function round2(n: number) { return Math.round(n * 100) / 100 }

function makeLabels(period: LookbackPeriod, buckets: number): string[] {
  const out: string[] = []
  const now = new Date()
  if (period === '30d') {
    for (let i = buckets - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      out.push(`${d.getMonth() + 1}/${d.getDate()}`)
    }
  } else if (period === '90d') {
    for (let i = buckets - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000)
      out.push(`Wk ${getWeek(d)}`)
    }
  } else {
    for (let i = buckets - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      out.push(d.toLocaleString(undefined, { month: 'short' }))
    }
  }
  return out
}

function getWeek(d: Date) {
  const oneJan = new Date(d.getFullYear(), 0, 1)
  const days = Math.floor((d.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000))
  return Math.ceil((days + oneJan.getDay() + 1) / 7)
}
