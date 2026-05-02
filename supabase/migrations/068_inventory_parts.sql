-- Migration 068: Parts Inventory + Purchase Orders (Spec 2.1)
--
-- Three tables + one ALTER on work_order_lines (016):
--   inventory_parts        — local org inventory with qty + reorder threshold
--   purchase_orders        — PO header with auto-numbered po_number
--   purchase_order_lines   — PO line items, FK to inventory_parts
--   work_order_lines       — gains optional inventory_part_id FK to bridge
--                             WO line consumption to local inventory
--
-- Path B: existing parts_searches + part_offers (021) is the EXTERNAL parts
-- catalog (Atlas Network — Google Shopping, eBay). Different concept; left
-- untouched. inventory_parts is the operator's *local* shop inventory.

-- ─── 1. inventory_parts ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_parts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  part_number     TEXT NOT NULL,                 -- "SP-12345"
  alt_part_numbers TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  description     TEXT NOT NULL,
  category        TEXT,
  qty_on_hand     NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (qty_on_hand >= 0),
  min_on_hand     NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (min_on_hand >= 0),
  unit_cost       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  unit_price      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  vendor          TEXT,
  location        TEXT,                          -- shelf / bin / room
  part_class      TEXT NOT NULL DEFAULT 'consumable'
    CHECK (part_class IN ('consumable', 'rotable', 'serialized')),
  files           TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  alert_emails    TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  is_archived     BOOLEAN NOT NULL DEFAULT FALSE,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Same part number can appear in multiple orgs but only once per org.
  UNIQUE (organization_id, part_number)
);

CREATE INDEX IF NOT EXISTS idx_inventory_parts_org      ON inventory_parts(organization_id, part_number);
CREATE INDEX IF NOT EXISTS idx_inventory_parts_low      ON inventory_parts(organization_id)
  WHERE is_archived = FALSE AND qty_on_hand <= min_on_hand;
-- GIN index for cheap @> queries on alt part numbers.
CREATE INDEX IF NOT EXISTS idx_inventory_parts_alt_pn   ON inventory_parts USING GIN(alt_part_numbers);
-- Trigram-style fuzzy matching is overkill for v0; simple contains-by-pattern.
CREATE INDEX IF NOT EXISTS idx_inventory_parts_desc_trgm ON inventory_parts(organization_id, lower(description));

-- ─── 2. purchase_orders ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS purchase_orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- "PO-2026-0001" — generated server-side via lib/inventory/po-numbers.ts
  -- against this row's organization_id. UNIQUE (organization_id, po_number).
  po_number       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open-request', 'ordered', 'partially-fulfilled', 'fulfilled', 'cancelled')),
  vendor          TEXT NOT NULL,
  requested_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  ordered_date    DATE,
  fulfilled_date  DATE,
  -- Computed by application code from the sum of (qty_ordered * unit_cost)
  -- on lines; stored on the header for cheap list views.
  approximate_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  description     TEXT,
  receipt_urls    TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, po_number)
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_org    ON purchase_orders(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(organization_id, status);

-- ─── 3. purchase_order_lines ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_order_id  UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  -- FK to inventory_parts is REQUIRED — POs are how you restock inventory,
  -- so the part must exist (operator creates the part first if it's new).
  inventory_part_id  UUID NOT NULL REFERENCES inventory_parts(id) ON DELETE RESTRICT,
  qty_ordered        NUMERIC(12,3) NOT NULL CHECK (qty_ordered > 0),
  qty_received       NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
  unit_cost          NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  notes              TEXT,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_lines_po   ON purchase_order_lines(purchase_order_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_po_lines_part ON purchase_order_lines(inventory_part_id);

-- ─── 4. work_order_lines.inventory_part_id ──────────────────────────────────
-- Bridges the WO surface to local inventory. NULLABLE because a WO can still
-- reference a part by number-string for one-off external purchases. ON DELETE
-- SET NULL preserves history if a part is later archived/deleted.
ALTER TABLE work_order_lines
  ADD COLUMN IF NOT EXISTS inventory_part_id UUID REFERENCES inventory_parts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wo_lines_inventory_part
  ON work_order_lines(inventory_part_id) WHERE inventory_part_id IS NOT NULL;

COMMENT ON COLUMN work_order_lines.inventory_part_id IS
  'Optional bridge to inventory_parts (Spec 2.1). When set, the WO line participates in inventory consumption — see lib/inventory/consume.ts.';

-- ─── 5. RLS ────────────────────────────────────────────────────────────────

ALTER TABLE inventory_parts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_lines   ENABLE ROW LEVEL SECURITY;

-- inventory_parts: org-member read; mechanic+/admin/owner write.
DROP POLICY IF EXISTS inventory_parts_org_read  ON inventory_parts;
DROP POLICY IF EXISTS inventory_parts_org_write ON inventory_parts;

CREATE POLICY inventory_parts_org_read ON inventory_parts
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

CREATE POLICY inventory_parts_org_write ON inventory_parts
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

-- purchase_orders: org-member read; mechanic+/admin/owner write.
DROP POLICY IF EXISTS purchase_orders_org_read  ON purchase_orders;
DROP POLICY IF EXISTS purchase_orders_org_write ON purchase_orders;

CREATE POLICY purchase_orders_org_read ON purchase_orders
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

CREATE POLICY purchase_orders_org_write ON purchase_orders
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

-- purchase_order_lines: gated through parent purchase_orders org.
DROP POLICY IF EXISTS po_lines_org_read  ON purchase_order_lines;
DROP POLICY IF EXISTS po_lines_org_write ON purchase_order_lines;

CREATE POLICY po_lines_org_read ON purchase_order_lines
  FOR SELECT
  USING (
    purchase_order_id IN (
      SELECT id FROM purchase_orders
      WHERE organization_id IN (
        SELECT organization_id FROM organization_memberships
        WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
      )
    )
  );

CREATE POLICY po_lines_org_write ON purchase_order_lines
  FOR ALL
  USING (
    purchase_order_id IN (
      SELECT id FROM purchase_orders
      WHERE organization_id IN (
        SELECT organization_id FROM organization_memberships
        WHERE user_id = auth.uid()
          AND accepted_at IS NOT NULL
          AND role IN ('owner', 'admin', 'mechanic')
      )
    )
  )
  WITH CHECK (
    purchase_order_id IN (
      SELECT id FROM purchase_orders
      WHERE organization_id IN (
        SELECT organization_id FROM organization_memberships
        WHERE user_id = auth.uid()
          AND accepted_at IS NOT NULL
          AND role IN ('owner', 'admin', 'mechanic')
      )
    )
  );

-- ─── 6. updated_at triggers ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_inventory_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS inventory_parts_set_updated_at ON inventory_parts;
DROP TRIGGER IF EXISTS purchase_orders_set_updated_at ON purchase_orders;
DROP TRIGGER IF EXISTS po_lines_set_updated_at        ON purchase_order_lines;

CREATE TRIGGER inventory_parts_set_updated_at BEFORE UPDATE ON inventory_parts      FOR EACH ROW EXECUTE FUNCTION trg_inventory_set_updated_at();
CREATE TRIGGER purchase_orders_set_updated_at BEFORE UPDATE ON purchase_orders      FOR EACH ROW EXECUTE FUNCTION trg_inventory_set_updated_at();
CREATE TRIGGER po_lines_set_updated_at        BEFORE UPDATE ON purchase_order_lines FOR EACH ROW EXECUTE FUNCTION trg_inventory_set_updated_at();

-- ─── 7. Comments ───────────────────────────────────────────────────────────

COMMENT ON TABLE  inventory_parts      IS 'Local org parts inventory (Spec 2.1). Distinct from external Atlas catalog (parts_searches/part_offers, 021).';
COMMENT ON TABLE  purchase_orders      IS 'PO headers with auto-numbered po_number (Spec 2.1).';
COMMENT ON TABLE  purchase_order_lines IS 'PO line items, FK to inventory_parts. Fulfillment increments inventory.qty_on_hand.';
COMMENT ON COLUMN inventory_parts.alert_emails IS 'Recipients for low-stock notifications. Cross-wires to Sprint 0d notifications.';
