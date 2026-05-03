-- Migration 080: Cost Categories + Cost Entries (Spec 7.1)
--
-- Foundation for Phase 7 — Aircraft Operating Economics. One row per
-- cost line. Buckets bring per-hour vs annual-fixed vs reserve math
-- together so the calculator (7.4) doesn't have to re-classify every
-- read. Source + source_priority follow the framework spec'd in 7.8 —
-- the column is here from day one so 7.8 can layer override audit on
-- top without retrofit.

CREATE TABLE IF NOT EXISTS cost_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id     UUID REFERENCES aircraft(id) ON DELETE SET NULL,

  -- Persona-shaped category. Free-form TEXT (no CHECK) so Phase 7.x
  -- sprints can add categories without a migration; the seed list lives
  -- in lib/costs/categories.ts and the form's dropdown reads it.
  category        TEXT NOT NULL,

  -- Bucket = how this cost gets amortized in the per-hour calculator.
  bucket          TEXT NOT NULL
    CHECK (bucket IN (
      'variable_per_hour',     -- fuel, oil — per-flight-hour cost
      'scheduled_per_hour',    -- engine/prop overhaul reserves
      'annual_fixed',          -- insurance, annual inspection
      'monthly_fixed',         -- hangar, tiedown, software subs
      'one_time',              -- repair, upgrade, avionics database
      'loan',                  -- loan payments
      'depreciation'           -- MACRS / book depreciation
    )),

  -- Optional FK to vendors (sprint 2.2). NULL when the source is a
  -- self-service / no-vendor entry (e.g. fuel-pump + own credit card).
  vendor_id       UUID REFERENCES vendors(id) ON DELETE SET NULL,

  description     TEXT,
  -- Amount in minor currency units? No — use NUMERIC(12,2) to match
  -- approval_line_items.estimated_cost shape from sprint 1.5. Currency
  -- column lets us support multi-currency orgs later.
  amount          NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency        TEXT NOT NULL DEFAULT 'USD',

  -- Date the cost was incurred (YYYY-MM-DD). For 'monthly_fixed' /
  -- 'annual_fixed' use the period start date; the calculator amortizes.
  cost_date       DATE NOT NULL,

  -- True when the row is a placeholder estimate (e.g. "fuel ~ $300/mo")
  -- versus a real receipt-backed line.
  is_estimate     BOOLEAN NOT NULL DEFAULT FALSE,

  -- Source priority framework (Spec 7.8 — schema-first, full audit
  -- in a future sprint). 1=estimated → 5=official.
  source          TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'extracted', 'imported', 'estimated', 'reconciled')),
  source_priority INTEGER NOT NULL DEFAULT 4
    CHECK (source_priority BETWEEN 1 AND 5),

  -- Sprint 7.2 cross-wires: link to the IntakeDocument that produced
  -- this row + the ExtractionResult (sprint 7.3) when AI extracted it.
  -- Both NULLABLE so manual entries don't carry the columns.
  intake_document_id   UUID,
  extraction_result_id UUID,

  -- Approval gate — extracted rows from 7.3 land approved=false until
  -- the operator reviews. Manual rows from 7.1 default true.
  approved        BOOLEAN NOT NULL DEFAULT TRUE,

  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hot paths: per-aircraft year filter (the profitability dashboard,
-- sprint 7.5) and per-org list (the /costs page).
CREATE INDEX IF NOT EXISTS cost_entries_aircraft_date_idx
  ON cost_entries (aircraft_id, cost_date DESC)
  WHERE aircraft_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cost_entries_org_date_idx
  ON cost_entries (organization_id, cost_date DESC);
CREATE INDEX IF NOT EXISTS cost_entries_category_idx
  ON cost_entries (organization_id, category, cost_date DESC);
-- Pending review queue (sprint 7.3 will write rows with approved=false).
CREATE INDEX IF NOT EXISTS cost_entries_pending_idx
  ON cost_entries (organization_id, created_at DESC)
  WHERE approved = FALSE;

ALTER TABLE cost_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cost_entries_org_read  ON cost_entries;
DROP POLICY IF EXISTS cost_entries_org_write ON cost_entries;

CREATE POLICY cost_entries_org_read ON cost_entries
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

-- Owner / admin / mechanic can write. Pilots can self-log fuel/oil
-- (matches the meter_readings pattern from 1.1).
CREATE POLICY cost_entries_org_write ON cost_entries
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin', 'mechanic', 'pilot')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin', 'mechanic', 'pilot')
    )
  );

CREATE OR REPLACE FUNCTION trg_cost_entries_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS cost_entries_set_updated_at ON cost_entries;
CREATE TRIGGER cost_entries_set_updated_at
  BEFORE UPDATE ON cost_entries
  FOR EACH ROW EXECUTE FUNCTION trg_cost_entries_set_updated_at();

COMMENT ON TABLE  cost_entries IS 'Spec 7.1 — one row per cost. Bucket drives per-hour calculator (7.4). Source priority (7.8) baked in from day one.';
COMMENT ON COLUMN cost_entries.bucket IS 'How the cost amortizes: variable/scheduled per hour, annual/monthly fixed, one_time, loan, depreciation.';
COMMENT ON COLUMN cost_entries.source IS 'Spec 7.8 — manual / extracted (AI vision) / imported (CSV) / estimated / reconciled (QBO match). source_priority 1-5 ranks override authority.';
