'use client'

/**
 * CostBreakdownChart (Spec 7.5) — Recharts pie of cost categories
 * for the current period. Reads OperatingCostBreakdown.breakdown.categoryTotals
 * (raw $) so the slices reflect actual spend, not annualized derivatives.
 */

import { useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { OperatingCostBreakdown } from '@/lib/costs/calculator'
import { CATEGORY_LABEL, type CostCategory } from '@/lib/costs/categories'

const COLORS = [
  '#f59e0b', // amber — fuel
  '#fbbf24', // amber-light — oil
  '#dc2626', // red — engine reserve
  '#f87171', // red-light — prop reserve
  '#3b82f6', // blue — insurance
  '#60a5fa', // blue-light — hangar
  '#8b5cf6', // violet — annual inspection
  '#94a3b8', // slate — loan
  '#64748b', // slate-deep — depreciation
  '#10b981', // emerald — other
  '#6b7280', // gray — fallback
]

function fmt(n: number) {
  if (!Number.isFinite(n)) return '$0'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

interface Props {
  data: OperatingCostBreakdown
}

export function CostBreakdownChart({ data }: Props) {
  const slices = useMemo(() => {
    const entries = Object.entries(data.breakdown.categoryTotals)
      .filter(([, v]) => v > 0)
      .map(([category, amount]) => ({
        category,
        amount,
        label: CATEGORY_LABEL[category as CostCategory] ?? category.replace(/_/g, ' '),
      }))
      .sort((a, b) => b.amount - a.amount)
    return entries
  }, [data])

  const totalSpend = data.breakdown.totalSpend

  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-[14px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Cost breakdown
          </h3>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">
            {data.breakdown.period.replace('d', '-day')} period · {fmt(totalSpend)} total spend
          </p>
        </div>
      </div>

      {slices.length === 0 ? (
        <div className="text-[12px] text-muted-foreground py-12 text-center">
          No approved cost entries in this period yet.
        </div>
      ) : (
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={slices}
                dataKey="amount"
                nameKey="label"
                outerRadius={100}
                innerRadius={48}
                paddingAngle={1}
              >
                {slices.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => fmt(value)}
                contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                wrapperStyle={{ fontSize: 11 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
