/**
 * Phase 17 Sprint 17.1 — Email queue worker.
 *
 * Polls email_log for status='queued' rows, marks them 'sending', sends
 * via Resend, then writes the final status (sent / failed). Works in
 * batches so the cron tick stays predictable.
 *
 * Concurrency model:
 * - Each tick claims a batch via SELECT … LIMIT N then UPDATE id=ANY($1)
 *   SET status='sending' WHERE status='queued' RETURNING *. The status
 *   guard means concurrent ticks (e.g. two cron pings) won't double-send
 *   because the second one's UPDATE will return zero rows for the
 *   already-claimed ids.
 * - We send sequentially inside the batch. Resend's 100/sec ceiling is
 *   far above the 50-row batch we run, so no rate gating is needed.
 * - On 5xx / network → leave the row at 'sending' with delivery_attempted_at
 *   set; a follow-up sweep promotes long-stuck rows back to 'queued'
 *   so the next tick re-tries. We surface this as a "retriable" failure.
 * - On 4xx (bad recipient, suppressed) → 'failed' immediately, with the
 *   provider error captured.
 *
 * Idempotency:
 * - provider_message_id, when present, indicates a successful send. The
 *   worker never re-sends a row that already has a provider_message_id.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from './resend-client'

export interface RunOptions {
  /** Max rows to attempt per tick. Default 50. */
  maxBatch?: number
  /** Override the send function for tests. */
  __sendImpl?: typeof sendEmail
  /** When true, includes detailed per-row outcomes in the return. */
  verbose?: boolean
}

export interface RunResult {
  attempted: number
  sent: number
  failed: number
  retriable: number
  details?: Array<{ id: string; status: 'sent' | 'failed' | 'retriable'; error?: string }>
}

/** Stale claim threshold — rows stuck in 'sending' longer than this get
 * promoted back to 'queued' so the next tick re-tries. */
const STALE_CLAIM_AGE_MS = 5 * 60 * 1000  // 5 minutes

/**
 * Run a single tick of the email queue.
 *
 * Returns counts only by default. Pass `verbose:true` to get per-row
 * outcome detail (used in tests).
 */
export async function run(supabase: SupabaseClient, options: RunOptions = {}): Promise<RunResult> {
  const maxBatch = Math.min(200, Math.max(1, options.maxBatch ?? 50))
  const sendImpl = options.__sendImpl ?? sendEmail

  // 1. Heal stale claims from prior ticks (status='sending' but stuck).
  await healStaleClaims(supabase)

  // 2. Pull a batch of queued rows.
  const { data: claimed, error: claimErr } = await supabase
    .from('email_log')
    .select('id, to_email, from_email, subject, body_text, body_html, kind, related_ticket_id')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(maxBatch)
  if (claimErr) throw new Error(`email_log claim failed: ${claimErr.message}`)
  const rows = (claimed ?? []) as Array<{
    id: string
    to_email: string
    from_email: string | null
    subject: string
    body_text: string
    body_html: string | null
    kind: string
    related_ticket_id: string | null
  }>
  if (rows.length === 0) {
    return { attempted: 0, sent: 0, failed: 0, retriable: 0, details: options.verbose ? [] : undefined }
  }

  // 3. Mark them 'sending' atomically (status='queued' guard prevents
  //    races with another worker tick).
  const ids = rows.map((r) => r.id)
  const { data: updated } = await supabase
    .from('email_log')
    .update({ status: 'sending', delivery_attempted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .in('id', ids)
    .eq('status', 'queued')
    .select('id')
  const liveIds = new Set(((updated ?? []) as Array<{ id: string }>).map((r) => r.id))

  // 4. Send sequentially, recording final status per row.
  let sent = 0
  let failed = 0
  let retriable = 0
  const details: Array<{ id: string; status: 'sent' | 'failed' | 'retriable'; error?: string }> = []

  for (const row of rows) {
    if (!liveIds.has(row.id)) continue  // someone else claimed it
    const result = await sendImpl({
      to: row.to_email,
      from: row.from_email ?? undefined,
      subject: row.subject,
      text: row.body_text,
      html: row.body_html ?? undefined,
      tags: [
        { name: 'kind', value: row.kind },
        ...(row.related_ticket_id ? [{ name: 'ticket_id', value: row.related_ticket_id }] : []),
      ],
    })

    if (result.ok) {
      sent++
      details.push({ id: row.id, status: 'sent' })
      await supabase.from('email_log').update({
        status: 'sent',
        provider_message_id: result.id,
        delivery_settled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error_message: null,
      }).eq('id', row.id)
      continue
    }

    // Retriable → leave at 'sending' so the heal sweep brings it back to 'queued' next tick.
    if (result.retriable) {
      retriable++
      details.push({ id: row.id, status: 'retriable', error: result.error })
      await supabase.from('email_log').update({
        error_message: result.error?.slice(0, 500) ?? 'transient send failure',
        updated_at: new Date().toISOString(),
      }).eq('id', row.id)
      continue
    }

    // Permanent failure (4xx).
    failed++
    details.push({ id: row.id, status: 'failed', error: result.error })
    await supabase.from('email_log').update({
      status: 'failed',
      delivery_settled_at: new Date().toISOString(),
      error_message: result.error?.slice(0, 500) ?? 'permanent send failure',
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)
  }

  return {
    attempted: rows.length,
    sent,
    failed,
    retriable,
    details: options.verbose ? details : undefined,
  }
}

/**
 * Push 'sending' rows older than STALE_CLAIM_AGE_MS back to 'queued'
 * so the next tick re-attempts them. This handles the case where a
 * worker crashed mid-send (leaving the row stuck) without losing the
 * email entirely.
 */
async function healStaleClaims(supabase: SupabaseClient): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_CLAIM_AGE_MS).toISOString()
  await supabase
    .from('email_log')
    .update({ status: 'queued', updated_at: new Date().toISOString() })
    .eq('status', 'sending')
    .lt('delivery_attempted_at', cutoff)
}

// Test exports.
export const __testing = { healStaleClaims, STALE_CLAIM_AGE_MS }
