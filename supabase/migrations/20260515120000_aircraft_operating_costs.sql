-- Owner Economics — per-aircraft operating cost parameters.
--
-- One row per aircraft: the owner-entered (or AI-suggested) cost inputs
-- that drive the Operating Cost form, the Economics dashboard, and
-- break-even analysis. Distinct from cost_entries (actual logged spend).
--
-- NOTE vs. the original spec: the spec's RLS referenced a `profiles`
-- table with an `org_id` column. This app has neither — org membership
-- lives in `organization_memberships`, and the profile table is
-- `user_profiles`. RLS below uses the established `organization_memberships`
-- pattern (see migration 080 cost_entries). The column is `organization_id`
-- (codebase convention) rather than `org_id`. There is also no global
-- `set_updated_at()` function — each table defines its own trigger fn.

CREATE TABLE IF NOT EXISTS aircraft_operating_costs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aircraft_id              uuid NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  organization_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Fuel
  fuel_burn_gph            numeric(6,2),   -- gallons per hour
  fuel_price_per_gal       numeric(6,2),   -- $ per gallon

  -- Oil
  oil_burn_qph             numeric(6,3),   -- quarts per hour
  oil_price_per_qt         numeric(6,2),   -- $ per quart

  -- Reserves (all per flight hour)
  engine_reserve_per_hr    numeric(8,2),
  prop_reserve_per_hr      numeric(8,2),
  scheduled_maint_per_hr   numeric(8,2),
  unscheduled_maint_per_hr numeric(8,2),

  -- Annual fixed costs
  insurance_per_year       numeric(10,2),
  annual_fixed_cost        numeric(10,2),  -- registration, subscriptions, etc.
  tiedown_per_month        numeric(8,2),
  expected_annual_hours    integer DEFAULT 150,

  -- Financing
  is_leased                boolean DEFAULT false,
  lease_per_month          numeric(10,2),

  -- Owner selling / charter rate (optional — break-even analysis)
  selling_rate_per_hr      numeric(8,2),
  rental_type              text DEFAULT 'dry',  -- 'dry' | 'wet'

  -- AI metadata
  ai_confidence            text,    -- 'high' | 'medium' | 'low'
  ai_notes                 text,    -- AI reasoning for the estimates

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  UNIQUE (aircraft_id)
);

CREATE INDEX IF NOT EXISTS aircraft_operating_costs_org_idx
  ON aircraft_operating_costs (organization_id);

ALTER TABLE aircraft_operating_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aircraft_operating_costs_org_read  ON aircraft_operating_costs;
DROP POLICY IF EXISTS aircraft_operating_costs_org_write ON aircraft_operating_costs;

-- Any accepted org member can read their org's operating costs.
CREATE POLICY aircraft_operating_costs_org_read ON aircraft_operating_costs
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

-- Owner / admin can write operating costs.
CREATE POLICY aircraft_operating_costs_org_write ON aircraft_operating_costs
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin')
    )
  );

CREATE OR REPLACE FUNCTION trg_aircraft_operating_costs_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS aircraft_operating_costs_set_updated_at ON aircraft_operating_costs;
CREATE TRIGGER aircraft_operating_costs_set_updated_at
  BEFORE UPDATE ON aircraft_operating_costs
  FOR EACH ROW EXECUTE FUNCTION trg_aircraft_operating_costs_set_updated_at();

COMMENT ON TABLE aircraft_operating_costs IS
  'Owner Economics — per-aircraft operating cost parameters (owner-entered or AI-suggested). One row per aircraft.';
