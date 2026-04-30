'use client'

/**
 * AD/SB Manager — per-aircraft Airworthiness Directive + Service Bulletin
 * compliance surface. Drops into the Aircraft → Maintenance tab.
 *
 * Reads /api/aircraft/[id]/ads which joins aircraft_ad_applicability with
 * faa_airworthiness_directives. Sync button hits POST on the same endpoint
 * to refresh from the FAA. Each AD card has:
 *   - status pill (compliant / overdue / unknown / not_applicable)
 *   - title + AD number + effective date
 *   - "Add to Work Order" → POSTs a checklist item (source='ad') onto the
 *     active work order so the mechanic sees the AD as a required step.
 *
 * Stats roll-up at the top: total / compliant / overdue / unknown counts.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Clock,
  Loader2,
  Plus,
  ExternalLink,
} from 'lucide-react'

interface ADRecord {
  id: string
  ad_number: string | null
  applicability_status: string | null
  compliance_status: 'compliant' | 'overdue' | 'unknown' | 'non_compliant' | string | null
  next_due_date: string | null
  next_due_tach: number | string | null
  last_compliance_date: string | null
  faa_airworthiness_directives?: {
    title: string | null
    aircraft_make: string | null
    aircraft_model: string | null
    effective_date: string | null
    recurring: boolean | null
    recurring_interval_hours: number | string | null
    recurring_interval_days: number | null
    superseded_by: string | null
    source_url: string | null
    compliance_description: string | null
  } | null
}

interface Summary {
  total: number
  compliant: number
  overdue: number
  unknown: number
  non_compliant: number
}

interface Props {
  aircraftId: string
  /**
   * The work order to push "Add to Work Order" actions onto. The Maintenance
   * tab passes the active WO id; if there isn't one, the button is disabled
   * with a tooltip prompting the user to open a work order first.
   */
  activeWorkOrderId: string | null
  onChecklistChanged?: () => void
}

function statusPillClass(status: string | null): string {
  const s = (status ?? 'unknown').toLowerCase()
  if (s === 'compliant') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (s === 'overdue') return 'bg-red-50 text-red-700 border-red-200'
  if (s === 'non_compliant') return 'bg-red-50 text-red-700 border-red-200'
  if (s === 'not_applicable') return 'bg-slate-50 text-slate-500 border-slate-200'
  return 'bg-amber-50 text-amber-700 border-amber-200'
}

function statusLabel(status: string | null): string {
  const s = (status ?? 'unknown').toLowerCase()
  if (s === 'non_compliant') return 'Non-compliant'
  if (s === 'not_applicable') return 'Not applicable'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function ADSBManagerPanel({ aircraftId, activeWorkOrderId, onChecklistChanged }: Props) {
  const [ads, setAds] = useState<ADRecord[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [filter, setFilter] = useState<'all' | 'overdue' | 'unknown' | 'compliant'>('all')
  const [addingToWo, setAddingToWo] = useState<string | null>(null)
  const [recentlyAdded, setRecentlyAdded] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/ads`)
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload?.error ?? `Failed to load ADs (${res.status})`)
      }
      const json = await res.json()
      setAds(Array.isArray(json.ads) ? json.ads : [])
      setSummary(json.summary ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ADs')
    } finally {
      setLoading(false)
    }
  }, [aircraftId])

  useEffect(() => { void load() }, [load])

  const sync = useCallback(async () => {
    setSyncing(true)
    setError(null)
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/ads`, { method: 'POST' })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload?.error ?? `Sync failed (${res.status})`)
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }, [aircraftId, load])

  const addToWorkOrder = useCallback(async (ad: ADRecord) => {
    if (!activeWorkOrderId) return
    setAddingToWo(ad.id)
    try {
      const title = ad.faa_airworthiness_directives?.title ?? `AD ${ad.ad_number ?? ''}`
      const description = ad.faa_airworthiness_directives?.compliance_description ?? null
      const res = await fetch(`/api/work-orders/${activeWorkOrderId}/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_label: `${ad.ad_number ?? 'AD'} — ${title}`,
          item_description: description,
          source: 'ad',
          source_reference: ad.ad_number,
          section: 'AD/SB Compliance',
          required: true,
        }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload?.error ?? `Failed to add to work order`)
      }
      setRecentlyAdded((prev) => new Set(prev).add(ad.id))
      onChecklistChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add to work order')
    } finally {
      setAddingToWo(null)
    }
  }, [activeWorkOrderId, onChecklistChanged])

  const filtered = ads.filter((ad) => {
    if (filter === 'all') return true
    const s = (ad.compliance_status ?? 'unknown').toLowerCase()
    if (filter === 'overdue') return s === 'overdue' || s === 'non_compliant'
    if (filter === 'unknown') return s === 'unknown'
    if (filter === 'compliant') return s === 'compliant'
    return true
  })

  return (
    <div className="space-y-4">
      {/* Header + summary */}
      <div className="bg-white rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <h3 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
              AD / SB Manager
            </h3>
            <span className="text-[11px] text-muted-foreground">
              {summary ? `${summary.total} directive${summary.total === 1 ? '' : 's'}` : '—'}
            </span>
          </div>
          <button
            type="button"
            onClick={sync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-[12px] hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            style={{ fontWeight: 500 }}
          >
            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {syncing ? 'Syncing FAA…' : 'Sync from FAA'}
          </button>
        </div>

        {/* Stats grid */}
        {summary && (
          <div className="grid grid-cols-4 gap-2">
            <StatCard label="Compliant" value={summary.compliant} color="emerald" icon={CheckCircle2} />
            <StatCard label="Overdue" value={summary.overdue + summary.non_compliant} color="red" icon={AlertTriangle} />
            <StatCard label="Unknown" value={summary.unknown} color="amber" icon={Clock} />
            <StatCard label="Total" value={summary.total} color="slate" icon={ShieldCheck} />
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {([
            ['all', 'All', summary?.total ?? 0],
            ['overdue', 'Overdue', (summary?.overdue ?? 0) + (summary?.non_compliant ?? 0)],
            ['unknown', 'Unknown', summary?.unknown ?? 0],
            ['compliant', 'Compliant', summary?.compliant ?? 0],
          ] as const).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`text-[11px] px-2.5 py-1 rounded-full transition-colors ${
                filter === key
                  ? 'bg-primary text-white'
                  : 'bg-muted text-foreground hover:bg-muted/80'
              }`}
              style={{ fontWeight: 500 }}
            >
              {label} {count > 0 ? `(${count})` : ''}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[12px] text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* AD list */}
      <div className="space-y-2">
        {loading && ads.length === 0 && (
          <div className="text-[12px] text-muted-foreground italic px-3 py-3">Loading ADs…</div>
        )}
        {!loading && ads.length === 0 && (
          <div className="bg-white rounded-xl border border-dashed border-border px-4 py-6 text-center space-y-2">
            <ShieldCheck className="w-6 h-6 mx-auto text-muted-foreground/40" />
            <div className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>
              No ADs synced for this aircraft yet
            </div>
            <div className="text-[11px] text-muted-foreground">
              Tap "Sync from FAA" above to pull the current AD list for your make / model.
            </div>
          </div>
        )}
        {!loading && ads.length > 0 && filtered.length === 0 && (
          <div className="text-[12px] text-muted-foreground italic px-3 py-3">
            No directives match this filter.
          </div>
        )}
        {filtered.map((ad) => {
          const adInfo = ad.faa_airworthiness_directives
          const justAdded = recentlyAdded.has(ad.id)
          const addBusy = addingToWo === ad.id
          const woTooltip = activeWorkOrderId
            ? `Add as required step on the active work order`
            : `Open a work order first to add this AD as a step`
          return (
            <div key={ad.id} className="bg-white rounded-xl border border-border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="text-[12px] text-foreground font-mono" style={{ fontWeight: 600 }}>
                    {ad.ad_number ?? '(no number)'}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusPillClass(ad.compliance_status)}`} style={{ fontWeight: 600 }}>
                    {statusLabel(ad.compliance_status)}
                  </span>
                  {adInfo?.recurring && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200" style={{ fontWeight: 600 }}>
                      Recurring
                    </span>
                  )}
                  {adInfo?.superseded_by && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200">
                      superseded by {adInfo.superseded_by}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {adInfo?.source_url && (
                    <a
                      href={adInfo.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="View on FAA.gov"
                      className="p-1 rounded hover:bg-muted text-muted-foreground"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => void addToWorkOrder(ad)}
                    disabled={!activeWorkOrderId || addBusy || justAdded}
                    title={woTooltip}
                    className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-colors ${
                      justAdded
                        ? 'bg-emerald-100 text-emerald-700 cursor-default'
                        : activeWorkOrderId
                        ? 'bg-primary/10 text-primary hover:bg-primary/20'
                        : 'bg-muted text-muted-foreground cursor-not-allowed'
                    }`}
                    style={{ fontWeight: 500 }}
                  >
                    {addBusy ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : justAdded ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <Plus className="w-3 h-3" />
                    )}
                    {justAdded ? 'Added' : 'Add to WO'}
                  </button>
                </div>
              </div>

              {adInfo?.title && (
                <p className="text-[12px] text-foreground/90">{adInfo.title}</p>
              )}

              <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                {adInfo?.effective_date && (
                  <span>Effective {new Date(adInfo.effective_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                )}
                {ad.next_due_date && (
                  <span className="text-amber-700" style={{ fontWeight: 500 }}>
                    Next due {new Date(ad.next_due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                )}
                {ad.next_due_tach && <span>at tach {ad.next_due_tach}</span>}
                {ad.last_compliance_date && (
                  <span>Last complied {new Date(ad.last_compliance_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                )}
                {adInfo?.recurring_interval_hours && (
                  <span>Every {adInfo.recurring_interval_hours}h</span>
                )}
                {adInfo?.recurring_interval_days && (
                  <span>Every {adInfo.recurring_interval_days}d</span>
                )}
              </div>

              {adInfo?.compliance_description && (
                <p className="text-[11px] text-muted-foreground line-clamp-2 italic">
                  {adInfo.compliance_description}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string
  value: number
  color: 'emerald' | 'red' | 'amber' | 'slate'
  icon: any
}) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
  }
  return (
    <div className={`rounded-lg border ${colorMap[color]} p-2 flex items-start gap-2`}>
      <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[18px] tabular-nums" style={{ fontWeight: 700 }}>
          {value}
        </div>
        <div className="text-[10px] uppercase tracking-wide opacity-75" style={{ fontWeight: 600 }}>
          {label}
        </div>
      </div>
    </div>
  )
}
