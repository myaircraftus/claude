/**
 * Signal emission helpers (Spec 0.3).
 *
 * `emitSignal()` writes to ai_signals. The orchestrator drains unprocessed
 * signals on its tick. Most callers will fire-and-forget — failures should
 * never block the user's primary action (creating a WO, uploading a doc,
 * etc.) so we swallow errors and log to console.
 *
 * For the rare case where signal-emission is part of a critical flow, use
 * `emitSignalStrict()` which throws on failure.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AISignalType, EmitSignalInput } from './types'

const VALID_SIGNAL_TYPES: ReadonlySet<AISignalType> = new Set([
  'meter-reading',
  'wo-closed',
  'doc-uploaded',
  'compliance-due',
  'low-stock',
  'tool-overdue',
  'approval-response',
  'anomaly',
  'test',
])

/**
 * Fire-and-forget signal emission. Returns the inserted row id (or null on
 * failure — does NOT throw). Use from anywhere in the API layer where
 * signal emission is a side effect of a primary action.
 *
 * Example:
 *   await emitSignal(supabase, orgId, userId, {
 *     type: 'meter-reading',
 *     payload: { aircraft_id, hobbs: 1234.5, source: 'manual' },
 *   })
 */
export async function emitSignal(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string | null,
  input: EmitSignalInput,
): Promise<string | null> {
  if (!VALID_SIGNAL_TYPES.has(input.type)) {
    console.warn(`[ai/signals] unknown signal type: ${input.type}`)
    return null
  }
  const { data, error } = await supabase
    .from('ai_signals')
    .insert({
      organization_id: organizationId,
      signal_type: input.type,
      payload: input.payload ?? {},
      emitted_by: userId,
      source: input.source ?? (userId ? 'user' : 'system'),
    })
    .select('id')
    .single()
  if (error) {
    console.error('[ai/signals] emit failed:', error.message)
    return null
  }
  return (data as { id: string }).id
}

/** Same as emitSignal() but throws on failure — for transactional flows. */
export async function emitSignalStrict(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string | null,
  input: EmitSignalInput,
): Promise<string> {
  if (!VALID_SIGNAL_TYPES.has(input.type)) {
    throw new Error(`Unknown signal type: ${input.type}`)
  }
  const { data, error } = await supabase
    .from('ai_signals')
    .insert({
      organization_id: organizationId,
      signal_type: input.type,
      payload: input.payload ?? {},
      emitted_by: userId,
      source: input.source ?? (userId ? 'user' : 'system'),
    })
    .select('id')
    .single()
  if (error) throw new Error(`Signal emit failed: ${error.message}`)
  return (data as { id: string }).id
}

/** Type guard so route handlers can validate request bodies cheaply. */
export function isValidSignalType(value: unknown): value is AISignalType {
  return typeof value === 'string' && VALID_SIGNAL_TYPES.has(value as AISignalType)
}
