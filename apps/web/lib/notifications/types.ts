/**
 * Notification types (Spec 0.4).
 *
 * Same shape across the four channels (in-app, email, push, SMS); the
 * channel adapter (lib/notifications/dispatch.ts) decides how to deliver.
 *
 * `category` is an open string so any module can add new categories without
 * a migration. The orchestrator (Spec 0.3) emits notifications using the
 * same category keys as ActionCard so preferences are aligned across the
 * two surfaces.
 */

export type NotificationChannel = 'in-app' | 'email' | 'push' | 'sms'

/**
 * Categories used by the dispatcher. Add new keys here as new sources of
 * notifications are wired up. The category is also the key into
 * notification_preferences.
 *
 * Categories that mirror ActionCard categories (Spec 0.3) deliberately
 * share the string so a user toggling "compliance email off" silences
 * both compliance ActionCards and compliance reminders.
 */
export type NotificationCategory =
  | 'compliance'      // mirrors ActionCard
  | 'expiration'      // mirrors ActionCard
  | 'maintenance'     // mirrors ActionCard
  | 'approval'        // mirrors ActionCard
  | 'anomaly'         // mirrors ActionCard
  | 'insight'         // mirrors ActionCard
  | 'reminder'        // ad-hoc reminders fired by reminder_schedules
  | 'system'          // platform-level (billing, integration health, etc.)

export type NotificationDeliveryStatus = 'pending' | 'sent' | 'failed' | 'skipped'

export interface Notification {
  id: string
  organization_id: string
  user_id: string
  channel: NotificationChannel
  category: string
  title: string
  body: string
  link: string | null
  source_card_id: string | null
  source_kind: string | null
  source_id: string | null
  read_at: string | null
  sent_at: string
  delivery_status: NotificationDeliveryStatus
  delivery_error: string | null
  created_at: string
}

export interface NotificationPreference {
  user_id: string
  organization_id: string
  category: string
  channel: NotificationChannel
  enabled: boolean
  updated_at: string
}

/**
 * `dispatch()` input shape — the caller provides the human-facing fields
 * plus optional source linkage; channel selection is resolved against the
 * recipient's preferences.
 */
export interface DispatchInput {
  organization_id: string
  /**
   * Recipient. If 'all-org-members', the dispatcher fans out to every
   * accepted member of the org.
   */
  user_id: string | 'all-org-members'
  category: NotificationCategory | string
  title: string
  body: string
  link?: string | null
  /** Override the resolved channels. Defaults to the user's preferences. */
  channels?: NotificationChannel[]
  source_card_id?: string | null
  source_kind?: string | null
  source_id?: string | null
}

/* ─── Reminder specs ───────────────────────────────────────────────────── */

/**
 * The Spec 0.4 ReminderSpec is the *intent* — "fire 30 days before X via
 * in-app + email". `parseOffset()` in lib/notifications/reminders.ts
 * converts the human-readable offset string ("30 days before") into the
 * negative integer used by reminder_schedules.offset_days.
 */
export interface ReminderSpec {
  /** "30 days before", "1 day after", "0 days" — see parseOffset(). */
  offset: string
  channels: NotificationChannel[]
}

export interface ReminderSchedule {
  id: string
  organization_id: string
  user_id: string | null
  entity_kind: string
  entity_id: string
  offset_days: number
  channels: NotificationChannel[]
  category: string
  title: string
  body: string
  link: string | null
  next_fire_at: string
  fired_at: string | null
  created_at: string
  updated_at: string
}

/** Request shape for scheduling a single reminder. */
export interface ScheduleReminderInput {
  organization_id: string
  /** NULL = fan out to every accepted member at fire time. */
  user_id?: string | null
  entity_kind: string
  entity_id: string
  /** ISO date or datetime — e.g. document expiration. */
  anchor: string
  /** ReminderSpec[] — one schedule row per spec. */
  specs: ReminderSpec[]
  category: NotificationCategory | string
  title: string
  body: string
  link?: string | null
}
