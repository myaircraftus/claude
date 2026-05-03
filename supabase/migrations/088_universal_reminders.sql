-- Cross-cutting Concern 1 — Universal Reminders / Start / Due trio
--
-- Adds (idempotently, IF NOT EXISTS) start_date / due_date / reminder_offsets
-- to every actionable entity that didn't already have them. Documents already
-- got the trio from migration 076; we leave it alone.
--
-- reminder_offsets shape (validated at the API layer, not the DB):
--   [{ "offset_days": -30, "channels": ["in-app","email"] }, ...]
-- Negative = before the due_date anchor; positive = after.
--
-- The lib/reminders/scheduler.ts helper consumes (start_date, due_date,
-- reminder_offsets) and upserts reminder_schedules rows whenever any of the
-- three change.

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS start_date timestamptz,
  ADD COLUMN IF NOT EXISTS due_date timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_offsets jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS start_date timestamptz,
  -- inspections.due_date already exists from 065; only add the reminder column.
  ADD COLUMN IF NOT EXISTS reminder_offsets jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE compliance_items
  ADD COLUMN IF NOT EXISTS start_date timestamptz,
  -- compliance_items.next_due_date is the anchor — no rename, just an alias
  -- in the helper. Add reminder_offsets.
  ADD COLUMN IF NOT EXISTS reminder_offsets jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE continued_items
  ADD COLUMN IF NOT EXISTS start_date timestamptz,
  ADD COLUMN IF NOT EXISTS due_date timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_offsets jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS start_date timestamptz,
  -- approval_requests.expires_at already exists; alias in helper.
  ADD COLUMN IF NOT EXISTS reminder_offsets jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS start_date timestamptz,
  ADD COLUMN IF NOT EXISTS due_date timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_offsets jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE time_off_requests
  ADD COLUMN IF NOT EXISTS reminder_offsets jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS reminder_offsets jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE tools
  ADD COLUMN IF NOT EXISTS reminder_offsets jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE cost_entries
  ADD COLUMN IF NOT EXISTS due_date timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_offsets jsonb NOT NULL DEFAULT '[]'::jsonb;
