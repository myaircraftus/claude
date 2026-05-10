/**
 * Phase 17 Sprint 17.4 — Stripe webhook idempotency.
 *
 * One helper used by /api/webhooks/stripe to:
 *   1. Insert the incoming event into stripe_webhook_events with
 *      status='received' (PK on event.id makes this fail on retry).
 *   2. Run the caller's handler.
 *   3. Mark the row 'processed' on success or 'failed' (with the
 *      error message) on throw.
 *
 * The conflict-do-nothing semantic is implemented via the .insert
 * call: a duplicate event id returns an error which we detect; in
 * that case we return { duplicate: true } so the caller can skip the
 * handler and respond 200.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface StripeEventInfo {
  id: string
  type: string
  livemode?: boolean
  api_version?: string
  payload: unknown
}

export interface DedupResult {
  /** When true, the event was already processed — skip the handler. */
  duplicate: boolean
  /** ID of the row inserted (or already-present row). */
  event_id: string
}

/**
 * Insert the event atomically. If the PK collision happens (Stripe
 * delivered the same event twice), we report `duplicate: true` and
 * the caller skips the handler.
 */
export async function recordReceived(
  supabase: SupabaseClient,
  event: StripeEventInfo,
): Promise<DedupResult> {
  const { error } = await supabase.from('stripe_webhook_events').insert({
    id: event.id,
    type: event.type,
    livemode: event.livemode ?? false,
    api_version: event.api_version ?? null,
    payload: event.payload as object,
    status: 'received',
  })

  if (!error) return { duplicate: false, event_id: event.id }

  // Postgres unique-violation code. Supabase surfaces this as code 23505
  // or message containing "duplicate key value".
  const dup = error.code === '23505' ||
    /duplicate key/i.test(error.message ?? '')
  if (dup) return { duplicate: true, event_id: event.id }
  // Any other error → bubble up so the route returns 500 and Stripe retries.
  throw error
}

export async function markProcessed(
  supabase: SupabaseClient,
  event_id: string,
): Promise<void> {
  await supabase
    .from('stripe_webhook_events')
    .update({ status: 'processed', processed_at: new Date().toISOString(), error_message: null })
    .eq('id', event_id)
}

export async function markFailed(
  supabase: SupabaseClient,
  event_id: string,
  error_message: string,
): Promise<void> {
  await supabase
    .from('stripe_webhook_events')
    .update({
      status: 'failed',
      processed_at: new Date().toISOString(),
      error_message: error_message.slice(0, 1000),
    })
    .eq('id', event_id)
}
