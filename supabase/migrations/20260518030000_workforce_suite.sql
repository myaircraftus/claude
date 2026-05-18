-- SOP-WRK-001: Workforce Suite — Phase 1 foundation (EXTEND mode).
--
-- The codebase already has a working workforce feature: shifts + shift_covers
-- (mig 072), time_off_requests (073), clock_events (074), per-WO time_entries
-- (070), and a locations table. Per the chosen direction we EXTEND those —
-- this migration does NOT create the parallel workforce_shifts /
-- workforce_time_entries / workforce_locations tables the SOP names.
--
-- Naming note: the SOP says `shop_id`; the codebase standard is
-- `organization_id` (every existing table uses it). We follow the codebase.
-- "Shop" = an organization whose members have the shop persona.
--
-- This migration:
--   1. ALTERs shifts / clock_events / time_off_requests with the SOP's
--      job-costing + timesheet fields (all nullable / defaulted — safe).
--   2. Creates workforce_employee_profiles — a 1:1 workforce extension of an
--      org membership (workforce_role, employment type, cred}entials anchor).
--   3. Creates workforce_timesheets — the weekly payable-hours rollup.
--   4. Creates workforce_audit_events — an append-only audit log, hard-
--      blocked against UPDATE/DELETE by trigger (SOP §14 guardrail #10).

-- ─────────────────────────────────────────────────────────────────
-- 1. Extend existing tables
-- ─────────────────────────────────────────────────────────────────

-- shifts — job-costing metadata (SOP §6.2). All optional.
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS break_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS aircraft_id UUID REFERENCES aircraft(id) ON DELETE SET NULL;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS job_type TEXT;

-- clock_events — this IS the SOP's "time entries" (the daily clock in/out).
-- Add job context + billable classification so timesheets can roll up.
ALTER TABLE clock_events ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE SET NULL;
ALTER TABLE clock_events ADD COLUMN IF NOT EXISTS break_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clock_events ADD COLUMN IF NOT EXISTS job_type TEXT;
ALTER TABLE clock_events ADD COLUMN IF NOT EXISTS work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL;
ALTER TABLE clock_events ADD COLUMN IF NOT EXISTS aircraft_id UUID REFERENCES aircraft(id) ON DELETE SET NULL;
ALTER TABLE clock_events ADD COLUMN IF NOT EXISTS billable_status TEXT NOT NULL DEFAULT 'billable'
  CHECK (billable_status IN ('billable','non_billable','internal'));
ALTER TABLE clock_events ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'web'
  CHECK (source IN ('web','kiosk','mobile','manager_override','correction'));

-- time_off_requests — SOP wants an explicit total-days figure.
ALTER TABLE time_off_requests ADD COLUMN IF NOT EXISTS total_days NUMERIC(4,1);

-- ─────────────────────────────────────────────────────────────────
-- 2. workforce_employee_profiles — workforce extension of a membership
-- ─────────────────────────────────────────────────────────────────
-- One row per (organization, user). Adds workforce-specific attributes on
-- top of organization_memberships; name/email still come from user_profiles.
CREATE TABLE IF NOT EXISTS workforce_employee_profiles (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_code     TEXT,
  role_title        TEXT,
  department        TEXT,
  location_id       UUID REFERENCES locations(id) ON DELETE SET NULL,
  employment_status TEXT NOT NULL DEFAULT 'active'
    CHECK (employment_status IN ('active','inactive','on_leave')),
  employment_type   TEXT NOT NULL DEFAULT 'hourly'
    CHECK (employment_type IN ('hourly','salary','contractor')),
  workforce_role    TEXT NOT NULL DEFAULT 'mechanic'
    CHECK (workforce_role IN ('admin','manager','mechanic','payroll_admin','auditor')),
  -- Restricted column (SOP §14 guardrail #9): only owner/admin/payroll_admin
  -- may read this — enforced at the API layer (the page never selects it for
  -- other roles). Stored in cents to avoid float drift.
  hourly_rate_cents INTEGER CHECK (hourly_rate_cents IS NULL OR hourly_rate_cents >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS workforce_employee_profiles_org_idx
  ON workforce_employee_profiles (organization_id);

DROP TRIGGER IF EXISTS workforce_employee_profiles_updated_at ON workforce_employee_profiles;
CREATE TRIGGER workforce_employee_profiles_updated_at
  BEFORE UPDATE ON workforce_employee_profiles
  FOR EACH ROW EXECUTE FUNCTION shifts_set_updated_at();

ALTER TABLE workforce_employee_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workforce_employee_profiles_read ON workforce_employee_profiles;
CREATE POLICY workforce_employee_profiles_read ON workforce_employee_profiles
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

DROP POLICY IF EXISTS workforce_employee_profiles_write ON workforce_employee_profiles;
CREATE POLICY workforce_employee_profiles_write ON workforce_employee_profiles
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
        AND role IN ('owner','admin')
    )
  ) WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
        AND role IN ('owner','admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- 3. workforce_timesheets — weekly payable-hours rollup (SOP §8)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workforce_timesheets (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start         DATE NOT NULL,
  week_end           DATE NOT NULL CHECK (week_end >= week_start),
  regular_hours      NUMERIC(6,2) NOT NULL DEFAULT 0,
  overtime_hours     NUMERIC(6,2) NOT NULL DEFAULT 0,
  billable_hours     NUMERIC(6,2) NOT NULL DEFAULT 0,
  non_billable_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','exported')),
  submitted_at       TIMESTAMPTZ,
  approved_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at        TIMESTAMPTZ,
  exported_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, week_start)
);

CREATE INDEX IF NOT EXISTS workforce_timesheets_org_week_idx
  ON workforce_timesheets (organization_id, week_start);
CREATE INDEX IF NOT EXISTS workforce_timesheets_employee_idx
  ON workforce_timesheets (employee_id, week_start DESC);

DROP TRIGGER IF EXISTS workforce_timesheets_updated_at ON workforce_timesheets;
CREATE TRIGGER workforce_timesheets_updated_at
  BEFORE UPDATE ON workforce_timesheets
  FOR EACH ROW EXECUTE FUNCTION shifts_set_updated_at();

ALTER TABLE workforce_timesheets ENABLE ROW LEVEL SECURITY;

-- READ: any active org member (the API narrows mechanics to their own row).
DROP POLICY IF EXISTS workforce_timesheets_read ON workforce_timesheets;
CREATE POLICY workforce_timesheets_read ON workforce_timesheets
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

-- WRITE: owner/admin. Mechanic "submit" and timesheet generation run through
-- API routes on the service client after an explicit persona/role check.
DROP POLICY IF EXISTS workforce_timesheets_write ON workforce_timesheets;
CREATE POLICY workforce_timesheets_write ON workforce_timesheets
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
        AND role IN ('owner','admin')
    )
  ) WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
        AND role IN ('owner','admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- 4. workforce_audit_events — append-only audit log (SOP §13 / §14 #10)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workforce_audit_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type     TEXT NOT NULL,   -- time_entry | shift | timesheet | time_off_request | employee
  entity_id       UUID NOT NULL,
  action          TEXT NOT NULL,   -- create | update | delete | approve | deny | export | override
  before_json     JSONB,
  after_json      JSONB,
  reason          TEXT,            -- REQUIRED for manual edits (enforced at the API layer)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workforce_audit_events_org_idx
  ON workforce_audit_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS workforce_audit_events_entity_idx
  ON workforce_audit_events (entity_type, entity_id);

-- Append-only hard block (SOP §14 guardrail #10): no UPDATE or DELETE, ever,
-- by anyone — including the table owner and the service role.
CREATE OR REPLACE FUNCTION workforce_audit_events_block_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'workforce_audit_events is append-only (SOP-WRK-001 §14): % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS workforce_audit_events_no_update ON workforce_audit_events;
CREATE TRIGGER workforce_audit_events_no_update
  BEFORE UPDATE ON workforce_audit_events
  FOR EACH ROW EXECUTE FUNCTION workforce_audit_events_block_mutation();

DROP TRIGGER IF EXISTS workforce_audit_events_no_delete ON workforce_audit_events;
CREATE TRIGGER workforce_audit_events_no_delete
  BEFORE DELETE ON workforce_audit_events
  FOR EACH ROW EXECUTE FUNCTION workforce_audit_events_block_mutation();

ALTER TABLE workforce_audit_events ENABLE ROW LEVEL SECURITY;

-- READ: any active org member (the API narrows to admin/payroll/auditor).
DROP POLICY IF EXISTS workforce_audit_events_read ON workforce_audit_events;
CREATE POLICY workforce_audit_events_read ON workforce_audit_events
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

-- INSERT: any active org member (their own actions are what get logged).
-- No UPDATE or DELETE policy exists — combined with the trigger above, the
-- table is strictly append-only.
DROP POLICY IF EXISTS workforce_audit_events_insert ON workforce_audit_events;
CREATE POLICY workforce_audit_events_insert ON workforce_audit_events
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

COMMENT ON TABLE workforce_employee_profiles IS 'SOP-WRK-001 §13 — workforce attributes (role, employment, rate) extending an org membership.';
COMMENT ON TABLE workforce_timesheets IS 'SOP-WRK-001 §8 — weekly payable-hours rollup derived from clock_events.';
COMMENT ON TABLE workforce_audit_events IS 'SOP-WRK-001 §14 — append-only workforce audit log. UPDATE/DELETE hard-blocked by trigger.';
COMMENT ON COLUMN workforce_employee_profiles.hourly_rate_cents IS 'Restricted (SOP §14 #9): API exposes it only to owner/admin/payroll_admin.';
