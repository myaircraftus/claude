-- Migration 070: Live Time Clock on Work Orders (Spec 2.3)
--
-- Per-tech, per-WO time entries with start/end timestamps. Open entries
-- (end_time IS NULL) represent "currently clocked in". The application
-- enforces "one open entry per technician" so the running-timer chip in
-- Topbar always shows the right one — partial-unique index makes this
-- a DB-level guarantee.
--
-- Path B: existing work_order_lines.hours + rate columns (016) are
-- *manual* labor lines. time_entries is a separate, complementary
-- system — the WO's aggregated labor total sums both. No conflict;
-- "add, don't replace".

CREATE TABLE IF NOT EXISTS time_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  work_order_id   UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  -- Optional: which work_order_line this entry rolls into (for per-item
  -- granularity). NULLABLE — most operators bill per-WO, not per-line.
  work_order_line_id UUID REFERENCES work_order_lines(id) ON DELETE SET NULL,
  technician_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Timing
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ
    CHECK (end_time IS NULL OR end_time >= start_time),

  -- Hourly rate at the time of clock-in. Frozen at clock-in so a later
  -- rate change doesn't retro-rewrite labor cost on already-submitted
  -- entries. NUMERIC(10,2) matches work_order_lines.rate.
  hourly_rate     NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),

  work_type       TEXT NOT NULL DEFAULT 'labor'
    CHECK (work_type IN ('labor', 'ojt', 'warranty', 'rework')),
  is_overtime     BOOLEAN NOT NULL DEFAULT FALSE,
  notes           TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_time_entries_wo        ON time_entries(work_order_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_tech      ON time_entries(technician_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_org       ON time_entries(organization_id, start_time DESC);
-- Partial unique index: at most one open (un-stopped) entry per technician.
-- A second clock-in would conflict; clockIn() helper checks this first
-- and refuses with a friendly error rather than relying on the constraint.
CREATE UNIQUE INDEX IF NOT EXISTS idx_time_entries_open_per_tech
  ON time_entries(technician_id)
  WHERE end_time IS NULL;
-- Cheap index for "find all open entries in this org" — drives anomaly
-- detection (forgot-to-clock-out) and admin "who's currently working" UIs.
CREATE INDEX IF NOT EXISTS idx_time_entries_open
  ON time_entries(organization_id, start_time)
  WHERE end_time IS NULL;

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS time_entries_org_read         ON time_entries;
DROP POLICY IF EXISTS time_entries_owner_or_admin   ON time_entries;
DROP POLICY IF EXISTS time_entries_self_write       ON time_entries;

-- Read: any accepted org member can see entries in their org. Mechanics
-- need to see each other's entries for "currently working" boards.
CREATE POLICY time_entries_org_read ON time_entries
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

-- Write: technicians can only insert/update their OWN entries. Owners +
-- admins can edit anyone's entries (e.g. correct a forgotten clock-out
-- post-hoc).
CREATE POLICY time_entries_self_write ON time_entries
  FOR ALL
  USING (
    technician_id = auth.uid()
    AND organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid()
        AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin', 'mechanic', 'pilot')
    )
  )
  WITH CHECK (
    technician_id = auth.uid()
    AND organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid()
        AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin', 'mechanic', 'pilot')
    )
  );

CREATE POLICY time_entries_owner_or_admin ON time_entries
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid()
        AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid()
        AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin')
    )
  );

-- ─── updated_at trigger ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_time_entries_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS time_entries_set_updated_at ON time_entries;
CREATE TRIGGER time_entries_set_updated_at
  BEFORE UPDATE ON time_entries
  FOR EACH ROW EXECUTE FUNCTION trg_time_entries_set_updated_at();

COMMENT ON TABLE  time_entries                      IS 'Per-tech, per-WO clock-in/out entries (Spec 2.3). Coexists with work_order_lines.hours/rate (016) for manual labor lines.';
COMMENT ON COLUMN time_entries.work_order_line_id   IS 'Optional FK if the entry should roll into a specific labor line. NULLABLE — most operators bill per-WO.';
COMMENT ON COLUMN time_entries.hourly_rate          IS 'Frozen at clock-in. Later rate changes do NOT retro-rewrite cost on entries that are already in flight or stopped.';
