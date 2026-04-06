'use client'

import { useState } from 'react'
import { RefreshCw, CheckCircle, AlertTriangle, XCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AircraftComputedStatus } from '@/types/intelligence'

interface Props {
  status: AircraftComputedStatus | null
  aircraftId: string
  onRefresh?: (newStatus: AircraftComputedStatus) => void
}

function StatusBadge({ isCurrent, noRecord }: { isCurrent: boolean; noRecord?: boolean }) {
  if (noRecord) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Clock className="h-3 w-3" /> No Record
      </span>
    )
  }
  if (isCurrent) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
        <CheckCircle className="h-3 w-3" /> Current
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500">
      <XCircle className="h-3 w-3" /> Overdue
    </span>
  )
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function DueLabel({ nextDue, isCurrent }: { nextDue: string | null | undefined; isCurrent: boolean }) {
  const days = daysUntil(nextDue)
  if (!nextDue) return <span className="text-xs text-muted-foreground">—</span>
  if (days === null) return <span className="text-xs text-muted-foreground">{nextDue}</span>
  if (!isCurrent) {
    return (
      <span className="text-xs text-red-500 font-medium">
        {Math.abs(days)}d overdue
      </span>
    )
  }
  if (days <= 60) {
    return (
      <span className="text-xs text-amber-500 font-medium">
        Due in {days}d
      </span>
    )
  }
  return <span className="text-xs text-muted-foreground">Due {nextDue}</span>
}

export function ComputedStatusGrid({ status, aircraftId, onRefresh }: Props) {
  const [recomputing, setRecomputing] = useState(false)

  async function handleRecompute() {
    setRecomputing(true)
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/compute-status`, { method: 'POST' })
      const data = await res.json()
      if (data.status && onRefresh) onRefresh(data.status)
    } finally {
      setRecomputing(false)
    }
  }

  const healthScore = status?.health_score ?? null
  const healthColor =
    healthScore === null ? 'text-muted-foreground'
    : healthScore >= 80 ? 'text-green-600'
    : healthScore >= 50 ? 'text-amber-500'
    : 'text-red-500'

  return (
    <div className="space-y-4">
      {/* Header with health score + recompute */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn('text-4xl font-black', healthColor)}>
            {healthScore ?? '—'}
          </div>
          <div>
            <div className="text-sm font-semibold">Record Health Score</div>
            <div className="text-xs text-muted-foreground">
              {status?.computed_at
                ? `Last analyzed ${new Date(status.computed_at).toLocaleDateString()}`
                : 'Not yet analyzed'}
            </div>
          </div>
        </div>
        <button
          onClick={handleRecompute}
          disabled={recomputing}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3 w-3', recomputing && 'animate-spin')} />
          {recomputing ? 'Analyzing…' : 'Reanalyze'}
        </button>
      </div>

      {/* Time stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard
          label="Aircraft Total Time"
          value={status?.airframe_total_time != null ? `${status.airframe_total_time.toLocaleString()}h` : '—'}
        />
        <StatCard
          label="Engine SMOH"
          value={status?.engine_time_since_overhaul != null ? `${status.engine_time_since_overhaul.toLocaleString()}h` : '—'}
          sub={status?.engine_last_overhaul_date ? `Overhauled ${status.engine_last_overhaul_date}` : undefined}
        />
        <StatCard
          label="Prop SMOH"
          value={status?.prop_time_since_overhaul != null ? `${status.prop_time_since_overhaul.toLocaleString()}h` : '—'}
          sub={status?.prop_last_overhaul_date ? `Overhauled ${status.prop_last_overhaul_date}` : undefined}
        />
      </div>

      {/* AD summary */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="ADs Complied"
          value={String(status?.ads_complied ?? '—')}
          valueClass="text-green-600"
        />
        <StatCard
          label="ADs Open"
          value={String(status?.ads_open ?? '—')}
          valueClass={(status?.ads_open ?? 0) > 0 ? 'text-red-500' : undefined}
        />
        <StatCard
          label="ADs Unknown"
          value={String(status?.ads_unknown ?? '—')}
          valueClass={(status?.ads_unknown ?? 0) > 0 ? 'text-amber-500' : undefined}
        />
      </div>

      {/* Inspection currency table */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="bg-muted/50 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Inspection Currency
        </div>
        <div className="divide-y divide-border">
          {[
            {
              label: 'Annual Inspection',
              lastDate: status?.last_annual_date,
              nextDue: status?.annual_next_due_date,
              isCurrent: status?.annual_is_current ?? false,
            },
            {
              label: 'ELT Inspection',
              lastDate: status?.last_elt_inspection_date,
              nextDue: status?.elt_next_due_date,
              isCurrent: status?.elt_is_current ?? false,
            },
            {
              label: 'Transponder Test',
              lastDate: status?.last_transponder_test_date,
              nextDue: status?.transponder_next_due_date,
              isCurrent: status?.transponder_is_current ?? false,
            },
            {
              label: 'Pitot-Static Test',
              lastDate: status?.last_pitot_static_date,
              nextDue: status?.pitot_static_next_due_date,
              isCurrent: status?.pitot_static_is_current ?? false,
            },
            {
              label: 'Altimeter Calibration',
              lastDate: status?.last_altimeter_date,
              nextDue: status?.altimeter_next_due_date,
              isCurrent: status?.altimeter_is_current ?? false,
            },
            {
              label: 'VOR Check',
              lastDate: status?.last_vor_check_date,
              nextDue: status?.vor_check_next_due_date,
              isCurrent: status?.vor_check_is_current ?? false,
            },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-medium">{item.label}</div>
                <div className="text-xs text-muted-foreground">
                  {item.lastDate ? `Last: ${item.lastDate}` : 'No record found'}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusBadge isCurrent={item.isCurrent} noRecord={!item.lastDate} />
                <DueLabel nextDue={item.nextDue} isCurrent={item.isCurrent} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Required documents */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="bg-muted/50 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Required Documents
        </div>
        <div className="divide-y divide-border">
          {[
            { label: 'Registration', has: status?.has_registration },
            { label: 'Airworthiness Certificate', has: status?.has_airworthiness_cert },
            { label: 'Weight & Balance', has: status?.has_weight_balance },
            { label: 'Equipment List', has: status?.has_equipment_list },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-medium">{item.label}</span>
              {item.has ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                  <CheckCircle className="h-3 w-3" /> On file
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-500">
                  <AlertTriangle className="h-3 w-3" /> Not found
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string
  value: string
  sub?: string
  valueClass?: string
}) {
  return (
    <div className="bg-muted/40 border border-border rounded-xl p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={cn('text-lg font-bold', valueClass ?? 'text-foreground')}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  )
}
