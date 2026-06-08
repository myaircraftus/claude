/**
 * ai_activity_log writer — the single place LLM calls record cost/observability.
 *
 * Lifted from the original lib/ai/anthropic.ts so the row shape and the
 * system-org sentinel behavior are byte-identical. Every wrapper in lib/ai/llm
 * funnels here when a caller passes a log scope, which (vs. the old world where
 * only the Anthropic path logged) closes the gap where direct-OpenAI calls were
 * invisible to cost tracking.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActivityLogScope, LlmActivityStatus } from './types'

/**
 * Sentinel UUID for the System organization (migration 118). Substituted for
 * null org context (public-form triage, alert sweeps, smoke jobs) so the
 * ai_activity_log FK is always satisfied (Phase 17 Sprint 17.6).
 */
export const SYSTEM_ORG_ID = '00000000-0000-0000-0000-000000000000'

export interface ActivityLogRow extends ActivityLogScope {
  model: string
  status: LlmActivityStatus
  input_tokens?: number
  output_tokens?: number
  cost_usd_cents?: number | null
  duration_ms?: number
  error_message?: string
}

export async function writeActivityLog(
  supabase: SupabaseClient,
  row: ActivityLogRow,
): Promise<void> {
  const { error } = await supabase.from('ai_activity_log').insert({
    organization_id: row.organization_id ?? SYSTEM_ORG_ID,
    user_id: row.user_id ?? null,
    scope: row.scope,
    entity_kind: row.entity_kind ?? null,
    entity_id: row.entity_id ?? null,
    model: row.model,
    status: row.status,
    input_tokens: row.input_tokens ?? null,
    output_tokens: row.output_tokens ?? null,
    cost_usd_cents: row.cost_usd_cents ?? null,
    duration_ms: row.duration_ms ?? null,
    error_message: row.error_message ?? null,
    context: row.context ?? {},
  })
  if (error) {
    // Logging failure must NEVER break the LLM call itself.
    console.error('[llm.log] ai_activity_log insert error:', error.message)
  }
}

/**
 * Idempotent cost-cap log: write a 'cap-exceeded' row and return without making
 * the LLM call. Used by the regenerate route when an approval has too many line
 * items to safely batch-explain.
 */
export async function logCapExceeded(
  supabase: SupabaseClient,
  log: ActivityLogScope & { reason: string; model: string },
): Promise<void> {
  await writeActivityLog(supabase, {
    ...log,
    status: 'cap-exceeded',
    error_message: log.reason,
  })
}
