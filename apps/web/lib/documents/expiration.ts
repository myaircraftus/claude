/**
 * Document expiration helpers (Spec 2.6.2).
 *
 * - recomputeExpirationStatus(doc, today): pure — green/amber/red.
 * - getExpiringDocuments: server-side query.
 * - enqueueReminderSchedules: cross-wire to sprint 0d (reminder_schedules).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Document, ExpirationPersona, ExpirationStatus, ReminderOffsetSpec } from '@/types'

/**
 * Pure function — returns the computed status given a doc and "today."
 * Status flips:
 *   - no expiration / no expiration_date → null (doesn't apply)
 *   - past expiration_date                → 'expired'
 *   - within first reminder window        → 'expiring-soon'
 *   - otherwise                           → 'current'
 */
export function recomputeExpirationStatus(
  doc: Pick<Document, 'has_expiration' | 'expiration_date' | 'reminder_offsets'>,
  today: Date = new Date(),
): ExpirationStatus | null {
  if (!doc.has_expiration || !doc.expiration_date) return null
  const exp = new Date(doc.expiration_date + 'T00:00:00')
  const todayMidnight = new Date(today)
  todayMidnight.setHours(0, 0, 0, 0)

  if (todayMidnight > exp) return 'expired'

  const earliest = earliestReminderOffsetDays(doc.reminder_offsets)
  if (earliest !== null) {
    const window = new Date(exp)
    // earliest is negative (e.g. -30 = 30 days before). Adding it shifts
    // the boundary back from the expiration date.
    window.setDate(window.getDate() + earliest)
    if (todayMidnight >= window) return 'expiring-soon'
  }
  return 'current'
}

/** Most-negative offset_days = earliest reminder. Returns null if none. */
function earliestReminderOffsetDays(
  offsets: ReminderOffsetSpec[] | undefined | null,
): number | null {
  if (!Array.isArray(offsets) || offsets.length === 0) return null
  let min: number | null = null
  for (const o of offsets) {
    if (typeof o?.offset_days !== 'number') continue
    if (min === null || o.offset_days < min) min = o.offset_days
  }
  return min
}

/**
 * Spec helper: getExpiringDocuments(persona, lookAheadDays).
 *
 * Returns docs with has_expiration=true and expiration_date within
 * (today, today + lookAhead]. Optionally filters by persona.
 */
export async function getExpiringDocuments(
  supabase: SupabaseClient,
  organizationId: string,
  options: { persona?: ExpirationPersona | null; lookAheadDays?: number; aircraftId?: string | null } = {},
): Promise<Document[]> {
  const today = new Date().toISOString().slice(0, 10)
  const horizon = new Date()
  horizon.setDate(horizon.getDate() + (options.lookAheadDays ?? 30))
  const toIso = horizon.toISOString().slice(0, 10)

  let q = supabase
    .from('documents')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('has_expiration', true)
    .gte('expiration_date', today)
    .lte('expiration_date', toIso)
    .order('expiration_date', { ascending: true })

  if (options.persona) q = q.eq('target_persona', options.persona)
  if (options.aircraftId) q = q.eq('aircraft_id', options.aircraftId)

  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Document[]
}

/**
 * Cross-wire to sprint 0d: enqueue one reminder_schedules row per
 * offset, with anchor=expiration_date and next_fire_at=anchor+offset.
 *
 * Idempotency: caller should DELETE existing rows for this entity
 * before re-enqueueing on update (handled in the API route).
 */
export async function enqueueReminderSchedules(
  supabase: SupabaseClient,
  args: {
    organizationId: string
    documentId: string
    title: string
    expirationDateIso: string                 // YYYY-MM-DD
    offsets: ReminderOffsetSpec[]
    link?: string | null
  },
): Promise<{ inserted: number }> {
  if (!Array.isArray(args.offsets) || args.offsets.length === 0) {
    return { inserted: 0 }
  }

  const rows = args.offsets
    .filter((o) => typeof o?.offset_days === 'number' && Number.isFinite(o.offset_days))
    .map((o) => {
      const fire = new Date(args.expirationDateIso + 'T09:00:00')
      fire.setDate(fire.getDate() + o.offset_days)
      return {
        organization_id: args.organizationId,
        // user_id NULL = fan out to every accepted org member at fire time.
        user_id: null,
        entity_kind: 'documents',
        entity_id: args.documentId,
        offset_days: o.offset_days,
        channels: Array.isArray(o.channels) && o.channels.length > 0 ? o.channels : ['in-app'],
        category: 'document-expiration',
        title: args.title,
        body: `${args.title} expires ${args.expirationDateIso} (${o.offset_days >= 0 ? `${o.offset_days} days after` : `${Math.abs(o.offset_days)} days before`}).`,
        link: args.link ?? null,
        next_fire_at: fire.toISOString(),
      }
    })

  if (rows.length === 0) return { inserted: 0 }

  const { error } = await supabase.from('reminder_schedules').insert(rows)
  if (error) throw error
  return { inserted: rows.length }
}
