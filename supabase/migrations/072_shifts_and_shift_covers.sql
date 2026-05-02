-- Migration 072: Mechanic Scheduler — shifts + shift covers (Spec 2.5.1)
--
-- Two tables:
--   - shifts        : per-tech, per-org scheduled work blocks
--                     ("Morning shift Tue 8-12 for Mike")
--   - shift_covers  : pending cover requests (tech can't make it +
--                     teammate willing to cover)
--
-- Path B mapping of the spec's localStorage prototype:
--   * Spec's `myaircraft_workspace_data_v1_<orgId>_shifts` → table here
--   * Spec's `Shift.technician: string (user id)` → technician_id UUID
--     FK to auth.users(id)
--   * Spec's `Shift.reminders: ReminderSpec[]` → JSONB column
--     `reminders` (free-form; the cross-wire to sprint 0d's
--     reminder_schedules is a follow-up)
--   * Spec's `Shift.checklist: ShiftChecklistItem[]` → JSONB column
--     `checklist` (small bounded list; child table not warranted)
--
-- Coexists with sprint 2.3's `time_entries` (070) — shifts is the
-- *plan*, time_entries is the *actual*. `getActiveTechniciansAt()` and
-- the WO assignee-picker cross-wire read shifts; clock-in/out continues
-- to write time_entries unchanged. "Add, don't replace."

-- ─────────────────────────────────────────────────────────────────
-- 1. shifts
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shifts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Optional location scope (sprint 0a). When NULL, the shift is
  -- "anywhere in the org" — same convention used by aircraft + WOs.
  location_id     UUID REFERENCES locations(id) ON DELETE SET NULL,

  -- Display name on the calendar tile. "Morning shift", "On-call", etc.
  name            TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),

  -- The assigned tech. NOT auth.users — the spec's `technician: string`
  -- maps to the user id; we FK to auth.users(id) so RLS + cascade work
  -- the same way as time_entries.
  technician_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Optional skill tags ("IA", "Avionics", "Engine"). Stored as a
  -- text array for cheap GIN indexing if the org grows large.
  roles           TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ NOT NULL
    CHECK (end_time > start_time),

  status          TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'in-progress', 'completed', 'missed', 'swapped')),

  -- Sprint 0d reminder schedules cross-wire. JSONB keeps the shape free
  -- until the planner decides whether to enqueue rows in
  -- reminder_schedules eagerly or lazily.
  reminders       JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Pre/post-shift checklist items. Bounded list (typical < 20),
  -- so child table not warranted; JSONB matches inspection_results
  -- pattern from sprint 1.3.
  checklist       JSONB NOT NULL DEFAULT '[]'::jsonb,

  notes           TEXT,

  created_by      UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shifts_org_idx
  ON shifts (organization_id);
CREATE INDEX IF NOT EXISTS shifts_tech_window_idx
  ON shifts (technician_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS shifts_org_window_idx
  ON shifts (organization_id, start_time, end_time);
-- Calendar view query: "all shifts overlapping [from, to)"
CREATE INDEX IF NOT EXISTS shifts_status_idx
  ON shifts (organization_id, status);

-- updated_at trigger
CREATE OR REPLACE FUNCTION shifts_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shifts_updated_at_trigger ON shifts;
CREATE TRIGGER shifts_updated_at_trigger
  BEFORE UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION shifts_set_updated_at();

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

-- READ: any active org member (mirrors time_entries policy — the team
-- needs to see the schedule even if it's another tech's shift).
DROP POLICY IF EXISTS shifts_org_read ON shifts;
CREATE POLICY shifts_org_read ON shifts
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

-- INSERT/UPDATE/DELETE: owner/admin only — managers schedule the shop,
-- techs don't self-schedule. (Tech swap requests go through shift_covers.)
DROP POLICY IF EXISTS shifts_admin_write ON shifts;
CREATE POLICY shifts_admin_write ON shifts
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin')
    )
  ) WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- 2. shift_covers
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shift_covers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- The shift the requesting tech can't make. ON DELETE CASCADE so
  -- removing a shift cleans up its cover requests.
  original_shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,

  -- Tech who's asking for cover. Matches the shift's technician_id at
  -- request time; stored separately so changing the shift assignee
  -- later doesn't rewrite who originally asked.
  requested_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Tech who agreed to cover. NULL until someone claims; then set when
  -- they hit "I'll cover this."
  covering_tech_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  status          TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'claimed', 'approved', 'rejected')),

  reason          TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shift_covers_org_idx
  ON shift_covers (organization_id);
CREATE INDEX IF NOT EXISTS shift_covers_shift_idx
  ON shift_covers (original_shift_id);
CREATE INDEX IF NOT EXISTS shift_covers_status_idx
  ON shift_covers (organization_id, status)
  WHERE status IN ('open', 'claimed');
-- Most queries are "show me open + claimed cover requests" — partial
-- index trims the working set.

-- One open cover request per shift — if a tech changes their mind,
-- they edit the existing request. No "spam multiple requests."
CREATE UNIQUE INDEX IF NOT EXISTS shift_covers_one_open_per_shift
  ON shift_covers (original_shift_id)
  WHERE status IN ('open', 'claimed');

-- updated_at trigger
DROP TRIGGER IF EXISTS shift_covers_updated_at_trigger ON shift_covers;
CREATE TRIGGER shift_covers_updated_at_trigger
  BEFORE UPDATE ON shift_covers
  FOR EACH ROW EXECUTE FUNCTION shifts_set_updated_at();

ALTER TABLE shift_covers ENABLE ROW LEVEL SECURITY;

-- READ: any active org member.
DROP POLICY IF EXISTS shift_covers_org_read ON shift_covers;
CREATE POLICY shift_covers_org_read ON shift_covers
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

-- INSERT: tech can create a cover request for THEIR OWN shift; admins
-- can create for anyone.
DROP POLICY IF EXISTS shift_covers_self_insert ON shift_covers;
CREATE POLICY shift_covers_self_insert ON shift_covers
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
    AND (
      requested_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM organization_memberships
        WHERE user_id = auth.uid()
          AND organization_id = shift_covers.organization_id
          AND accepted_at IS NOT NULL
          AND role IN ('owner', 'admin')
      )
    )
  );

-- UPDATE: requester can cancel/edit their own; potential coverer can
-- claim; admins can approve/reject.
DROP POLICY IF EXISTS shift_covers_update ON shift_covers;
CREATE POLICY shift_covers_update ON shift_covers
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
    AND (
      requested_by = auth.uid()
      OR covering_tech_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM organization_memberships
        WHERE user_id = auth.uid()
          AND organization_id = shift_covers.organization_id
          AND accepted_at IS NOT NULL
          AND role IN ('owner', 'admin')
      )
      -- Open covers are claimable by any org member (covering_tech_id
      -- is being set by the claimer themselves).
      OR (status = 'open')
    )
  );

-- DELETE: requester can withdraw; admins can remove.
DROP POLICY IF EXISTS shift_covers_delete ON shift_covers;
CREATE POLICY shift_covers_delete ON shift_covers
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
    AND (
      requested_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM organization_memberships
        WHERE user_id = auth.uid()
          AND organization_id = shift_covers.organization_id
          AND accepted_at IS NOT NULL
          AND role IN ('owner', 'admin')
      )
    )
  );

COMMENT ON TABLE shifts        IS 'Spec 2.5.1 — Mechanic shift schedule. Read by any org member, written by owner/admin.';
COMMENT ON TABLE shift_covers  IS 'Spec 2.5.1 — Shift cover/swap requests. Tech can request a cover for their own shift; teammates can claim.';
