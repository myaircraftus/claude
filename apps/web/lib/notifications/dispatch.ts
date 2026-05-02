/**
 * Notification dispatcher (Spec 0.4).
 *
 * `sendNotification()` is the single entry point. It:
 *   1. Resolves the recipient (single user OR every accepted member of the org)
 *   2. Looks up per-channel preferences (notification_preferences) for each
 *      recipient × category, defaulting to CHANNEL_DEFAULTS for missing rows
 *   3. Inserts one row in `notifications` per (recipient, channel)
 *   4. Calls the channel adapter for non-in-app channels
 *
 * Channel adapters:
 *   - in-app  → no-op (the notifications row IS the delivery)
 *   - email   → TODO SendGrid integration (Spec 0.4 explicitly TODO)
 *   - push    → TODO Web Push integration (Spec 0.4 explicitly TODO)
 *   - sms     → TODO Twilio integration (Pro tier per spec)
 *
 * Failures in non-in-app channels do NOT block the in-app row — the user
 * still sees the bell badge even if email is misconfigured.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  DispatchInput,
  Notification,
  NotificationChannel,
  NotificationDeliveryStatus,
} from './types'

/**
 * Default channel matrix per category. Adjust here once for the whole app.
 * Per-user preferences override these. The default is "in-app on, email off"
 * for most things — preferences flip email/push on opt-in.
 */
const CHANNEL_DEFAULTS: Record<string, Record<NotificationChannel, boolean>> = {
  compliance:  { 'in-app': true, email: true,  push: false, sms: false },
  expiration:  { 'in-app': true, email: true,  push: false, sms: false },
  maintenance: { 'in-app': true, email: false, push: false, sms: false },
  approval:    { 'in-app': true, email: true,  push: false, sms: false },
  anomaly:     { 'in-app': true, email: true,  push: false, sms: false },
  insight:     { 'in-app': true, email: false, push: false, sms: false },
  reminder:    { 'in-app': true, email: true,  push: false, sms: false },
  system:      { 'in-app': true, email: false, push: false, sms: false },
}

const FALLBACK_CHANNEL_DEFAULT: Record<NotificationChannel, boolean> = {
  'in-app': true, email: false, push: false, sms: false,
}

/* ─── Recipient + preference resolution ────────────────────────────────── */

async function resolveRecipients(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string | 'all-org-members',
): Promise<string[]> {
  if (userId !== 'all-org-members') return [userId]
  const { data, error } = await supabase
    .from('organization_memberships')
    .select('user_id')
    .eq('organization_id', organizationId)
    .not('accepted_at', 'is', null)
  if (error || !data) return []
  return Array.from(new Set(data.map((r: any) => r.user_id as string)))
}

async function resolveChannels(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
  category: string,
  override?: NotificationChannel[],
): Promise<NotificationChannel[]> {
  if (override && override.length) return override

  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('channel, enabled')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('category', category)

  const defaults = CHANNEL_DEFAULTS[category] ?? FALLBACK_CHANNEL_DEFAULT
  const merged: Record<NotificationChannel, boolean> = { ...defaults }
  for (const row of (prefs ?? []) as Array<{ channel: NotificationChannel; enabled: boolean }>) {
    merged[row.channel] = row.enabled
  }

  return (Object.keys(merged) as NotificationChannel[]).filter((ch) => merged[ch])
}

/* ─── Channel adapters (3 stubs + 1 real) ──────────────────────────────── */

interface AdapterResult {
  status: NotificationDeliveryStatus
  error?: string
}

async function deliverInApp(_n: Pick<Notification, 'id'>): Promise<AdapterResult> {
  // The DB row IS the delivery — no further work.
  return { status: 'sent' }
}

async function deliverEmail(_n: Pick<Notification, 'title' | 'body' | 'link'>): Promise<AdapterResult> {
  // TODO(0.4 → infra): SendGrid integration. Mark skipped (not failed) so the
  // in-app notification doesn't show "delivery failed" misleadingly.
  return {
    status: 'skipped',
    error: 'TODO: wire SendGrid in apps/web/lib/notifications/dispatch.ts deliverEmail()',
  }
}

async function deliverPush(_n: Pick<Notification, 'title' | 'body' | 'link'>): Promise<AdapterResult> {
  // TODO(0.4 → infra): Web Push (VAPID + service worker subscription).
  return {
    status: 'skipped',
    error: 'TODO: wire Web Push in apps/web/lib/notifications/dispatch.ts deliverPush()',
  }
}

async function deliverSms(_n: Pick<Notification, 'title' | 'body'>): Promise<AdapterResult> {
  // TODO(0.4 → infra, Pro tier): Twilio integration.
  return {
    status: 'skipped',
    error: 'TODO: wire Twilio in apps/web/lib/notifications/dispatch.ts deliverSms()',
  }
}

const ADAPTERS: Record<
  NotificationChannel,
  (n: Notification) => Promise<AdapterResult>
> = {
  'in-app': deliverInApp,
  email: deliverEmail,
  push: deliverPush,
  sms: deliverSms,
}

/* ─── Public API ──────────────────────────────────────────────────────── */

export interface DispatchResult {
  inserted: number
  delivered: number
  failed: number
  notification_ids: string[]
  errors: string[]
}

/**
 * Send a notification. Fan-out to multiple recipients and channels happens
 * here based on preferences; the caller doesn't have to think about it.
 *
 * Idempotency: callers should set source_card_id / source_kind+source_id
 * to identify the originating event. This route doesn't dedupe today —
 * if you fire the same notification twice, you get two rows. A future
 * sprint can add a `(user_id, source_card_id)` partial unique index.
 */
export async function sendNotification(
  supabase: SupabaseClient,
  input: DispatchInput,
): Promise<DispatchResult> {
  const result: DispatchResult = {
    inserted: 0, delivered: 0, failed: 0, notification_ids: [], errors: [],
  }

  const recipients = await resolveRecipients(supabase, input.organization_id, input.user_id)
  if (recipients.length === 0) {
    result.errors.push('No recipients resolved.')
    return result
  }

  for (const userId of recipients) {
    const channels = await resolveChannels(
      supabase,
      input.organization_id,
      userId,
      input.category,
      input.channels,
    )

    for (const channel of channels) {
      // 1. Insert the notification row first so even a failed adapter leaves
      //    a trace in the DB (delivery_status reflects the outcome).
      const { data: row, error: insErr } = await supabase
        .from('notifications')
        .insert({
          organization_id: input.organization_id,
          user_id: userId,
          channel,
          category: input.category,
          title: input.title,
          body: input.body,
          link: input.link ?? null,
          source_card_id: input.source_card_id ?? null,
          source_kind: input.source_kind ?? null,
          source_id: input.source_id ?? null,
          delivery_status: 'pending',
        })
        .select('*')
        .single()

      if (insErr || !row) {
        result.failed += 1
        result.errors.push(`insert ${channel} for ${userId}: ${insErr?.message ?? 'unknown'}`)
        continue
      }

      result.inserted += 1
      result.notification_ids.push((row as { id: string }).id)

      // 2. Dispatch to the adapter
      const adapter = ADAPTERS[channel]
      const outcome = await adapter(row as Notification)

      const { error: updErr } = await supabase
        .from('notifications')
        .update({
          delivery_status: outcome.status,
          delivery_error: outcome.error ?? null,
        })
        .eq('id', (row as { id: string }).id)
      if (updErr) {
        result.errors.push(`update status ${channel}: ${updErr.message}`)
      }

      if (outcome.status === 'sent') result.delivered += 1
      else if (outcome.status === 'failed') result.failed += 1
      // 'skipped' is neither delivered nor failed — TODO adapters.
    }
  }

  return result
}
