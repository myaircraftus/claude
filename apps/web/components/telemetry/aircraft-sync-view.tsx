'use client'

/**
 * AircraftSyncView (Spec 4.3) — telemetry queue for one aircraft.
 *
 *   • Manual sync button (admin/mechanic) → POST /api/integrations/adsb/sync
 *   • Pending flights table with badge + per-row Confirm / Override actions
 *   • Override opens an inline edit row letting the user type a real Hobbs
 *     delta. Confirming flips badge → "Confirmed".
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plane, RefreshCw, Loader2, AlertCircle, CheckCircle2, Edit3, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { badgeLabel, tierForConfidence } from '@/lib/telemetry/inference'
import type { FlightEvent, OrgRole, TelemetryConfidenceTier } from '@/types'

const TIER_TONE: Record<TelemetryConfidenceTier, string> = {
  verified:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  synced:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  estimated: 'bg-amber-50  text-amber-700  border-amber-200',
  logged:    'bg-slate-100 text-slate-700  border-slate-300',
}

const ADMIN_ROLES = new Set<OrgRole>(['owner', 'admin', 'mechanic'])

export function AircraftSyncView({
  aircraftId,
  tailNumber,
  userRole,
}: {
  aircraftId: string
  tailNumber: string
  userRole: OrgRole
}) {
  const [flights, setFlights] = useState<FlightEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [includeConfirmed, setIncludeConfirmed] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [overrideHobbs, setOverrideHobbs] = useState<string>('')
  const [overrideTach, setOverrideTach] = useState<string>('')
  const [submitting, setSubmitting] = useState<string | null>(null)

  const isAdmin = ADMIN_ROLES.has(userRole)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '30' })
      if (includeConfirmed) params.set('include_confirmed', '1')
      const res = await fetch(`/api/aircraft/${aircraftId}/flights?${params.toString()}`)
      if (!res.ok) return
      const data = await res.json()
      setFlights((data.flights ?? []) as FlightEvent[])
    } finally {
      setLoading(false)
    }
  }, [aircraftId, includeConfirmed])

  useEffect(() => { void reload() }, [reload])

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/integrations/adsb/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ aircraft_id: aircraftId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error ?? `Sync failed (${res.status})`)
        return
      }
      const r = data?.result
      const newCount = r?.flights_new ?? 0
      toast.success(
        newCount > 0
          ? `${newCount} new flight${newCount === 1 ? '' : 's'} detected`
          : 'No new flights since last sync'
      )
      await reload()
    } finally {
      setSyncing(false)
    }
  }

  function startEdit(f: FlightEvent) {
    setEditingId(f.id)
    setOverrideHobbs(f.inferred_hobbs_delta != null ? String(f.inferred_hobbs_delta) : '')
    setOverrideTach(f.inferred_tach_delta != null ? String(f.inferred_tach_delta) : '')
  }

  function cancelEdit() {
    setEditingId(null)
    setOverrideHobbs('')
    setOverrideTach('')
  }

  async function handleConfirm(f: FlightEvent, withOverride: boolean) {
    setSubmitting(f.id)
    try {
      const body: Record<string, unknown> = {}
      if (withOverride) {
        const h = parseFloat(overrideHobbs)
        const t = parseFloat(overrideTach)
        if (Number.isFinite(h)) body.hobbs_delta = h
        if (Number.isFinite(t)) body.tach_delta = t
      }
      const res = await fetch(`/api/flight-events/${f.id}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error ?? 'Confirm failed'); return }
      toast.success(data?.was_overridden ? 'Saved with your override' : 'Confirmed')
      cancelEdit()
      await reload()
    } finally {
      setSubmitting(null)
    }
  }

  const pending = useMemo(() => flights.filter((f) => !f.confirmed_at), [flights])
  const confirmed = useMemo(() => flights.filter((f) => !!f.confirmed_at), [flights])

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-border p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <Plane className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <div className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>
                ADSB Exchange · {tailNumber}
              </div>
              <div className="text-[12px] text-muted-foreground">
                Public-data fallback. Estimated Hobbs/Tach until you confirm.
              </div>
            </div>
          </div>
          {isAdmin && (
            <Button onClick={handleSync} disabled={syncing} variant="outline">
              {syncing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
              Sync now
            </Button>
          )}
        </div>
      </div>

      <FlightTable
        title="Pending"
        emptyHint="No new detected flights. The cron sweeps every 5 minutes."
        rows={pending}
        loading={loading}
        editingId={editingId}
        overrideHobbs={overrideHobbs}
        overrideTach={overrideTach}
        setOverrideHobbs={setOverrideHobbs}
        setOverrideTach={setOverrideTach}
        startEdit={startEdit}
        cancelEdit={cancelEdit}
        handleConfirm={handleConfirm}
        submitting={submitting}
      />

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-[12px] text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={includeConfirmed} onChange={(e) => setIncludeConfirmed(e.target.checked)} />
          Show confirmed flights
        </label>
      </div>

      {includeConfirmed && (
        <FlightTable
          title="Confirmed"
          emptyHint="No confirmed flights yet."
          rows={confirmed}
          loading={loading}
          readOnly
          editingId={null}
          overrideHobbs=""
          overrideTach=""
          setOverrideHobbs={() => {}}
          setOverrideTach={() => {}}
          startEdit={() => {}}
          cancelEdit={() => {}}
          handleConfirm={() => {}}
          submitting={null}
        />
      )}
    </div>
  )
}

function FlightTable({
  title, rows, emptyHint, loading, readOnly, editingId,
  overrideHobbs, overrideTach, setOverrideHobbs, setOverrideTach,
  startEdit, cancelEdit, handleConfirm, submitting,
}: {
  title: string
  rows: FlightEvent[]
  emptyHint: string
  loading: boolean
  readOnly?: boolean
  editingId: string | null
  overrideHobbs: string
  overrideTach: string
  setOverrideHobbs: (v: string) => void
  setOverrideTach: (v: string) => void
  startEdit: (f: FlightEvent) => void
  cancelEdit: () => void
  handleConfirm: (f: FlightEvent, withOverride: boolean) => void
  submitting: string | null
}) {
  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>{title}</span>
        <span className="text-[11px] text-muted-foreground">{rows.length}</span>
      </div>
      {loading ? (
        <div className="text-[12px] text-muted-foreground py-12 text-center">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-10 px-4">
          <AlertCircle className="h-4 w-4 text-muted-foreground mx-auto mb-2" />
          <p className="text-[12.5px] text-muted-foreground">{emptyHint}</p>
        </div>
      ) : (
        <table className="w-full text-[12.5px]">
          <thead className="bg-muted/30 border-b border-border">
            <tr>
              {['Started', 'Duration', 'Hobbs Δ', 'Tach Δ', 'Status'].map((h) => (
                <th key={h} className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>{h}</th>
              ))}
              {!readOnly && <th />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((f) => {
              const tier = f.confirmed_at ? 'verified' : tierForConfidence(f.confidence)
              const tone = TIER_TONE[tier]
              const editing = editingId === f.id
              const start = new Date(f.start_time)
              return (
                <tr key={f.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 tabular-nums">
                    <div className="text-foreground">{start.toLocaleString(undefined, { month: 'short', day: 'numeric' })}</div>
                    <div className="text-[10.5px] text-muted-foreground">{start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{f.airborne_hours.toFixed(1)} hr</td>
                  <td className="px-3 py-2 tabular-nums">
                    {editing ? (
                      <Input value={overrideHobbs} onChange={(e) => setOverrideHobbs(e.target.value)} className="h-7 w-20 text-[12px]" inputMode="decimal" />
                    ) : (f.inferred_hobbs_delta?.toFixed?.(1) ?? '—')}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {editing ? (
                      <Input value={overrideTach} onChange={(e) => setOverrideTach(e.target.value)} className="h-7 w-20 text-[12px]" inputMode="decimal" />
                    ) : (f.inferred_tach_delta?.toFixed?.(1) ?? '—')}
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn('inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border', tone)} style={{ fontWeight: 700 }}>
                      {badgeLabel({ source: f.source, confidence: f.confidence, confirmed: !!f.confirmed_at })}
                    </span>
                  </td>
                  {!readOnly && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {editing ? (
                        <div className="inline-flex gap-1">
                          <Button size="sm" onClick={() => handleConfirm(f, true)} disabled={submitting === f.id}>
                            {submitting === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                            Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={cancelEdit}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="inline-flex gap-1">
                          <Button size="sm" onClick={() => handleConfirm(f, false)} disabled={submitting === f.id}>
                            {submitting === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                            Confirm
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => startEdit(f)}>
                            <Edit3 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
