/**
 * Universal reminder scheduler (cross-cutting concern 1).
 *
 * Given an entity's (entity_kind, entity_id, anchor_date, reminder_offsets[],
 * organization_id, title, link), upserts reminder_schedules rows so the
 * 0d notification cron fires at the right times.
 *
 * Idempotent — every call deletes the existing rows for the entity and
 * re-inserts. Cheaper than diffing offsets, and the table is small. Caller
 * (route handler) invokes after every CREATE/UPDATE that changes any of:
 *   - start_date
 *   - due_date
 *   - reminder_offsets
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ReminderOffset {
  /** Days from anchor. Negative = before, positive = after. */
  offset_days: number
  /** Override default channels for this offset. */
  channels?: string[]
}

export interface ReminderSyncArgs {
  organization_id: string
  entity_kind: string
  entity_id: string
  /** ISO date OR datetime. due_date is the conventional anchor. */
  anchor: string | null | undefined
  reminder_offsets: ReminderOffset[]
  category: string
  title: string
  body: string
  link?: string | null
  user_id?: string | null
  default_channels?: string[]
}

export async function syncReminders(supabase: SupabaseClient, args: ReminderSyncArgs): Promise<{ written: number; cleared: number }> {
  // Delete old rows that haven't fired yet — idempotent re-run.
  const { count: cleared } = await supabase
    .from('reminder_schedules')
    .delete({ count: 'exact' })
    .eq('organization_id', args.organization_id)
    .eq('entity_kind', args.entity_kind)
    .eq('entity_id', args.entity_id)
    .is('fired_at', null)

  if (!args.anchor || !args.reminder_offsets || args.reminder_offsets.length === 0) {
    return { written: 0, cleared: cleared ?? 0 }
  }

  const anchorMs = Date.parse(args.anchor)
  if (!Number.isFinite(anchorMs)) return { written: 0, cleared: cleared ?? 0 }

  const rows = args.reminder_offsets
    .filter((o) => Number.isFinite(o.offset_days))
    .map((o) => {
      const fireMs = anchorMs + o.offset_days * 24 * 60 * 60 * 1000
      return {
        organization_id: args.organization_id,
        user_id: args.user_id ?? null,
        entity_kind: args.entity_kind,
        entity_id: args.entity_id,
        offset_days: o.offset_days,
        channels: o.channels && o.channels.length > 0 ? o.channels : (args.default_channels ?? ['in-app']),
        category: args.category,
        title: args.title,
        body: args.body,
        link: args.link ?? null,
        next_fire_at: new Date(fireMs).toISOString(),
        fired_at: null,
      }
    })

  if (rows.length === 0) return { written: 0, cleared: cleared ?? 0 }

  const { error } = await supabase.from('reminder_schedules').insert(rows)
  if (error) {
    console.warn('[reminders] insert failed:', error.message)
    return { written: 0, cleared: cleared ?? 0 }
  }
  return { written: rows.length, cleared: cleared ?? 0 }
}
