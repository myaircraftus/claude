'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  ExternalLink,
  Shield,
  ChevronRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn, formatDate } from '@/lib/utils'
import type { Aircraft } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type ComplianceStatus = 'compliant' | 'overdue' | 'non_compliant' | 'unknown'

interface FAADirective {
  id: string
  ad_number: string
  title: string
  aircraft_make?: string
  aircraft_model?: string
  effective_date?: string | null
  compliance_description?: string
  recurring: boolean
  recurring_interval_hours?: number | null
  source_url?: string | null
}

interface ADApplicability {
  id: string
  aircraft_id: string
  ad_id: string
  ad_number: string
  applicability_status: string
  compliance_status: ComplianceStatus
  last_compliance_date?: string | null
  next_due_date?: string | null
  evidence_notes?: string | null
  manually_overridden?: boolean
  last_synced_at?: string | null
  updated_at: string
  faa_airworthiness_directives?: FAADirective
}

interface ADSummary {
  total: number
  compliant: number
  overdue: number
  unknown: number
  non_compliant: number
}

interface ADsResponse {
  aircraft: Aircraft
  ads: ADApplicability[]
  summary: ADSummary
}

interface Props {
  aircraftId: string
  aircraft: Aircraft
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusConfig(status: ComplianceStatus) {
  switch (status) {
    case 'compliant':
      return {
        label: 'Compliant',
        badgeVariant: 'success' as const,
        icon: CheckCircle2,
        iconClass: 'text-emerald-500',
      }
    case 'overdue':
      return {
        label: 'Overdue',
        badgeVariant: 'danger' as const,
        icon: XCircle,
        iconClass: 'text-red-500',
      }
    case 'non_compliant':
      return {
        label: 'Non-Compliant',
        badgeVariant: 'danger' as const,
        icon: AlertTriangle,
        iconClass: 'text-red-500',
      }
    case 'unknown':
    default:
      return {
        label: 'Unknown',
        badgeVariant: 'warning' as const,
        icon: HelpCircle,
        iconClass: 'text-amber-500',
      }
  }
}

// ─── Summary stat pill ────────────────────────────────────────────────────────

function SummaryPill({
  count,
  label,
  colorClass,
}: {
  count: number
  label: string
  colorClass: string
}) {
  return (
    <div className={cn('flex flex-col items-center rounded-lg px-4 py-2.5 min-w-[72px]', colorClass)}>
      <span className="text-xl font-bold leading-none">{count}</span>
      <span className="text-xs font-medium mt-1 opacity-80">{label}</span>
    </div>
  )
}

// ─── AD row ───────────────────────────────────────────────────────────────────

function ADRow({
  entry,
  aircraftId,
  onMarkCompliant,
}: {
  entry: ADApplicability
  aircraftId: string
  onMarkCompliant: (id: string) => void
}) {
  const directive = entry.faa_airworthiness_directives
  const config = statusConfig(entry.compliance_status)
  const StatusIcon = config.icon

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors group">
      <div className="mt-0.5 flex-shrink-0">
        <StatusIcon className={cn('h-4 w-4', config.iconClass)} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {directive?.title ?? entry.ad_number}
            </p>
            <p className="text-xs font-mono text-muted-foreground mt-0.5">{entry.ad_number}</p>
          </div>
          <Badge variant={config.badgeVariant} className="flex-shrink-0 text-xs">
            {config.label}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
          {directive?.recurring && (
            <span className="text-xs text-muted-foreground">
              Recurring
              {directive.recurring_interval_hours != null
                ? ` · every ${directive.recurring_interval_hours} hrs`
                : ''}
            </span>
          )}
          {entry.last_compliance_date && (
            <span className="text-xs text-muted-foreground">
              Last: {formatDate(entry.last_compliance_date)}
            </span>
          )}
          {entry.next_due_date && (
            <span
              className={cn(
                'text-xs font-medium',
                entry.compliance_status === 'overdue' ? 'text-red-600' : 'text-amber-600'
              )}
            >
              Due: {formatDate(entry.next_due_date)}
            </span>
          )}
          {entry.evidence_notes && (
            <span className="text-xs text-muted-foreground italic truncate max-w-[200px]">
              {entry.evidence_notes}
            </span>
          )}
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {entry.compliance_status !== 'compliant' && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => onMarkCompliant(entry.id)}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Mark Compliant
            </Button>
          )}
          {directive?.source_url && (
            <a
              href={directive.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              FAA source
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main widget ──────────────────────────────────────────────────────────────

export function ADSummaryWidget({ aircraftId, aircraft }: Props) {
  const [data, setData] = useState<ADsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [markingId, setMarkingId] = useState<string | null>(null)

  const fetchADs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/ads`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Error ${res.status}`)
      }
      const json: ADsResponse = await res.json()
      setData(json)
    } catch (err: any) {
      setError(err.message ?? 'Failed to load ADs')
    } finally {
      setLoading(false)
    }
  }, [aircraftId])

  useEffect(() => {
    fetchADs()
  }, [fetchADs])

  const handleSync = async () => {
    setSyncing(true)
    setError(null)
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/ads`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Error ${res.status}`)
      }
      // Reload data after sync
      await fetchADs()
    } catch (err: any) {
      setError(err.message ?? 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const handleMarkCompliant = async (applicabilityId: string) => {
    setMarkingId(applicabilityId)
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/ads`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ad_applicability_id: applicabilityId,
          compliance_status: 'compliant',
          last_compliance_date: new Date().toISOString().split('T')[0],
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Error ${res.status}`)
      }
      // Optimistic update: refresh data
      await fetchADs()
    } catch (err: any) {
      setError(err.message ?? 'Failed to update compliance status')
    } finally {
      setMarkingId(null)
    }
  }

  const summary = data?.summary
  const ads = data?.ads ?? []

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4 text-amber-500" />
          Airworthiness Directives
          {summary && summary.total > 0 && (
            <Badge variant="secondary" className="text-xs py-0 px-1.5 h-4">
              {summary.total}
            </Badge>
          )}
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={syncing || loading}
          className="h-8"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
          {syncing ? 'Syncing…' : 'Sync ADs'}
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3 animate-pulse">
            <div className="flex gap-2">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-14 w-20 rounded-lg bg-muted" />
              ))}
            </div>
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-3 p-3">
                <div className="h-4 w-4 rounded-full bg-muted flex-shrink-0 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-muted rounded w-3/4" />
                  <div className="h-2.5 bg-muted rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary stats */}
        {!loading && summary && summary.total > 0 && (
          <div className="flex flex-wrap gap-2">
            <SummaryPill
              count={summary.total}
              label="Total"
              colorClass="bg-muted text-foreground"
            />
            <SummaryPill
              count={summary.compliant}
              label="Compliant"
              colorClass="bg-emerald-50 text-emerald-800"
            />
            {summary.overdue > 0 && (
              <SummaryPill
                count={summary.overdue}
                label="Overdue"
                colorClass="bg-red-50 text-red-800"
              />
            )}
            {summary.non_compliant > 0 && (
              <SummaryPill
                count={summary.non_compliant}
                label="Non-Compliant"
                colorClass="bg-red-50 text-red-800"
              />
            )}
            {summary.unknown > 0 && (
              <SummaryPill
                count={summary.unknown}
                label="Unknown"
                colorClass="bg-amber-50 text-amber-800"
              />
            )}
          </div>
        )}

        {/* Empty state */}
        {!loading && ads.length === 0 && (
          <div className="text-center py-8">
            <Shield className="h-9 w-9 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground mb-1">No ADs tracked yet</p>
            <p className="text-xs text-muted-foreground mb-4">
              Click &ldquo;Sync ADs&rdquo; to fetch applicable airworthiness directives for{' '}
              {aircraft.tail_number}.
            </p>
            <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1', syncing && 'animate-spin')} />
              {syncing ? 'Syncing…' : 'Fetch applicable ADs'}
            </Button>
          </div>
        )}

        {/* AD list */}
        {!loading && ads.length > 0 && (
          <div className="space-y-1">
            {/* Priority ordering: overdue/non_compliant first */}
            {[...ads]
              .sort((a, b) => {
                const order: Record<ComplianceStatus, number> = {
                  overdue: 0,
                  non_compliant: 1,
                  unknown: 2,
                  compliant: 3,
                }
                return (
                  (order[a.compliance_status] ?? 4) - (order[b.compliance_status] ?? 4)
                )
              })
              .map(entry => (
                <ADRow
                  key={entry.id}
                  entry={entry}
                  aircraftId={aircraftId}
                  onMarkCompliant={handleMarkCompliant}
                />
              ))}
          </div>
        )}

        {/* Footer link */}
        {!loading && ads.length > 0 && (
          <div className="pt-1 border-t border-border">
            <Link
              href={`/aircraft/${aircraftId}/ads`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              View full AD compliance log
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
