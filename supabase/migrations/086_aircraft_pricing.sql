-- Sprint 3.1 — Per-aircraft Billing / Tax / Contract Pricing
--
-- One row per aircraft (single-row pattern, NOT a history). Edits update
-- in place; the row's updated_at gives the audit trail. JSONB columns
-- because the shape inside contract_rates / tax_override / billing_profile /
-- split_billing is more usefully validated in TS than in pg.
--
-- aircraft_id is both the FK and the PK — one pricing config per aircraft,
-- cascade delete when the aircraft is removed.

CREATE TABLE IF NOT EXISTS aircraft_pricing (
  aircraft_id          uuid PRIMARY KEY REFERENCES aircraft(id) ON DELETE CASCADE,
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- ContractRate[] — { department, labor_rate } per row.
  contract_rates       jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- 0-100 scalar applied to all parts + labor before tax. Stored as a
  -- percentage (10 = 10% off), not a multiplier — matches operator UI.
  default_discount_pct numeric(5,2) NOT NULL DEFAULT 0,

  -- TaxProfile shape — { rate, jurisdiction, exempt, exemptionId }.
  tax_override         jsonb,

  -- BillingProfile shape — { termDays, poRequired, emailInvoiceTo[] }.
  billing_profile      jsonb,

  -- SplitBilling shape — { customers: [{ customer_id, percentage }] }.
  split_billing        jsonb,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aircraft_pricing_org_idx
  ON aircraft_pricing (organization_id);

ALTER TABLE aircraft_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members read aircraft_pricing" ON aircraft_pricing;
CREATE POLICY "Org members read aircraft_pricing"
  ON aircraft_pricing FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

DROP POLICY IF EXISTS "Owner/admin write aircraft_pricing" ON aircraft_pricing;
CREATE POLICY "Owner/admin write aircraft_pricing"
  ON aircraft_pricing FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid()
      AND accepted_at IS NOT NULL
      AND role IN ('owner', 'admin')
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid()
      AND accepted_at IS NOT NULL
      AND role IN ('owner', 'admin')
  ));

CREATE OR REPLACE FUNCTION aircraft_pricing_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS aircraft_pricing_updated_at_trg ON aircraft_pricing;
CREATE TRIGGER aircraft_pricing_updated_at_trg
  BEFORE UPDATE ON aircraft_pricing
  FOR EACH ROW EXECUTE FUNCTION aircraft_pricing_set_updated_at();
