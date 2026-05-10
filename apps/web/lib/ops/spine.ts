/**
 * Phase 16 — Ops Command Center spine (lib/ops/spine.ts)
 *
 * Single entry point for the unified ops_inbox. Five tables fan into one
 * view (see migration 109_ops_spine.sql); this file is the typed,
 * filter-aware service layer used by the admin command center, AI ops
 * assistant, and the Generate-Claude-Code-Prompt feature.
 *
 * RLS at the Postgres level enforces visibility — admin sees everything,
 * org members see their own. This module trusts the supabase client it's
 * given. Callers pass the regular request-scoped client (cookie-bound) for
 * RLS-correct queries, OR the service-role client for admin-bypass reads.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type OpsSeverity = 'P0' | 'P1' | 'P2' | 'P3'

export type OpsSourceType =
  | 'support_ticket'
  | 'error_event'
  | 'alert_event'
  | 'feedback_item'
  | 'churn_signal'

export interface OpsInboxRow {
  id: string
  source_type: OpsSourceType
  source_id: string
  organization_id: string | null
  severity: OpsSeverity
  status: string
  summary: string
  created_at: string
  updated_at: string
  resolved_at: string | null
  metadata: Record<string, unknown>
}

export interface OpsInboxFilters {
  severity?: OpsSeverity | OpsSeverity[]
  status?: string | string[]
  source_type?: OpsSourceType | OpsSourceType[]
  organization_id?: string
  /** ISO date string lower bound (inclusive). */
  since?: string
  /** ISO date string upper bound (inclusive). */
  until?: string
  /** Default true: hide rows where resolved_at IS NOT NULL. */
  open_only?: boolean
}

export interface OpsInboxPage {
  rows: OpsInboxRow[]
  total: number
  page: number
  page_size: number
}

const DEFAULT_PAGE_SIZE = 50

/**
 * Severity ordering: P0 = highest, P3 = lowest.
 * Used for sort_by_priority — we want P0 on top.
 */
const SEVERITY_RANK: Record<OpsSeverity, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
}

function asArray<T>(v: T | T[] | undefined): T[] | undefined {
  if (v === undefined) return undefined
  return Array.isArray(v) ? v : [v]
}

/**
 * List items from ops_inbox with filters + pagination.
 *
 * The view is a UNION ALL across five tables — Postgres pushes the WHERE
 * predicates into each branch, so filtered queries stay O(matched rows).
 * We always sort by severity then created_at DESC (most urgent + newest
 * first) unless overridden.
 */
export async function listOpsInbox(
  supabase: SupabaseClient,
  filters: OpsInboxFilters = {},
  options: { page?: number; page_size?: number } = {}
): Promise<OpsInboxPage> {
  const page = Math.max(1, options.page ?? 1)
  const page_size = Math.min(200, Math.max(1, options.page_size ?? DEFAULT_PAGE_SIZE))
  const from = (page - 1) * page_size
  const to = from + page_size - 1

  let query = supabase.from('ops_inbox').select('*', { count: 'exact' })

  const sev = asArray(filters.severity)
  if (sev?.length) query = query.in('severity', sev)

  const status = asArray(filters.status)
  if (status?.length) query = query.in('status', status)

  const src = asArray(filters.source_type)
  if (src?.length) query = query.in('source_type', src)

  if (filters.organization_id) query = query.eq('organization_id', filters.organization_id)

  if (filters.since) query = query.gte('created_at', filters.since)
  if (filters.until) query = query.lte('created_at', filters.until)

  if (filters.open_only !== false) query = query.is('resolved_at', null)

  // Sort: severity (text) ascending puts P0 first; then created_at DESC.
  query = query.order('severity', { ascending: true }).order('created_at', { ascending: false })
  query = query.range(from, to)

  const { data, error, count } = await query
  if (error) throw new Error(`listOpsInbox: ${error.message}`)

  return {
    rows: (data ?? []) as OpsInboxRow[],
    total: count ?? 0,
    page,
    page_size,
  }
}

/**
 * Hydrate a single ops item with its full source-table row.
 *
 * Returns the merged shape: `{ inbox_row, source_row }`. Callers that need
 * type-specific columns (ticket thread, error stack, alert metadata) read
 * `source_row` directly.
 */
export async function getOpsItem(
  supabase: SupabaseClient,
  source_type: OpsSourceType,
  id: string
): Promise<{ inbox_row: OpsInboxRow; source_row: Record<string, unknown> } | null> {
  const { data: inboxData, error: inboxErr } = await supabase
    .from('ops_inbox')
    .select('*')
    .eq('source_type', source_type)
    .eq('source_id', id)
    .maybeSingle()

  if (inboxErr) throw new Error(`getOpsItem inbox: ${inboxErr.message}`)
  if (!inboxData) return null

  const tableName = sourceTableName(source_type)
  const { data: srcData, error: srcErr } = await supabase
    .from(tableName)
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (srcErr) throw new Error(`getOpsItem source(${tableName}): ${srcErr.message}`)
  if (!srcData) return null

  return {
    inbox_row: inboxData as OpsInboxRow,
    source_row: srcData as Record<string, unknown>,
  }
}

function sourceTableName(source_type: OpsSourceType): string {
  switch (source_type) {
    case 'support_ticket': return 'support_tickets'
    case 'error_event':    return 'error_events'
    case 'alert_event':    return 'alert_events'
    case 'feedback_item':  return 'feedback_items'
    case 'churn_signal':   return 'churn_signals'
  }
}

export interface OpsCountByGroup {
  group_value: string
  count: number
}

/**
 * Counts grouped by one of {severity, status, source_type, organization_id}
 * for dashboard widgets.
 *
 * Uses a single ops_inbox SELECT and aggregates client-side; with hundreds
 * of rows this is fine. If we ever exceed ~10k open items we should add a
 * SQL function and call rpc(), but premature for v1.
 */
export async function countByGroup(
  supabase: SupabaseClient,
  group_by: 'severity' | 'status' | 'source_type' | 'organization_id',
  filters: OpsInboxFilters = {}
): Promise<OpsCountByGroup[]> {
  let query = supabase.from('ops_inbox').select(group_by)

  const sev = asArray(filters.severity)
  if (sev?.length) query = query.in('severity', sev)
  const status = asArray(filters.status)
  if (status?.length) query = query.in('status', status)
  const src = asArray(filters.source_type)
  if (src?.length) query = query.in('source_type', src)
  if (filters.organization_id) query = query.eq('organization_id', filters.organization_id)
  if (filters.since) query = query.gte('created_at', filters.since)
  if (filters.until) query = query.lte('created_at', filters.until)
  if (filters.open_only !== false) query = query.is('resolved_at', null)

  const { data, error } = await query
  if (error) throw new Error(`countByGroup: ${error.message}`)

  const counts = new Map<string, number>()
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const v = row[group_by]
    const key = v === null || v === undefined ? '(null)' : String(v)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([group_value, count]) => ({ group_value, count }))
    .sort((a, b) => b.count - a.count)
}

/**
 * Compare two severities. Returns negative if `a` is more urgent than `b`,
 * positive if `b` is more urgent, 0 if equal. Convenience for client sort.
 */
export function compareSeverity(a: OpsSeverity, b: OpsSeverity): number {
  return SEVERITY_RANK[a] - SEVERITY_RANK[b]
}

/**
 * SLA windows for each severity (in milliseconds from created_at to
 * required first admin response). Locked from the Phase 16 brief.
 *
 *   P0 → instant       (0 ms — fire notification immediately)
 *   P1 → 15 minutes
 *   P2 → 1 hour
 *   P3 → daily digest  (24 hours)
 */
export const SLA_WINDOW_MS: Record<OpsSeverity, number> = {
  P0: 0,
  P1: 15 * 60 * 1000,
  P2: 60 * 60 * 1000,
  P3: 24 * 60 * 60 * 1000,
}

/**
 * True if the given row has breached its SLA window for first admin
 * response. Used by the command-center "needs you now" rail to highlight
 * overdue items.
 */
export function hasBreachedSla(row: OpsInboxRow, now: Date = new Date()): boolean {
  if (row.resolved_at) return false
  const created = new Date(row.created_at).getTime()
  const elapsed = now.getTime() - created
  return elapsed > SLA_WINDOW_MS[row.severity]
}
