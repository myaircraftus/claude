-- Sprint 0a — Multi-Org / Multi-Location data model (Feature 0.1)
--
-- Path B adaptation: spec calls for localStorage-keyed state. We're keeping
-- the existing Supabase backend, so this migration:
--   1. Creates `locations` (org-scoped hierarchy: org → location → optional sub-location).
--   2. Extends `organizations` with the spec's missing fields (org_type, home_base,
--      billing_email). We use `org_type` (not `type`) because `type` clashes with
--      Postgres reserved words in some clients.
--   3. Adds nullable `location_id` to the six primary user-facing entities listed in
--      Feature 0.1: aircraft, work_orders, invoices, logbook_entries, customers, documents.
--      Phase 1–3 entities will get `location_id` when their sprints land — per the
--      "add don't replace" hard rule, we don't proactively touch tables that
--      Feature 0.1 doesn't list.
--   4. RLS: locations are scoped to org membership (mirrors aircraft policy).

-- ─── 1. organizations: add type / home_base / billing_email ──────────────────
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS org_type      TEXT
    CHECK (org_type IN ('owner', 'shop', 'flight-school', 'fbo', 'operator')),
  ADD COLUMN IF NOT EXISTS home_base     TEXT,
  ADD COLUMN IF NOT EXISTS billing_email TEXT;

COMMENT ON COLUMN organizations.org_type     IS 'Org persona: owner-operator | shop | flight-school | fbo | operator (Spec 0.1).';
COMMENT ON COLUMN organizations.home_base    IS 'Primary airport ICAO/IATA (e.g. KAPA).';
COMMENT ON COLUMN organizations.billing_email IS 'Billing contact email — Stripe invoice destination.';

-- ─── 2. locations table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS locations (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,                 -- "KAPA Hangar 14"
  airport_code        TEXT,                          -- "KAPA"
  location_type       TEXT NOT NULL DEFAULT 'hangar'
    CHECK (location_type IN ('hangar', 'tie-down', 'ramp', 'shop', 'office')),
  address             TEXT,
  parent_location_id  UUID REFERENCES locations(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_locations_org           ON locations(organization_id);
CREATE INDEX IF NOT EXISTS idx_locations_parent        ON locations(parent_location_id);
CREATE INDEX IF NOT EXISTS idx_locations_airport_code  ON locations(airport_code);

-- ─── 3. RLS on locations (mirror aircraft policy) ───────────────────────────
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS locations_org_member_read   ON locations;
DROP POLICY IF EXISTS locations_org_member_write  ON locations;

CREATE POLICY locations_org_member_read ON locations
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

CREATE POLICY locations_org_member_write ON locations
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

-- ─── 4. updated_at trigger on locations ─────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_locations_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS locations_set_updated_at ON locations;
CREATE TRIGGER locations_set_updated_at
  BEFORE UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION trg_locations_set_updated_at();

-- ─── 5. Add location_id to the six primary entities from Spec 0.1 ───────────
-- Nullable + ON DELETE SET NULL so deleting a location doesn't cascade-kill
-- the underlying record. Records without a location are "org-wide".
ALTER TABLE aircraft         ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE SET NULL;
ALTER TABLE work_orders      ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE SET NULL;
ALTER TABLE invoices         ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE SET NULL;
ALTER TABLE logbook_entries  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE SET NULL;
ALTER TABLE customers        ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE SET NULL;
ALTER TABLE documents        ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_aircraft_location         ON aircraft(location_id)        WHERE location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_orders_location      ON work_orders(location_id)     WHERE location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_location         ON invoices(location_id)        WHERE location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_logbook_entries_location  ON logbook_entries(location_id) WHERE location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_location        ON customers(location_id)       WHERE location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_location        ON documents(location_id)       WHERE location_id IS NOT NULL;

COMMENT ON COLUMN aircraft.location_id        IS 'Optional location within the org (Spec 0.1 multi-location).';
COMMENT ON COLUMN work_orders.location_id     IS 'Optional location within the org (Spec 0.1 multi-location).';
COMMENT ON COLUMN invoices.location_id        IS 'Optional location within the org (Spec 0.1 multi-location).';
COMMENT ON COLUMN logbook_entries.location_id IS 'Optional location within the org (Spec 0.1 multi-location).';
COMMENT ON COLUMN customers.location_id       IS 'Optional location within the org (Spec 0.1 multi-location).';
COMMENT ON COLUMN documents.location_id       IS 'Optional location within the org (Spec 0.1 multi-location).';
