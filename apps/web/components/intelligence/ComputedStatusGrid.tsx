'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCw, CheckCircle, XCircle, AlertTriangle, Clock } from 'lucide-react'
import type { AircraftComputedStatus } from '@/types/intelligence'

interface ComputedStatusGridProps {
  status: AircraftComputedStatus
  aircraftId: string
  onRecomputed?: (updated: AircraftComputedStatus) => void
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  return Math.floor((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function CurrencyBadge({ isCurrent, nextDue }: { isCurrent: boolean; nextDue: string | null }) {
  const days = daysUntil(nextDue)
  if (isCurrent && days !== null && days <= 60) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
        <AlertTriangle className="h-3 w-3" /> Due in {days}d
      </span>
    )
  }
  if (isCurrent) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
        <CheckCircle className="h-3 w-3" /> Current
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
      <XCircle className="h-3 w-3" /> Overdue
    </span>
  )
}

function StatusRow({
  label,
  lastDate,
  nextDue,
  isCurrent,
}: {
  label: string
  lastDate: string | null
  nextDue: string | null
  isCurrent: boolean
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-400">
          Last: {lastDate ?? '—'}{nextDue ? ` · Due: ${nextDue}` : ''}
        </p>
      </div>
      <CurrencyBadge isCurrent={isCurrent} nextDue={nextDue} />
    </div>
  )
}

export function ComputedStatusGrid({ status, aircraftId, onRecomputed }: ComputedStatusGridProps) {
  const [loading, setLoading] = useState(false)
  const [lastComputed, setLastComputed] = useState(status.computed_at)

  async function recompute() {
    setLoading(true)
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/compute-status`, { method: 'POST' })
      const data = await res.json()
      if (data.status) {
        setLastComputed(data.status.computed_at)
        onRecomputed?.(data.status)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Time summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Airframe Total</p>
          <p className="text-xl font-bold text-gray-900 mt-0.5">
            {status.airframe_total_time != null ? `${status.airframe_total_time.toLocaleString()}h` : '—'}
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Engine SMOH</p>
          <p className="text-xl font-bold text-gray-900 mt-0.5">
            {status.engine_time_since_overhaul != null ? `${status.engine_time_since_overhaul.toLocaleString()}h` : '—'}
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Prop SPOH</p>
          <p className="text-xl font-bold text-gray-900 mt-0.5">
            {status.prop_time_since_overhaul != null ? `${status.prop_time_since_overhaul.toLocaleString()}h` : '—'}
          </p>
        </div>
      </div>

      {/* Inspection currency */}
      <div className="border border-gray-200 rounded-lg px-4 py-1">
        <StatusRow
          label="Annual Inspection"
          lastDate={status.last_annual_date}
          nextDue={status.annual_next_due_date}
          isCurrent={status.annual_is_current}
        />
        <StatusRow
          label="ELT Inspection"
          lastDate={status.last_elt_inspection_date}
          nextDue={status.elt_next_due_date}
          isCurrent={status.elt_is_current}
        />
        <StatusRow
          label="Transponder Test"
          lastDate={status.last_transponder_test_date}
          nextDue={status.transponder_next_due_date}
          isCurrent={status.transponder_is_current}
        />
        <StatusRow
          label="Pitot-Static Test"
          lastDate={status.last_pitot_static_date}
          nextDue={status.pitot_static_next_due_date}
          isCurrent={status.pitot_static_is_current}
        />
        <StatusRow
          label="Altimeter Calibration"
          lastDate={status.last_altimeter_date}
          nextDue={status.altimeter_next_due_date}
          isCurrent={status.altimeter_is_current}
        />
      </div>

      {/* AD summary */}
      <div className="flex gap-3 text-sm">
        <div className="flex-1 bg-green-50 border border-green-200 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-green-700">{status.ads_complied}</p>
          <p className="text-xs text-green-600">ADs Complied</p>
        </div>
        <div className={`flex-1 border rounded-lg p-3 text-center ${status.ads_open > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
          <p className={`text-2xl font-bold ${status.ads_open > 0 ? 'text-red-700' : 'text-gray-400'}`}>{status.ads_open}</p>
          <p className={`text-xs ${status.ads_open > 0 ? 'text-red-600' : 'text-gray-400'}`}>Open ADs</p>
        </div>
        <div className="flex-1 bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-amber-700">{status.ads_unknown}</p>
          <p className="text-xs text-amber-600">Unknown</p>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Last analyzed: {new Date(lastComputed).toLocaleString()}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-gray-500"
          onClick={recompute}
          disabled={loading}
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Reanalyzing...' : 'Reanalyze'}
        </Button>
      </div>
    </div>
  )
}
