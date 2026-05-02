-- Migration 075: Tool Management & Calibration (Spec 2.6.1)
--
-- Aviation shops own torque wrenches, mag testers, borescopes, calipers,
-- lifts, jigs. Each has a calibration cycle. If a calibrated tool is used
-- past its due date, the work is non-compliant.
--
-- Three tables:
--   tools                — the asset registry
--   calibration_events   — audit trail; logging one updates Tool.next_calibration_date
--   tool_checkouts       — who-has-the-tool history
-- Plus a work_order_tool_uses join so WO save can block on overdue tools.

CREATE TABLE IF NOT EXISTS tools (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id     UUID REFERENCES locations(id) ON DELETE SET NULL,

  serial_number   TEXT NOT NULL,
  name            TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  category        TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('torque', 'measuring', 'test-equipment', 'jig', 'lift', 'borescope', 'other')),
  manufacturer    TEXT,
  model           TEXT,
  purchase_date   DATE,
  purchase_cost   NUMERIC(10, 2),
  storage_location TEXT,

  status          TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('in-use', 'available', 'out-for-calibration', 'out-of-service', 'lost', 'retired')),

  -- Calibration spec
  calibration_required        BOOLEAN NOT NULL DEFAULT TRUE,
  calibration_interval_months INTEGER CHECK (calibration_interval_months IS NULL OR calibration_interval_months > 0),
  calibration_interval_uses   INTEGER CHECK (calibration_interval_uses IS NULL OR calibration_interval_uses > 0),
  tolerance_days              INTEGER NOT NULL DEFAULT 0 CHECK (tolerance_days >= 0),
  last_calibration_date       DATE,
  last_calibration_by         TEXT,             -- vendor name or "in-house"
  last_calibration_cert_number TEXT,
  next_calibration_date       DATE,             -- recomputed on calibration_events insert

  -- Checkout snapshot (denormalized from tool_checkouts for quick reads)
  checked_out_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  checked_out_at              TIMESTAMPTZ,
  checked_out_to_work_order   UUID REFERENCES work_orders(id) ON DELETE SET NULL,

  -- Files (Supabase Storage URLs)
  certificate_urls            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  manual_url                  TEXT,

  notes                       TEXT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Within an org, serial_number must be unique. Two orgs can each have a
  -- tool with serial 'TW-001' — common when shops use generic numbering.
  UNIQUE (organization_id, serial_number)
);

CREATE INDEX IF NOT EXISTS tools_org_idx ON tools (organization_id);
CREATE INDEX IF NOT EXISTS tools_org_status_idx ON tools (organization_id, status);
CREATE INDEX IF NOT EXISTS tools_org_category_idx ON tools (organization_id, category);
-- Calibration-due hot path: cheap range scan on next_calibration_date.
CREATE INDEX IF NOT EXISTS tools_calibration_due_idx
  ON tools (organization_id, next_calibration_date)
  WHERE calibration_required = TRUE AND status NOT IN ('retired', 'lost');

DROP TRIGGER IF EXISTS tools_updated_at_trigger ON tools;
CREATE TRIGGER tools_updated_at_trigger
  BEFORE UPDATE ON tools
  FOR EACH ROW EXECUTE FUNCTION shifts_set_updated_at();

ALTER TABLE tools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tools_org_read ON tools;
CREATE POLICY tools_org_read ON tools FOR SELECT USING (
  organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  )
);

-- WRITE: any active org member (techs check tools out, log calibrations).
-- DELETE/retire is admin per the soft check below.
DROP POLICY IF EXISTS tools_member_write ON tools;
CREATE POLICY tools_member_write ON tools FOR ALL USING (
  organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  )
) WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  )
);

-- ─────────────────────────────────────────────────────────────────
-- 2. calibration_events — audit trail; insert auto-recomputes Tool.next_calibration_date
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calibration_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tool_id         UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,

  performed_at    DATE NOT NULL DEFAULT CURRENT_DATE,
  performed_by    TEXT NOT NULL,              -- vendor name or "in-house"
  certificate_number TEXT,
  result          TEXT NOT NULL DEFAULT 'pass'
    CHECK (result IN ('pass', 'fail', 'adjusted')),
  cost            NUMERIC(10, 2),
  notes           TEXT,
  certificate_url TEXT,
  next_due_date   DATE NOT NULL,

  logged_by       UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS calibration_events_tool_idx
  ON calibration_events (tool_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS calibration_events_org_idx
  ON calibration_events (organization_id);

ALTER TABLE calibration_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calibration_events_org ON calibration_events;
CREATE POLICY calibration_events_org ON calibration_events FOR ALL USING (
  organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  )
) WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  )
);

-- Trigger: on insert, push the new calibration date + next_due_date into
-- the parent tool. Keeps Tool.next_calibration_date as a denormalized
-- "current" snapshot for cheap due-list queries.
CREATE OR REPLACE FUNCTION calibration_events_recompute_tool()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE tools
  SET last_calibration_date = NEW.performed_at,
      last_calibration_by = NEW.performed_by,
      last_calibration_cert_number = NEW.certificate_number,
      next_calibration_date = NEW.next_due_date,
      updated_at = NOW()
  WHERE id = NEW.tool_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calibration_events_recompute_trigger ON calibration_events;
CREATE TRIGGER calibration_events_recompute_trigger
  AFTER INSERT ON calibration_events
  FOR EACH ROW EXECUTE FUNCTION calibration_events_recompute_tool();

-- ─────────────────────────────────────────────────────────────────
-- 3. tool_checkouts — who-has-the-tool history
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tool_checkouts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tool_id         UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_order_id   UUID REFERENCES work_orders(id) ON DELETE SET NULL,

  checked_out_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  returned_at     TIMESTAMPTZ
    CHECK (returned_at IS NULL OR returned_at >= checked_out_at),
  condition_at_return TEXT
    CHECK (condition_at_return IS NULL OR condition_at_return IN ('ok', 'damaged', 'needs-recalibration')),
  notes           TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tool_checkouts_tool_idx
  ON tool_checkouts (tool_id, checked_out_at DESC);
CREATE INDEX IF NOT EXISTS tool_checkouts_user_idx
  ON tool_checkouts (user_id, checked_out_at DESC);
-- One open checkout per tool — DB-level guarantee.
CREATE UNIQUE INDEX IF NOT EXISTS tool_checkouts_one_open_per_tool
  ON tool_checkouts (tool_id)
  WHERE returned_at IS NULL;

ALTER TABLE tool_checkouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tool_checkouts_org ON tool_checkouts;
CREATE POLICY tool_checkouts_org ON tool_checkouts FOR ALL USING (
  organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  )
) WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  )
);

-- ─────────────────────────────────────────────────────────────────
-- 4. work_order_tool_uses — bridge for the "Tools Used on this WO" panel
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_order_tool_uses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  work_order_id   UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  tool_id         UUID NOT NULL REFERENCES tools(id) ON DELETE RESTRICT,
  -- If the tool was used at a moment when its next_calibration_date had
  -- passed, this flag is set on insert (server-side check). It's an audit
  -- record — even if the tool is later recalibrated, this row stays
  -- truthful about what was used when.
  was_overdue     BOOLEAN NOT NULL DEFAULT FALSE,
  used_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_by         UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (work_order_id, tool_id, used_at)
);

CREATE INDEX IF NOT EXISTS wo_tool_uses_wo_idx
  ON work_order_tool_uses (work_order_id, used_at DESC);
CREATE INDEX IF NOT EXISTS wo_tool_uses_tool_idx
  ON work_order_tool_uses (tool_id, used_at DESC);

ALTER TABLE work_order_tool_uses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wo_tool_uses_org ON work_order_tool_uses;
CREATE POLICY wo_tool_uses_org ON work_order_tool_uses FOR ALL USING (
  organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  )
) WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  )
);

COMMENT ON TABLE tools IS 'Spec 2.6.1 — calibrated tools registry. next_calibration_date is denormalized from latest calibration_events row.';
COMMENT ON TABLE calibration_events IS 'Spec 2.6.1 — calibration audit trail. Insert trigger pushes next_due_date back to tools.';
COMMENT ON TABLE tool_checkouts IS 'Spec 2.6.1 — who has the tool now / history. Partial UNIQUE on returned_at IS NULL = one open checkout per tool.';
COMMENT ON TABLE work_order_tool_uses IS 'Spec 2.6.1 — Tools Used on each WO. was_overdue snapshot lets the WO server-side guard block adds when a tool is past its calibration date.';
