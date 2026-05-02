-- Migration 062: Notification system (Spec 0.4)
--
-- Three tables:
--   notifications           — every notification fired (in-app, email, push, SMS)
--   notification_preferences — per-user × per-category × per-channel toggles
--   reminder_schedules       — offset-based reminders ("30 days before doc expires")
--
-- Path B: existing `reminders` table (013_reminders.sql) is aviation-specific
-- (annual / 100hr / AD / etc. with priority and snooze). We do NOT touch it.
-- This migration adds a generic Notification + Reminder layer per Spec 0.4
-- — they coexist. A future sprint can have the aviation reminders enqueue
-- generic reminder_schedules to actually deliver via this pipeline.

-- ─── 1. notifications ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- The recipient. Always a real user — broadcast notifications fan out
  -- into one row per recipient at dispatch time.
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL
    CHECK (channel IN ('in-app', 'email', 'push', 'sms')),
  -- Open enum — must match an ActionCard category or one of the ad-hoc
  -- categories the dispatcher accepts (e.g. 'reminder', 'system'). The
  -- application layer enforces.
  category        TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  link            TEXT,                                -- in-app deep link
  -- Origin tracking. NULL when the notification is ad-hoc / system-generated.
  source_card_id  UUID REFERENCES ai_action_cards(id) ON DELETE SET NULL,
  source_kind     TEXT,
  source_id       TEXT,
  read_at         TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Delivery state for non-in-app channels (email/push/SMS).
  delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sent', 'failed', 'skipped')),
  delivery_error  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, organization_id, sent_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_recent
  ON notifications(user_id, organization_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_card
  ON notifications(source_card_id)
  WHERE source_card_id IS NOT NULL;

-- ─── 2. notification_preferences ─────────────────────────────────────────────
--
-- Per-user × per-org × per-category × per-channel boolean. When a row is
-- absent, the dispatch layer uses the channel default (see lib/notifications/
-- dispatch.ts CHANNEL_DEFAULTS).

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category        TEXT NOT NULL,
  channel         TEXT NOT NULL
    CHECK (channel IN ('in-app', 'email', 'push', 'sms')),
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, organization_id, category, channel)
);

-- ─── 3. reminder_schedules ───────────────────────────────────────────────────
--
-- "Fire a notification N days before/after some date for some entity."
-- One row = one offset. A document expiring on D with reminders at -30/-14/-7
-- becomes 3 rows.

CREATE TABLE IF NOT EXISTS reminder_schedules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Recipient. NULL = fan out to every accepted org member at fire time.
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Generic entity reference. entity_kind is the table name (e.g. 'documents'
  -- or 'aircraft'); entity_id is its row UUID. Kept loose so any module can
  -- enqueue without a schema change.
  entity_kind     TEXT NOT NULL,
  entity_id       UUID NOT NULL,
  -- Negative = before the anchor date (e.g. -30 = 30 days before expiration).
  -- Positive = after.
  offset_days     INTEGER NOT NULL,
  channels        TEXT[] NOT NULL DEFAULT ARRAY['in-app'],
  category        TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  link            TEXT,
  -- The pre-computed fire time (anchor + offset_days). We use a column rather
  -- than recompute on every tick so the reminders/tick query is just
  -- "next_fire_at <= NOW() AND fired_at IS NULL".
  next_fire_at    TIMESTAMPTZ NOT NULL,
  fired_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminder_schedules_due
  ON reminder_schedules(next_fire_at)
  WHERE fired_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_reminder_schedules_entity
  ON reminder_schedules(entity_kind, entity_id);

-- ─── 4. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE notifications             ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_schedules        ENABLE ROW LEVEL SECURITY;

-- notifications: only the recipient sees their own.
DROP POLICY IF EXISTS notifications_owner_read    ON notifications;
DROP POLICY IF EXISTS notifications_owner_write   ON notifications;

CREATE POLICY notifications_owner_read ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY notifications_owner_write ON notifications
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- preferences: only the owning user.
DROP POLICY IF EXISTS notification_preferences_owner ON notification_preferences;

CREATE POLICY notification_preferences_owner ON notification_preferences
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- reminder_schedules: any accepted org member reads (so reminders show in UIs);
-- mechanic+ writes (matches the entities they're attached to).
DROP POLICY IF EXISTS reminder_schedules_org_read  ON reminder_schedules;
DROP POLICY IF EXISTS reminder_schedules_org_write ON reminder_schedules;

CREATE POLICY reminder_schedules_org_read ON reminder_schedules
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

CREATE POLICY reminder_schedules_org_write ON reminder_schedules
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid()
        AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin', 'mechanic')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid()
        AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin', 'mechanic')
    )
  );

-- ─── 5. updated_at trigger on reminder_schedules ────────────────────────────

CREATE OR REPLACE FUNCTION trg_reminder_schedules_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS reminder_schedules_set_updated_at ON reminder_schedules;
CREATE TRIGGER reminder_schedules_set_updated_at
  BEFORE UPDATE ON reminder_schedules
  FOR EACH ROW EXECUTE FUNCTION trg_reminder_schedules_set_updated_at();

-- ─── 6. Comments ────────────────────────────────────────────────────────────

COMMENT ON TABLE notifications             IS 'Notification deliveries — one row per (user, channel, event). Spec 0.4.';
COMMENT ON TABLE notification_preferences  IS 'Per-user channel preferences keyed by category. Absent row = channel default.';
COMMENT ON TABLE reminder_schedules        IS 'Offset-based reminders ("30 days before X"). One row per offset. Spec 0.4.';
COMMENT ON COLUMN reminder_schedules.next_fire_at IS 'Pre-computed anchor + offset_days; the cron tick filters on this.';
