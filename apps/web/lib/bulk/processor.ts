/**
 * Bulk update processor (cross-cutting concern 3).
 *
 * Applies a JSONB patch to N entity rows, in series, with per-entity-type
 * field whitelists so a regression in the API can't accidentally let
 * callers patch e.g. `organization_id` or `created_by`.
 *
 * Service-role client. Caller (the /api/bulk-updates POST handler)
 * ensures the user is mechanic+/owner/admin and that all entity_ids
 * belong to their org BEFORE handing off.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Closed allowlist of supported tables. */
export const BULK_ENTITY_TABLES = {
  work_orders: 'work_orders',
  inspections: 'inspections',
  compliance_items: 'compliance_items',
  continued_items: 'continued_items',
  cost_entries: 'cost_entries',
  inventory_parts: 'inventory_parts',
  approval_requests: 'approval_requests',
  purchase_orders: 'purchase_orders',
  tools: 'tools',
} as const
export type BulkEntityType = keyof typeof BULK_ENTITY_TABLES

/** Per-table allowlist of safe-to-patch columns. */
const FIELD_WHITELIST: Record<BulkEntityType, Set<string>> = {
  work_orders:       new Set(['status', 'assigned_mechanic_id', 'due_date', 'reminder_offsets', 'internal_notes']),
  inspections:       new Set(['status', 'assignee', 'due_date', 'reminder_offsets', 'notes']),
  compliance_items:  new Set(['status', 'notes', 'reminder_offsets']),
  continued_items:   new Set(['status', 'priority', 'due_date', 'reminder_offsets', 'notes']),
  cost_entries:      new Set(['approved', 'category', 'bucket', 'notes']),
  inventory_parts:   new Set(['min_on_hand', 'unit_cost', 'unit_price', 'is_archived']),
  approval_requests: new Set(['status', 'reminder_offsets']),
  purchase_orders:   new Set(['status', 'due_date', 'reminder_offsets', 'notes']),
  tools:             new Set(['status', 'notes', 'reminder_offsets']),
}

export interface BulkJob {
  id: string
  organization_id: string
  entity_type: BulkEntityType | string
  entity_ids: string[]
  patch: Record<string, unknown>
}

export async function processBulkJob(
  supabase: SupabaseClient,
  job: BulkJob,
): Promise<{ ok: boolean; results_count: number; error?: string }> {
  const table = BULK_ENTITY_TABLES[job.entity_type as BulkEntityType]
  if (!table) {
    await markFailed(supabase, job.id, `unsupported entity_type ${job.entity_type}`)
    return { ok: false, results_count: 0, error: 'unsupported entity_type' }
  }
  const allowed = FIELD_WHITELIST[job.entity_type as BulkEntityType]
  const sanitized: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(job.patch)) {
    if (allowed.has(k)) sanitized[k] = v
  }
  if (Object.keys(sanitized).length === 0) {
    await markFailed(supabase, job.id, 'no whitelisted fields in patch')
    return { ok: false, results_count: 0, error: 'no whitelisted fields' }
  }

  await supabase.from('bulk_update_jobs').update({ status: 'running' }).eq('id', job.id)

  let count = 0
  let lastErr: string | null = null
  // Single UPDATE on the whole id list — fast path for the common case
  // (no per-row policy diff needed; org scope is enforced via .eq).
  const { error, count: updated } = await supabase
    .from(table)
    .update({ ...sanitized, updated_at: new Date().toISOString() }, { count: 'exact' })
    .eq('organization_id', job.organization_id)
    .in('id', job.entity_ids)
  if (error) lastErr = error.message
  else count = updated ?? 0

  if (lastErr) {
    await markFailed(supabase, job.id, lastErr)
    return { ok: false, results_count: count, error: lastErr }
  }

  await supabase
    .from('bulk_update_jobs')
    .update({ status: 'completed', results_count: count, completed_at: new Date().toISOString() })
    .eq('id', job.id)
  return { ok: true, results_count: count }
}

async function markFailed(supabase: SupabaseClient, id: string, error: string) {
  await supabase
    .from('bulk_update_jobs')
    .update({ status: 'failed', error_message: error, completed_at: new Date().toISOString() })
    .eq('id', id)
}
