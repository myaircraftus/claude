-- Migration 074: Daily Clock In/Out (Spec 2.5.3)
--
-- Distinct from sprint 2.3's `time_entries` (per-WO labor). A clock_event
-- is a tech's WORKDAY — clock in at 8a, take lunch, clock out at 5p.
-- Per-WO time_entries roll up INSIDE a daily ClockEvent: when a tech
-- clocks in via this system, subsequent clockIn() calls auto-set
-- `time_entries.clock_event_id` to their active ClockEvent.

CREATE TABLE IF NOT EXISTS clock_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  status          TEXT NOT NULL DEFAULT 'clocked-in'
    CHECK (status IN ('clocked-in', 'on-break', 'clocked-out')),

  clock_in_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clock_out_at    TIMESTAMPTZ
    CHECK (clock_out_at IS NULL OR clock_out_at >= clock_in_at),

  -- BreakInterval[] — JSONB to keep churn low while a workday is active.
  -- Shape: [{start: ISO, end?: ISO, reason?: string}, ...]
  breaks          JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Computed at clock-out: clocked-in duration minus break time.
  total_hours     NUMERIC(6,2)
    CHECK (total_hours IS NULL OR total_hours >= 0),

  -- Optional link to a 2.5.1 Shift this clock-event covers.
  shift_id        UUID REFERENCES shifts(id) ON DELETE SET NULL,

  notes           TEXT,
  image_url       TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS clock_events_org_idx
  ON clock_events (organization_id, clock_in_at DESC);
CREATE INDEX IF NOT EXISTS clock_events_employee_idx
  ON clock_events (employee_id, clock_in_at DESC);
-- One open ClockEvent per employee — DB-level guarantee.
CREATE UNIQUE INDEX IF NOT EXISTS clock_events_one_open_per_employee
  ON clock_events (employee_id)
  WHERE clock_out_at IS NULL;

DROP TRIGGER IF EXISTS clock_events_updated_at_trigger ON clock_events;
CREATE TRIGGER clock_events_updated_at_trigger
  BEFORE UPDATE ON clock_events
  FOR EACH ROW EXECUTE FUNCTION shifts_set_updated_at();

ALTER TABLE clock_events ENABLE ROW LEVEL SECURITY;

-- READ: any active org member.
DROP POLICY IF EXISTS clock_events_org_read ON clock_events;
CREATE POLICY clock_events_org_read ON clock_events
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

-- INSERT: employee for self; admin on behalf.
DROP POLICY IF EXISTS clock_events_self_insert ON clock_events;
CREATE POLICY clock_events_self_insert ON clock_events
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
    AND (
      employee_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM organization_memberships
        WHERE user_id = auth.uid()
          AND organization_id = clock_events.organization_id
          AND accepted_at IS NOT NULL
          AND role IN ('owner', 'admin')
      )
    )
  );

-- UPDATE: requester (self) for own clock; admin can edit any (e.g. fix
-- a "forgot to clock out" stale event).
DROP POLICY IF EXISTS clock_events_update ON clock_events;
CREATE POLICY clock_events_update ON clock_events
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
    AND (
      employee_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM organization_memberships
        WHERE user_id = auth.uid()
          AND organization_id = clock_events.organization_id
          AND accepted_at IS NOT NULL
          AND role IN ('owner', 'admin')
      )
    )
  );

-- DELETE: admin only — historical clock events shouldn't be wiped by
-- the employee themselves once payroll has touched them.
DROP POLICY IF EXISTS clock_events_admin_delete ON clock_events;
CREATE POLICY clock_events_admin_delete ON clock_events
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- Bridge from sprint 2.3: time_entries.clock_event_id
-- Per-WO clock-in (sprint 2.3) auto-attaches to the tech's active
-- daily ClockEvent. NULLABLE because time_entries from before this
-- sprint or from techs not using the daily clock just stay NULL.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS clock_event_id UUID
  REFERENCES clock_events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS time_entries_clock_event_idx
  ON time_entries (clock_event_id)
  WHERE clock_event_id IS NOT NULL;

COMMENT ON TABLE clock_events IS 'Spec 2.5.3 — daily clock in/out. Per-WO time_entries (070) reference clock_event_id when active.';
COMMENT ON COLUMN time_entries.clock_event_id IS 'Sprint 2.5.3 bridge — set automatically when a tech with an open daily ClockEvent clocks into a WO. NULL if the tech is not using the daily clock.';
