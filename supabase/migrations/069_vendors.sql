-- Migration 069: Vendor Management (Spec 2.2)
--
-- Vendors back-reference parts, POs, outside-service WO lines, and
-- warranties (future). Spec calls for the existing free-text `vendor`
-- columns on inventory_parts (068), purchase_orders (068), and
-- work_order_lines (016) to become Vendor IDs.
--
-- Path B: per "add, don't replace", we keep the legacy TEXT columns and
-- add NULLABLE `vendor_id` FK columns alongside them. Application code
-- prefers vendor_id when present, falls back to vendor TEXT. A future
-- cross-cutting cleanup can fold the strings into vendor_ids and drop
-- the legacy columns.

-- ─── 1. vendors ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vendors (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  vendor_type     TEXT NOT NULL DEFAULT 'parts'
    CHECK (vendor_type IN ('parts', 'osr', 'service', 'freight', 'other')),
  -- "approved-vendor-only" enforcement (spec §Types). Operator can flag
  -- a vendor as approved; future WO-line policy can refuse OSR rows that
  -- reference a non-approved vendor.
  approved        BOOLEAN NOT NULL DEFAULT FALSE,
  -- Contact + address fields. All optional — operators have varying
  -- levels of detail per vendor.
  address         TEXT,
  phone           TEXT,
  website         TEXT,
  contact_name    TEXT,
  contact_email   TEXT,
  description     TEXT,
  -- Soft-archive instead of delete; vendor_id may be referenced by old
  -- POs / parts / WO lines.
  is_archived     BOOLEAN NOT NULL DEFAULT FALSE,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One vendor name per org. (Different orgs can each have their own
  -- "Aircraft Spruce" entry — names aren't globally unique.)
  UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_vendors_org      ON vendors(organization_id, name);
CREATE INDEX IF NOT EXISTS idx_vendors_type     ON vendors(organization_id, vendor_type);
CREATE INDEX IF NOT EXISTS idx_vendors_approved ON vendors(organization_id) WHERE approved = TRUE AND is_archived = FALSE;

-- ─── 2. ALTERs: add vendor_id to the three back-referencing tables ─────────
-- All NULLABLE; ON DELETE SET NULL preserves history if a vendor is later
-- hard-deleted (we encourage archive over hard-delete, but the FK behavior
-- still needs to be safe).

ALTER TABLE inventory_parts
  ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL;

ALTER TABLE work_order_lines
  ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_parts_vendor   ON inventory_parts(vendor_id)  WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor   ON purchase_orders(vendor_id)  WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_order_lines_vendor  ON work_order_lines(vendor_id) WHERE vendor_id IS NOT NULL;

COMMENT ON COLUMN inventory_parts.vendor_id  IS 'Optional FK to vendors (Spec 2.2). Coexists with legacy `vendor TEXT` for back-compat.';
COMMENT ON COLUMN purchase_orders.vendor_id  IS 'Optional FK to vendors (Spec 2.2). Coexists with legacy `vendor TEXT` for back-compat.';
COMMENT ON COLUMN work_order_lines.vendor_id IS 'Optional FK to vendors (Spec 2.2). Used by outside_service line_type for OSR vendor linkage.';

-- ─── 3. RLS ────────────────────────────────────────────────────────────────

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendors_org_read  ON vendors;
DROP POLICY IF EXISTS vendors_org_write ON vendors;

CREATE POLICY vendors_org_read ON vendors
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

CREATE POLICY vendors_org_write ON vendors
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

-- ─── 4. updated_at trigger ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_vendors_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS vendors_set_updated_at ON vendors;
CREATE TRIGGER vendors_set_updated_at
  BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION trg_vendors_set_updated_at();

-- ─── 5. Comments ───────────────────────────────────────────────────────────

COMMENT ON TABLE vendors IS 'Vendor master (Spec 2.2). Back-references parts, POs, outside-service WO lines.';
