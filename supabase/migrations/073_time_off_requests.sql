-- Migration 073: Time Off Requests (Spec 2.5.2)
--
-- Approved time-off blocks let the Scheduler grey out PTO days and the
-- WO assignee picker warn "Tech on PTO this date." Submission flow:
--   pending → approved | denied | cancelled.
-- Coexists with shifts (072): a tech can have shifts AND PTO; the
-- assignment-conflict check treats approved PTO as a hard block.

CREATE TABLE IF NOT EXISTS time_off_requests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Requesting employee. FK to auth.users mirrors shifts.technician_id /
  -- time_entries.technician_id pattern.
  employee_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  request_type    TEXT NOT NULL DEFAULT 'Personal'
    CHECK (request_type IN ('Holiday', 'Medical', 'Personal', 'Bereavement', 'Jury Duty')),

  -- ISO dates (no time component) — PTO is whole-day blocks per spec.
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL CHECK (end_date >= start_date),

  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('draft', 'pending', 'approved', 'denied', 'cancelled')),

  -- Recipients to notify on approval/denial. Free-form list of user ids;
  -- frontend populates with manager + adjacent teammates.
  notify_user_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],

  reason          TEXT,
  manager_comment TEXT,

  decided_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at      TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS time_off_org_idx
  ON time_off_requests (organization_id);
CREATE INDEX IF NOT EXISTS time_off_employee_idx
  ON time_off_requests (employee_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS time_off_org_window_idx
  ON time_off_requests (organization_id, start_date, end_date);
-- Approved-only filter — scheduler overlay + isTechOnTimeOff() hot path.
CREATE INDEX IF NOT EXISTS time_off_approved_idx
  ON time_off_requests (organization_id, employee_id, start_date, end_date)
  WHERE status = 'approved';
-- Pending queue — manager dashboard hot path.
CREATE INDEX IF NOT EXISTS time_off_pending_idx
  ON time_off_requests (organization_id, created_at DESC)
  WHERE status = 'pending';

DROP TRIGGER IF EXISTS time_off_updated_at_trigger ON time_off_requests;
CREATE TRIGGER time_off_updated_at_trigger
  BEFORE UPDATE ON time_off_requests
  FOR EACH ROW EXECUTE FUNCTION shifts_set_updated_at();
-- Reuses the trigger function from migration 072 (shifts_set_updated_at)
-- since it just sets NEW.updated_at = NOW(). One function, many tables.

ALTER TABLE time_off_requests ENABLE ROW LEVEL SECURITY;

-- READ: any active org member. Team needs to see who's on PTO.
DROP POLICY IF EXISTS time_off_org_read ON time_off_requests;
CREATE POLICY time_off_org_read ON time_off_requests
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

-- INSERT: employee can submit for SELF; admin can submit on behalf.
DROP POLICY IF EXISTS time_off_self_insert ON time_off_requests;
CREATE POLICY time_off_self_insert ON time_off_requests
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
          AND organization_id = time_off_requests.organization_id
          AND accepted_at IS NOT NULL
          AND role IN ('owner', 'admin')
      )
    )
  );

-- UPDATE: requester can cancel their own pending; admin can decide / edit.
DROP POLICY IF EXISTS time_off_update ON time_off_requests;
CREATE POLICY time_off_update ON time_off_requests
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
          AND organization_id = time_off_requests.organization_id
          AND accepted_at IS NOT NULL
          AND role IN ('owner', 'admin')
      )
    )
  );

-- DELETE: requester (own pending only) or admin.
DROP POLICY IF EXISTS time_off_delete ON time_off_requests;
CREATE POLICY time_off_delete ON time_off_requests
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
    AND (
      (employee_id = auth.uid() AND status = 'pending')
      OR EXISTS (
        SELECT 1 FROM organization_memberships
        WHERE user_id = auth.uid()
          AND organization_id = time_off_requests.organization_id
          AND accepted_at IS NOT NULL
          AND role IN ('owner', 'admin')
      )
    )
  );

COMMENT ON TABLE time_off_requests IS 'Spec 2.5.2 — employee PTO requests with manager approval. Approved blocks render as gray bars on the Scheduler and flag conflicts in WO assignee picker.';
