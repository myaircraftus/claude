'use client'

/**
 * RevenueVsCostChart (Spec 7.5) — line chart over the selected period.
 * Caller passes `series` which is already bucketed by month (or day for
 * shorter windows). For the 365d view we render 12 monthly points; for
 * 90d we render 12 weekly buckets; for 30d we render daily.
 *
 * Data shaping happens in EconomicsView so this component stays a dumb
 * Recharts renderer.
 */

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'

export interface SeriesPoint {
  /** Display label on the X axis (e.g. "Jan", "Wk 12", "Apr 4"). */
  label: string
  revenue: number
  cost: number
}

interface Props {
  series: SeriesPoint[]
  period: '30d' | '90d' | '365d'
}

function fmt(n: number) {
  if (!Number.isFinite(n)) return '$0'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export function RevenueVsCostChart({ series, period }: Props) {
  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <div className="mb-3">
        <h3 className="text-[14px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
          Revenue vs cost
        </h3>
        <p className="text-[11.5px] text-muted-foreground mt-0.5">
          {period === '30d' ? 'Daily' : period === '90d' ? 'Weekly' : 'Monthly'} buckets
        </p>
      </div>

      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <LineChart data={series} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmt(Number(v))} width={70} />
            <Tooltip
              formatter={(value: number) => fmt(value)}
              contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={false} name="Revenue" />
            <Line type="monotone" dataKey="cost"    stroke="#ef4444" strokeWidth={2} dot={false} name="Cost" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
