-- Migration 064: Compliance / Maintenance Tracking (Spec 1.2)
--
-- Generic compliance/maintenance items: inspections (Annual, 100hr, ELT
-- battery, transponder cert, etc.) and components (life-limited parts,
-- AD/SB-driven replacements). One row per (aircraft × tracked item).
--
-- Path B: existing `reminders` table (013) is aviation-specific with
-- snooze + priority + auto-generated semantics — kept untouched per
-- "add, don't replace". Existing `aircraft_ad_applicability` (014)
-- continues to drive AD-specific behavior. compliance_items is the
-- spec-shaped row that the new compliance UI + AI orchestrator consume.
-- A future cross-cutting cleanup can have reminders/AD applicability
-- enqueue compliance_items so we have one source of truth.
--
-- Whichever-comes-first: an item can have any combination of
-- interval_calendar_months / interval_hours / interval_cycles. The next
-- due value is recomputed in lib/compliance/compute.ts and stored back
-- into the next_due_* columns + status enum. We don't put the compute
-- in a Postgres trigger because (a) it needs the aircraft's CURRENT
-- meter reading (a join across two tables), (b) we want to emit
-- AISignals on status flips, and (c) the recompute needs to know the
-- caller's user_id for audit.

-- ─── 1. compliance_items ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS compliance_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id     UUID NOT NULL REFERENCES aircraft(id)      ON DELETE CASCADE,
  title           TEXT NOT NULL,             -- "Annual Inspection", "ELT Battery"
  item_type       TEXT NOT NULL DEFAULT 'inspection'
    CHECK (item_type IN ('inspection', 'component')),
  source          TEXT NOT NULL DEFAULT 'Custom'
    CHECK (source IN ('AD', 'SB', 'Manufacturer', 'Custom', 'Life-Limited')),
  -- Reference number when source = AD or SB (e.g. "AD 2023-12-05").
  source_reference TEXT,

  -- Interval definitions. NULL = not tracked. At least one must be set;
  -- enforced at the application layer (check varies by item_type).
  interval_calendar_months INTEGER CHECK (interval_calendar_months IS NULL OR interval_calendar_months > 0),
  interval_hours           NUMERIC(8,1) CHECK (interval_hours IS NULL OR interval_hours > 0),
  interval_cycles          INTEGER  CHECK (interval_cycles IS NULL OR interval_cycles > 0),

  -- Tolerance / grace period (FAR 91.409, 14 CFR 39.7 — common for annuals
  -- / ADs). e.g. "30 days after the calendar due date" or "10 hours after
  -- the hour due value".
  tolerance_calendar_days INTEGER  CHECK (tolerance_calendar_days IS NULL OR tolerance_calendar_days >= 0),
  tolerance_hours         NUMERIC(8,1) CHECK (tolerance_hours IS NULL OR tolerance_hours >= 0),

  -- Last completion. Setting last_completed_date triggers the recompute
  -- (called by the API layer, not a DB trigger).
  last_completed_date     DATE,
  last_completed_hours    NUMERIC(10,1),
  last_completed_cycles   INTEGER,

  -- Computed (lib/compliance/compute.ts) — derived from last_completed +
  -- intervals. Stored so the due-list query is just an ORDER BY.
  next_due_date           DATE,
  next_due_hours          NUMERIC(10,1),
  next_due_cycles         INTEGER,

  -- Status: 'current' | 'due-soon' | 'overdue' | 'deferred'. Recomputed
  -- on every relevant write (meter reading insert / item edit / complete).
  status                  TEXT NOT NULL DEFAULT 'current'
    CHECK (status IN ('current', 'due-soon', 'overdue', 'deferred')),
  -- Whether this item requires a Required Inspection Item second-signoff.
  requires_rii            BOOLEAN NOT NULL DEFAULT FALSE,
  notes                   TEXT,
  -- Work orders that completed this item (most recent first in the array).
  -- Stored as TEXT[] because work_orders can be deleted independently and
  -- we don't want a cascade to wipe history; the API filters out stale ids.
  linked_work_orders      UUID[] NOT NULL DEFAULT '{}'::UUID[],

  -- Audit
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Multiple items can share the same title across aircraft, but for a
  -- single aircraft we want one row per (aircraft × title × source).
  UNIQUE (aircraft_id, title, source)
);

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_compliance_items_org      ON compliance_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_compliance_items_aircraft ON compliance_items(aircraft_id);
CREATE INDEX IF NOT EXISTS idx_compliance_items_status   ON compliance_items(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_compliance_items_due_date ON compliance_items(organization_id, next_due_date)
  WHERE next_due_date IS NOT NULL AND status IN ('due-soon', 'overdue');

-- ─── 2. RLS ────────────────────────────────────────────────────────────────

ALTER TABLE compliance_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compliance_items_org_read  ON compliance_items;
DROP POLICY IF EXISTS compliance_items_org_write ON compliance_items;

CREATE POLICY compliance_items_org_read ON compliance_items
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

CREATE POLICY compliance_items_org_write ON compliance_items
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

-- ─── 3. updated_at trigger ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_compliance_items_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS compliance_items_set_updated_at ON compliance_items;
CREATE TRIGGER compliance_items_set_updated_at
  BEFORE UPDATE ON compliance_items
  FOR EACH ROW EXECUTE FUNCTION trg_compliance_items_set_updated_at();

-- ─── 4. Comments ───────────────────────────────────────────────────────────

COMMENT ON TABLE  compliance_items                        IS 'General compliance/maintenance items (Spec 1.2). Coexists with `reminders` (013) and `aircraft_ad_applicability` (014).';
COMMENT ON COLUMN compliance_items.next_due_date          IS 'Computed by lib/compliance/compute.ts on item insert/edit and after every meter reading insert.';
COMMENT ON COLUMN compliance_items.next_due_hours         IS 'Computed alongside next_due_date.';
COMMENT ON COLUMN compliance_items.linked_work_orders     IS 'Work order ids that have completed this item — most recent first. UUID[] vs FK because WOs can be deleted; array is filtered against work_orders at read time.';
COMMENT ON COLUMN compliance_items.requires_rii           IS 'Required Inspection Item — needs a second mechanic to sign off (FAR 43 RII rules).';
