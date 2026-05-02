/**
 * Reminder schedules (Spec 0.4).
 *
 * `scheduleReminders()` — given an anchor date + array of ReminderSpec (e.g.
 *   [{ offset: '30 days before', channels: ['in-app', 'email'] }, ...]),
 *   inserts one reminder_schedules row per spec with the precomputed
 *   next_fire_at.
 *
 * `tickReminders()` — drains rows where now >= next_fire_at AND fired_at IS
 *   NULL, fires sendNotification() for each, marks fired.
 *
 * `parseOffset()` accepts strings like "30 days before", "2 days after",
 *   "0 days", "0", or raw integers. The result is signed:
 *   negative = before the anchor, positive = after.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendNotification } from './dispatch'
import type {
  NotificationChannel,
  ReminderSchedule,
  ScheduleReminderInput,
} from './types'

/**
 * Parse a Spec 0.4 offset string into a signed integer day count.
 *   "30 days before" → -30
 *   "1 day after"    → 1
 *   "0 days"         → 0
 *   "-7"             → -7
 *
 * Throws on unparseable input — callers should validate at the API layer.
 */
export function parseOffset(input: string): number {
  const trimmed = String(input).trim().toLowerCase()
  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10)

  const m = trimmed.match(/^(\d+)\s*(?:day|days)\s*(before|after)?$/)
  if (!m) throw new Error(`Unparseable offset: "${input}"`)
  const n = parseInt(m[1], 10)
  if (!Number.isFinite(n)) throw new Error(`Unparseable offset: "${input}"`)
  const direction = m[2]
  if (direction === 'before') return -n
  return n // 'after' or unspecified — default forward
}

/**
 * Compute next_fire_at for an anchor date + offset (signed integer).
 * Anchor can be ISO date or datetime; offset_days is added directly.
 */
function computeFireAt(anchor: string, offsetDays: number): string {
  const anchorMs = new Date(anchor).getTime()
  if (!Number.isFinite(anchorMs)) {
    throw new Error(`Invalid anchor date: "${anchor}"`)
  }
  return new Date(anchorMs + offsetDays * 86_400_000).toISOString()
}

export interface ScheduleReminderResult {
  inserted: number
  schedule_ids: string[]
  errors: string[]
}

/**
 * Insert one reminder_schedules row per spec. Caller-friendly: pass the
 * anchor + array of ReminderSpec and we do the per-offset fanout.
 *
 * Idempotency: existing schedules for the same (entity_kind, entity_id,
 * offset_days) are NOT auto-replaced — callers can clear-and-recreate via
 * the API route if they want strict idempotency. We don't enforce a unique
 * index because the same entity can legitimately have multiple recipients
 * with different offsets in the future.
 */
export async function scheduleReminders(
  supabase: SupabaseClient,
  input: ScheduleReminderInput,
): Promise<ScheduleReminderResult> {
  const out: ScheduleReminderResult = { inserted: 0, schedule_ids: [], errors: [] }

  for (const spec of input.specs) {
    let offsetDays: number
    try {
      offsetDays = parseOffset(spec.offset)
    } catch (e: any) {
      out.errors.push(e?.message ?? String(e))
      continue
    }

    let nextFireAt: string
    try {
      nextFireAt = computeFireAt(input.anchor, offsetDays)
    } catch (e: any) {
      out.errors.push(e?.message ?? String(e))
      continue
    }

    const { data, error } = await supabase
      .from('reminder_schedules')
      .insert({
        organization_id: input.organization_id,
        user_id: input.user_id ?? null,
        entity_kind: input.entity_kind,
        entity_id: input.entity_id,
        offset_days: offsetDays,
        channels: spec.channels,
        category: input.category,
        title: input.title,
        body: input.body,
        link: input.link ?? null,
        next_fire_at: nextFireAt,
      })
      .select('id')
      .single()

    if (error) {
      out.errors.push(`insert offset ${offsetDays}: ${error.message}`)
      continue
    }
    out.inserted += 1
    out.schedule_ids.push((data as { id: string }).id)
  }

  return out
}

export interface TickRemindersResult {
  schedules_processed: number
  notifications_sent: number
  errors: string[]
}

/**
 * Run pending reminder schedules across an org (or globally if orgId is
 * null — service-role cron usage). Idempotent — schedules already fired
 * are skipped via the `fired_at IS NULL` filter.
 */
export async function tickReminders(
  supabase: SupabaseClient,
  organizationId: string | null,
  options: { limit?: number; now?: Date } = {},
): Promise<TickRemindersResult> {
  const limit = options.limit ?? 200
  const now = options.now ?? new Date()
  const result: TickRemindersResult = {
    schedules_processed: 0,
    notifications_sent: 0,
    errors: [],
  }

  let q = supabase
    .from('reminder_schedules')
    .select('*')
    .is('fired_at', null)
    .lte('next_fire_at', now.toISOString())
    .order('next_fire_at', { ascending: true })
    .limit(limit)

  if (organizationId) q = q.eq('organization_id', organizationId)

  const { data, error } = await q
  if (error) {
    result.errors.push(`fetch schedules: ${error.message}`)
    return result
  }
  if (!data || data.length === 0) return result

  for (const sched of data as ReminderSchedule[]) {
    try {
      const dispatch = await sendNotification(supabase, {
        organization_id: sched.organization_id,
        user_id: sched.user_id ?? 'all-org-members',
        category: sched.category,
        title: sched.title,
        body: sched.body,
        link: sched.link,
        channels: sched.channels as NotificationChannel[],
        source_kind: sched.entity_kind,
        source_id: sched.entity_id,
      })
      result.notifications_sent += dispatch.inserted
      result.errors.push(...dispatch.errors)
    } catch (e: any) {
      result.errors.push(`schedule ${sched.id}: ${e?.message ?? String(e)}`)
    }

    const { error: markErr } = await supabase
      .from('reminder_schedules')
      .update({ fired_at: now.toISOString() })
      .eq('id', sched.id)
    if (markErr) result.errors.push(`mark fired ${sched.id}: ${markErr.message}`)

    result.schedules_processed += 1
  }

  return result
}
