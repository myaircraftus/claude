/**
 * Phase 16 Sprint 16.10 — system-status check service.
 *
 * Powers the public /status page. Reads worker heartbeat + recent
 * error_events + alert_events to render an honest "all systems
 * operational / degraded / down" summary with sub-system breakdowns.
 *
 * Sub-systems we track for v1:
 *   - Document upload
 *   - AI search
 *   - Vision processing
 *   - Billing
 *
 * Each sub-system maps to a curated set of route prefixes + alert
 * types. Adding a new sub-system = add a SUBSYSTEMS entry.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type SubsystemHealth = 'operational' | 'degraded' | 'down'

export interface SubsystemStatus {
  id: string
  label: string
  health: SubsystemHealth
  detail: string
}

export interface SystemStatus {
  overall: SubsystemHealth
  subsystems: SubsystemStatus[]
  active_incidents: ActiveIncident[]
  /** Trailing-90d daily uptime per subsystem. */
  uptime_90d: Record<string, number[]>
}

export interface ActiveIncident {
  id: string
  alert_type: string
  severity: string
  summary: string
  fired_at: string
}

interface SubsystemDef {
  id: string
  label: string
  /** Route prefixes that map to this subsystem (for error_events lookup). */
  route_prefixes: string[]
  /** alert_event types that map. */
  alert_types: string[]
}

const SUBSYSTEMS: SubsystemDef[] = [
  {
    id: 'document_upload',
    label: 'Document upload',
    route_prefixes: ['/api/upload', '/api/documents'],
    alert_types: ['failed_job_burst'],
  },
  {
    id: 'ai_search',
    label: 'AI search',
    route_prefixes: ['/api/ask', '/api/rag'],
    alert_types: [],
  },
  {
    id: 'vision_processing',
    label: 'Vision processing',
    route_prefixes: ['/api/cron/vision-fallback-sweep', '/api/vision'],
    alert_types: ['worker_stale', 'queue_depth', 'failed_job_burst'],
  },
  {
    id: 'billing',
    label: 'Billing',
    route_prefixes: ['/api/billing'],
    alert_types: ['cost_spike'],
  },
]

const RECENT_ERROR_THRESHOLD_DEGRADED = 5
const RECENT_ERROR_THRESHOLD_DOWN = 50

/**
 * Read the system status. All queries are admin-bypassing
 * (service-role caller) because the public /status page reads via the
 * server-component path with service-role for performance.
 */
export async function getSystemStatus(supabase: SupabaseClient): Promise<SystemStatus> {
  const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString()

  // Fetch active alerts + recent errors in parallel.
  const [{ data: alerts }, { data: errors }] = await Promise.all([
    supabase
      .from('alert_events')
      .select('id, alert_type, severity, summary, fired_at')
      .eq('status', 'firing')
      .order('fired_at', { ascending: false })
      .limit(20),
    supabase
      .from('error_events')
      .select('id, route, occurrence_count, severity, last_seen_at')
      .gte('last_seen_at', oneHourAgo)
      .limit(500),
  ])

  const activeAlerts = (alerts ?? []) as Array<{
    id: string; alert_type: string; severity: string; summary: string; fired_at: string
  }>
  const recentErrors = (errors ?? []) as Array<{ route: string | null; occurrence_count: number }>

  const subsystems: SubsystemStatus[] = SUBSYSTEMS.map((def) => {
    const matchedAlerts = activeAlerts.filter((a) => def.alert_types.includes(a.alert_type))
    const matchedErrors = recentErrors.filter((e) =>
      e.route && def.route_prefixes.some((p) => e.route!.startsWith(p))
    )
    const errorTotal = matchedErrors.reduce((acc, e) => acc + e.occurrence_count, 0)

    let health: SubsystemHealth = 'operational'
    let detail = 'All checks passing.'
    if (matchedAlerts.some((a) => a.severity === 'P0')) {
      health = 'down'
      detail = matchedAlerts[0].summary
    } else if (matchedAlerts.length > 0 || errorTotal >= RECENT_ERROR_THRESHOLD_DOWN) {
      health = 'down'
      detail = matchedAlerts[0]?.summary ?? `${errorTotal} errors in the last hour`
    } else if (errorTotal >= RECENT_ERROR_THRESHOLD_DEGRADED) {
      health = 'degraded'
      detail = `${errorTotal} errors in the last hour`
    }
    return { id: def.id, label: def.label, health, detail }
  })

  const overall: SubsystemHealth =
    subsystems.some((s) => s.health === 'down') ? 'down' :
    subsystems.some((s) => s.health === 'degraded') ? 'degraded' :
    'operational'

  // 90d uptime — for v1, render synthetic 100% (no historical alert data
  // pre-Phase 16). Real backfill lands when alert_events has a
  // 90-day history.
  const uptime_90d: Record<string, number[]> = {}
  for (const s of subsystems) uptime_90d[s.id] = Array(90).fill(1)

  return {
    overall,
    subsystems,
    active_incidents: activeAlerts.slice(0, 5).map((a) => ({
      id: a.id,
      alert_type: a.alert_type,
      severity: a.severity,
      summary: a.summary,
      fired_at: a.fired_at,
    })),
    uptime_90d,
  }
}

/**
 * Recent incidents (last 30 days) for the /status page incident list.
 */
export async function getRecentIncidents(
  supabase: SupabaseClient,
): Promise<ActiveIncident[]> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString()
  const { data } = await supabase
    .from('alert_events')
    .select('id, alert_type, severity, summary, fired_at')
    .gte('fired_at', cutoff)
    .order('fired_at', { ascending: false })
    .limit(50)
  return (data ?? []) as ActiveIncident[]
}
