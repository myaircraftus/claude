'use client'

/**
 * Fleet Analytics — org-wide rollup card on the Dashboard. Hits
 * /api/fleet/summary once on mount and renders six tiles: Aircraft,
 * Open Work Orders, AD compliance, Documents, YTD Spend, Open Squawks.
 *
 * Each tile is a quick read at a glance with a deep-link to the relevant
 * surface (work orders → /aircraft, ADs → first overdue aircraft's AD tab,
 * etc.). Designed to live above the existing Maintenance-Spend chart row.
 */

import { useEffect, useState } from 'react'
import {
  Plane,
  Wrench,
  ShieldCheck,
  FileText,
  DollarSign,
  AlertTriangle,
  Loader2,
  TrendingUp,
} from 'lucide-react'
import Link from '@/components/shared/tenant-link'

interface FleetSummary {
  aircraft: { total: number; with_open_wo: number }
  work_orders: {
    open: number
    awaiting_approval: number
    total_open_value_cents: number
    hours_logged: number
  }
  ads: { total: number; compliant: number; overdue: number; unknown: number }
  documents: {
    total: number
    indexed: number
    processing: number
    failed: number
    needs_review: number
  }
  maintenance_spend_ytd_cents: number
  squawks: { open: number; critical: number }
  timeline_30d: { events: number; by_day: Array<{ date: string; count: number }> }
}

function fmtCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

export function FleetAnalyticsRow() {
  const [data, setData] = useState<FleetSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/fleet/summary')
        if (!res.ok) return
        const json = (await res.json()) as FleetSummary
        if (!cancelled) setData(json)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-border p-6 flex items-center gap-3 text-[12px] text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading fleet analytics…
      </div>
    )
  }
  if (!data) return null

  const tiles = [
    {
      key: 'aircraft',
      icon: Plane,
      label: 'Aircraft',
      value: data.aircraft.total,
      sub:
        data.aircraft.with_open_wo > 0
          ? `${data.aircraft.with_open_wo} with active work`
          : 'All clear',
      href: '/aircraft',
      tone: 'bg-blue-50 text-blue-700',
    },
    {
      key: 'work_orders',
      icon: Wrench,
      label: 'Open Work Orders',
      value: data.work_orders.open,
      sub:
        data.work_orders.awaiting_approval > 0
          ? `${data.work_orders.awaiting_approval} awaiting approval`
          : `${data.work_orders.hours_logged}h logged`,
      href: '/aircraft',
      tone: 'bg-violet-50 text-violet-700',
    },
    {
      key: 'ads',
      icon: ShieldCheck,
      label: 'AD Compliance',
      value:
        data.ads.total > 0
          ? `${Math.round((data.ads.compliant / data.ads.total) * 100)}%`
          : '—',
      sub:
        data.ads.overdue > 0
          ? `${data.ads.overdue} overdue`
          : data.ads.unknown > 0
          ? `${data.ads.unknown} unknown`
          : `${data.ads.total} on file`,
      href: '/aircraft',
      tone: data.ads.overdue > 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700',
    },
    {
      key: 'documents',
      icon: FileText,
      label: 'Records Indexed',
      value: data.documents.indexed,
      sub:
        data.documents.failed + data.documents.needs_review > 0
          ? `${data.documents.failed + data.documents.needs_review} need attention`
          : data.documents.processing > 0
          ? `${data.documents.processing} processing`
          : `${data.documents.total} total`,
      href: '/aircraft',
      tone:
        data.documents.failed + data.documents.needs_review > 0
          ? 'bg-amber-50 text-amber-700'
          : 'bg-slate-50 text-slate-700',
    },
    {
      key: 'spend',
      icon: DollarSign,
      label: 'Spend YTD',
      value: fmtCurrency(data.maintenance_spend_ytd_cents),
      sub: `${data.work_orders.open > 0 ? fmtCurrency(data.work_orders.total_open_value_cents) + ' open' : 'No open WOs'}`,
      href: '/aircraft',
      tone: 'bg-emerald-50 text-emerald-700',
    },
    {
      key: 'squawks',
      icon: AlertTriangle,
      label: 'Open Squawks',
      value: data.squawks.open,
      sub:
        data.squawks.critical > 0
          ? `${data.squawks.critical} critical`
          : data.squawks.open > 0
          ? 'Routine'
          : 'All clear',
      href: '/aircraft',
      tone:
        data.squawks.critical > 0 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700',
    },
  ]

  return (
    <div className="bg-white rounded-2xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>
            Fleet Analytics
          </h3>
          <span className="text-[11px] text-muted-foreground">
            {data.timeline_30d.events} interactions in last 30 days
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {tiles.map((tile) => (
          <Link
            key={tile.key}
            href={tile.href}
            className="group bg-muted/20 hover:bg-muted/40 rounded-xl border border-border/50 p-3 transition-all"
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${tile.tone}`}>
              <tile.icon className="w-4 h-4" />
            </div>
            <div className="text-[20px] text-foreground tabular-nums" style={{ fontWeight: 700 }}>
              {tile.value}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5" style={{ fontWeight: 600 }}>
              {tile.label}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{tile.sub}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
