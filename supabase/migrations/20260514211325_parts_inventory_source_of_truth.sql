-- Parts & Inventory source-of-truth layer.
--
-- Existing tables are preserved:
-- - inventory_parts is the official stocked inventory table.
-- - parts_library is the older saved/library surface.
-- - part_offers / parts_searches are the external search layer.
-- - vendors and purchase_orders already exist.
--
-- This migration adds the missing SOP concepts without replacing the prior
-- records: canonical part identity, saved/watchlist parts, immutable stock
-- movement, RX receiving, returns/cores/warranty, vendor offers, search events,
-- analytics snapshots, and AI review metadata.

-- ---------------------------------------------------------------------------
-- 1. Canonical part identity and saved parts.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS part_master (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  part_number            TEXT NOT NULL,
  alternate_part_numbers TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  description            TEXT NOT NULL,
  category               TEXT,
  manufacturer           TEXT,
  certification_notes    TEXT,
  ata_code               TEXT REFERENCES ata_chapters(ata_code) ON DELETE SET NULL,
  jasc_code              TEXT REFERENCES jasc_codes(jasc_code) ON DELETE SET NULL,
  source                 TEXT NOT NULL DEFAULT 'manual'
                        CHECK (source IN ('manual', 'ai_search', 'image_extract', 'barcode', 'vendor_import', 'inventory', 'po', 'rx')),
  ai_review_state        TEXT NOT NULL DEFAULT 'human_reviewed'
                        CHECK (ai_review_state IN ('draft', 'suggested', 'needs_review', 'human_reviewed', 'rejected')),
  ai_confidence          TEXT NOT NULL DEFAULT 'unknown'
                        CHECK (ai_confidence IN ('high', 'medium', 'low', 'unknown')),
  metadata               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, part_number)
);

CREATE TABLE IF NOT EXISTS saved_parts (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  part_master_id         UUID REFERENCES part_master(id) ON DELETE SET NULL,
  aircraft_id            UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  source_part_offer_id   UUID REFERENCES part_offers(id) ON DELETE SET NULL,
  part_number            TEXT NOT NULL,
  title                  TEXT NOT NULL,
  description            TEXT,
  image_url              TEXT,
  category               TEXT,
  manufacturer           TEXT,
  condition              TEXT NOT NULL DEFAULT 'unknown'
                        CHECK (condition IN ('new', 'overhauled', 'serviceable', 'used', 'as_removed', 'refurbished', 'unknown')),
  preferred_vendor       TEXT,
  preferred_vendor_id    UUID REFERENCES vendors(id) ON DELETE SET NULL,
  vendor_url             TEXT,
  cost_price             NUMERIC(12,2) CHECK (cost_price IS NULL OR cost_price >= 0),
  selling_price          NUMERIC(12,2) CHECK (selling_price IS NULL OR selling_price >= 0),
  inventory_part_id      UUID REFERENCES inventory_parts(id) ON DELETE SET NULL,
  status                 TEXT NOT NULL DEFAULT 'saved'
                        CHECK (status IN ('saved', 'ordered', 'stocked', 'archived')),
  review_state           TEXT NOT NULL DEFAULT 'human_reviewed'
                        CHECK (review_state IN ('draft', 'suggested', 'needs_review', 'human_reviewed', 'rejected')),
  ai_confidence          TEXT NOT NULL DEFAULT 'unknown'
                        CHECK (ai_confidence IN ('high', 'medium', 'low', 'unknown')),
  notes                  TEXT,
  created_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_parts_unique_active
  ON saved_parts(organization_id, part_number, COALESCE(aircraft_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(preferred_vendor, ''))
  WHERE status <> 'archived';
CREATE INDEX IF NOT EXISTS idx_saved_parts_org ON saved_parts(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_parts_aircraft ON saved_parts(aircraft_id, created_at DESC) WHERE aircraft_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_part_master_taxonomy ON part_master(organization_id, ata_code, jasc_code);

-- Keep existing stocked inventory but add SOP-specific metadata.
ALTER TABLE inventory_parts
  ADD COLUMN IF NOT EXISTS part_master_id UUID REFERENCES part_master(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS saved_part_id UUID REFERENCES saved_parts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manufacturer TEXT,
  ADD COLUMN IF NOT EXISTS condition TEXT NOT NULL DEFAULT 'unknown'
    CHECK (condition IN ('new', 'overhauled', 'serviceable', 'used', 'as_removed', 'refurbished', 'unknown')),
  ADD COLUMN IF NOT EXISTS shelf_bin TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'in_stock'
    CHECK (status IN ('in_stock', 'at_min', 'low_stock', 'out_of_stock', 'on_order', 'expiring_due', 'archived')),
  ADD COLUMN IF NOT EXISTS source_method TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_method IN ('manual', 'ai_lookup', 'image_upload', 'barcode_scan', 'rx_receipt', 'import')),
  ADD COLUMN IF NOT EXISTS ai_confidence TEXT NOT NULL DEFAULT 'unknown'
    CHECK (ai_confidence IN ('high', 'medium', 'low', 'unknown')),
  ADD COLUMN IF NOT EXISTS expiration_or_due_date DATE,
  ADD COLUMN IF NOT EXISTS last_counted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_inventory_parts_master ON inventory_parts(part_master_id) WHERE part_master_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_parts_saved_part ON inventory_parts(saved_part_id) WHERE saved_part_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_parts_status ON inventory_parts(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_parts_due ON inventory_parts(organization_id, expiration_or_due_date) WHERE expiration_or_due_date IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Immutable stock movement ledger.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  inventory_part_id  UUID NOT NULL REFERENCES inventory_parts(id) ON DELETE CASCADE,
  aircraft_id        UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  transaction_type   TEXT NOT NULL
                     CHECK (transaction_type IN ('add', 'receive', 'adjust', 'issue', 'consume', 'return', 'core', 'void')),
  quantity_delta     NUMERIC(12,3) NOT NULL,
  quantity_after     NUMERIC(12,3),
  unit_cost          NUMERIC(12,2),
  source_type        TEXT,
  source_id          UUID,
  source_method      TEXT NOT NULL DEFAULT 'manual'
                     CHECK (source_method IN ('manual', 'image', 'barcode', 'ai_extract', 'import', 'vendor_integration', 'work_order', 'rx_receipt', 'return')),
  reason             TEXT,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_part ON inventory_transactions(inventory_part_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_org ON inventory_transactions(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_aircraft ON inventory_transactions(aircraft_id, created_at DESC) WHERE aircraft_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Vendor, PO, AI offer/search metadata.
-- ---------------------------------------------------------------------------

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('preferred', 'approved', 'pending', 'blocked', 'archived')),
  ADD COLUMN IF NOT EXISTS vendor_code TEXT,
  ADD COLUMN IF NOT EXISTS payment_terms TEXT,
  ADD COLUMN IF NOT EXISTS shipping_terms TEXT,
  ADD COLUMN IF NOT EXISTS avg_lead_time_days NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS on_time_delivery_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS total_spend_ytd NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_id_ein TEXT,
  ADD COLUMN IF NOT EXISTS ai_lookup_state TEXT NOT NULL DEFAULT 'manual'
    CHECK (ai_lookup_state IN ('manual', 'draft', 'needs_review', 'human_reviewed', 'rejected')),
  ADD COLUMN IF NOT EXISTS ai_confidence TEXT NOT NULL DEFAULT 'unknown'
    CHECK (ai_confidence IN ('high', 'medium', 'low', 'unknown')),
  ADD COLUMN IF NOT EXISTS risk_assessment JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS performance_summary TEXT;

CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(organization_id, status);

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS aircraft_id UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('ai_assist', 'import_upload', 'manual', 'reorder', 'low_stock', 'saved_part', 'work_order')),
  ADD COLUMN IF NOT EXISTS workflow_stage TEXT NOT NULL DEFAULT 'open'
    CHECK (workflow_stage IN ('open', 'processing', 'shipped', 'received', 'closed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS expected_delivery DATE,
  ADD COLUMN IF NOT EXISTS shipped_date DATE,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_draft_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_review_state TEXT NOT NULL DEFAULT 'human_reviewed'
    CHECK (ai_review_state IN ('draft', 'suggested', 'needs_review', 'human_reviewed', 'rejected')),
  ADD COLUMN IF NOT EXISTS ai_confidence TEXT NOT NULL DEFAULT 'unknown'
    CHECK (ai_confidence IN ('high', 'medium', 'low', 'unknown'));

ALTER TABLE purchase_order_lines
  ADD COLUMN IF NOT EXISTS part_master_id UUID REFERENCES part_master(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('ai_assist', 'import_upload', 'manual', 'reorder', 'low_stock', 'saved_part', 'vendor_offer')),
  ADD COLUMN IF NOT EXISTS source_id UUID,
  ADD COLUMN IF NOT EXISTS expected_delivery DATE,
  ADD COLUMN IF NOT EXISTS line_status TEXT NOT NULL DEFAULT 'open'
    CHECK (line_status IN ('open', 'ordered', 'partial', 'received', 'cancelled', 'returned')),
  ADD COLUMN IF NOT EXISTS ai_confidence TEXT NOT NULL DEFAULT 'unknown'
    CHECK (ai_confidence IN ('high', 'medium', 'low', 'unknown'));

CREATE INDEX IF NOT EXISTS idx_purchase_orders_aircraft ON purchase_orders(aircraft_id, created_at DESC) WHERE aircraft_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_workflow_stage ON purchase_orders(organization_id, workflow_stage);
CREATE INDEX IF NOT EXISTS idx_po_lines_part_master ON purchase_order_lines(part_master_id) WHERE part_master_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS part_vendor_offers (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  part_master_id         UUID REFERENCES part_master(id) ON DELETE SET NULL,
  saved_part_id          UUID REFERENCES saved_parts(id) ON DELETE SET NULL,
  inventory_part_id      UUID REFERENCES inventory_parts(id) ON DELETE SET NULL,
  source_part_offer_id   UUID REFERENCES part_offers(id) ON DELETE SET NULL,
  vendor_id              UUID REFERENCES vendors(id) ON DELETE SET NULL,
  vendor_name            TEXT NOT NULL,
  vendor_url             TEXT,
  part_number            TEXT NOT NULL,
  title                  TEXT NOT NULL,
  price                  NUMERIC(12,2),
  currency               TEXT NOT NULL DEFAULT 'USD',
  stock_label            TEXT,
  availability_count     NUMERIC(12,3),
  condition              TEXT,
  certification_labels   TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  compatibility_label    TEXT,
  confidence             NUMERIC(5,2),
  review_state           TEXT NOT NULL DEFAULT 'suggested'
                         CHECK (review_state IN ('suggested', 'needs_review', 'human_reviewed', 'rejected')),
  raw_payload            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS part_search_events (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id         UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  parts_search_id     UUID REFERENCES parts_searches(id) ON DELETE SET NULL,
  query_text          TEXT NOT NULL,
  normalized_query    TEXT,
  source_context      TEXT NOT NULL DEFAULT 'parts_inventory',
  result_count        INTEGER NOT NULL DEFAULT 0,
  selected_part_number TEXT,
  ai_context          JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_summary    JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_state        TEXT NOT NULL DEFAULT 'suggested'
                      CHECK (review_state IN ('suggested', 'needs_review', 'human_reviewed', 'rejected')),
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_part_vendor_offers_org ON part_vendor_offers(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_part_vendor_offers_part ON part_vendor_offers(part_number);
CREATE INDEX IF NOT EXISTS idx_part_search_events_org ON part_search_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_part_search_events_aircraft ON part_search_events(aircraft_id, created_at DESC) WHERE aircraft_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. RX receipts and returns / cores / warranty.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rx_receipts (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  receipt_number     TEXT NOT NULL,
  purchase_order_id  UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  vendor_id          UUID REFERENCES vendors(id) ON DELETE SET NULL,
  vendor_name        TEXT,
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'received', 'partial', 'void')),
  source_method      TEXT NOT NULL DEFAULT 'manual'
                     CHECK (source_method IN ('barcode_scan', 'image_upload', 'ai_extract', 'purchase_order', 'manual')),
  receipt_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  reference          TEXT,
  notes              TEXT,
  attachment_ids     UUID[] NOT NULL DEFAULT '{}'::UUID[],
  extraction_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_confidence      TEXT NOT NULL DEFAULT 'unknown'
                     CHECK (ai_confidence IN ('high', 'medium', 'low', 'unknown')),
  confirmed_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at       TIMESTAMPTZ,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, receipt_number)
);

CREATE TABLE IF NOT EXISTS rx_receipt_lines (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rx_receipt_id          UUID NOT NULL REFERENCES rx_receipts(id) ON DELETE CASCADE,
  purchase_order_line_id UUID REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
  inventory_part_id      UUID REFERENCES inventory_parts(id) ON DELETE SET NULL,
  part_master_id         UUID REFERENCES part_master(id) ON DELETE SET NULL,
  part_number            TEXT NOT NULL,
  description            TEXT,
  quantity_received      NUMERIC(12,3) NOT NULL CHECK (quantity_received >= 0),
  unit_cost              NUMERIC(12,2),
  confidence             TEXT NOT NULL DEFAULT 'unknown'
                         CHECK (confidence IN ('high', 'medium', 'low', 'unknown')),
  review_state           TEXT NOT NULL DEFAULT 'human_reviewed'
                         CHECK (review_state IN ('draft', 'suggested', 'needs_review', 'human_reviewed', 'rejected')),
  metadata               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS return_records (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  return_number      TEXT NOT NULL,
  rx_receipt_id      UUID REFERENCES rx_receipts(id) ON DELETE SET NULL,
  purchase_order_id  UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  vendor_id          UUID REFERENCES vendors(id) ON DELETE SET NULL,
  vendor_name        TEXT,
  source_type        TEXT NOT NULL DEFAULT 'manual'
                     CHECK (source_type IN ('receipt', 'inventory', 'manual')),
  return_type        TEXT NOT NULL DEFAULT 'defective'
                     CHECK (return_type IN ('defective', 'warranty', 'credit', 'core', 'wrong_part')),
  status             TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'approved', 'shipped', 'received', 'credit_issued', 'replacement_received', 'closed', 'void')),
  reason             TEXT NOT NULL,
  notes              TEXT,
  total_value        NUMERIC(12,2) NOT NULL DEFAULT 0,
  attachment_ids     UUID[] NOT NULL DEFAULT '{}'::UUID[],
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, return_number)
);

CREATE TABLE IF NOT EXISTS return_lines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_record_id  UUID NOT NULL REFERENCES return_records(id) ON DELETE CASCADE,
  rx_receipt_line_id UUID REFERENCES rx_receipt_lines(id) ON DELETE SET NULL,
  inventory_part_id UUID REFERENCES inventory_parts(id) ON DELETE SET NULL,
  part_master_id    UUID REFERENCES part_master(id) ON DELETE SET NULL,
  part_number       TEXT NOT NULL,
  description       TEXT,
  quantity_returned NUMERIC(12,3) NOT NULL CHECK (quantity_returned > 0),
  unit_value        NUMERIC(12,2) NOT NULL DEFAULT 0,
  reason            TEXT,
  disposition       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rx_receipts_org ON rx_receipts(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rx_receipts_po ON rx_receipts(purchase_order_id, created_at DESC) WHERE purchase_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rx_receipt_lines_receipt ON rx_receipt_lines(rx_receipt_id);
CREATE INDEX IF NOT EXISTS idx_return_records_org ON return_records(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_return_records_vendor ON return_records(vendor_id, created_at DESC) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_return_lines_return ON return_lines(return_record_id);

-- ---------------------------------------------------------------------------
-- 5. Analytics snapshots.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inventory_analytics_snapshots (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  snapshot_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  location               TEXT,
  vendor_id              UUID REFERENCES vendors(id) ON DELETE SET NULL,
  category               TEXT,
  aircraft_id            UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  inventory_value        NUMERIC(14,2) NOT NULL DEFAULT 0,
  parts_turnover         NUMERIC(8,2) NOT NULL DEFAULT 0,
  fill_rate_pct          NUMERIC(5,2) NOT NULL DEFAULT 0,
  stockouts              INTEGER NOT NULL DEFAULT 0,
  total_receipts         INTEGER NOT NULL DEFAULT 0,
  total_returns          INTEGER NOT NULL DEFAULT 0,
  low_stock_count        INTEGER NOT NULL DEFAULT 0,
  slow_moving_count      INTEGER NOT NULL DEFAULT 0,
  metrics                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_analytics_org ON inventory_analytics_snapshots(organization_id, snapshot_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_analytics_scope_unique
  ON inventory_analytics_snapshots(
    organization_id,
    snapshot_date,
    COALESCE(location, ''),
    COALESCE(vendor_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(category, ''),
    COALESCE(aircraft_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- ---------------------------------------------------------------------------
-- 6. RLS, grants, triggers, and comments.
-- ---------------------------------------------------------------------------

ALTER TABLE part_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE part_vendor_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE part_search_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE rx_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rx_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_analytics_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'part_master',
    'saved_parts',
    'inventory_transactions',
    'part_vendor_offers',
    'part_search_events',
    'rx_receipts',
    'return_records',
    'inventory_analytics_snapshots'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_org_read', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_org_write', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (organization_id = ANY(get_my_org_ids()))',
      tbl || '_org_read',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (has_org_role(organization_id, ARRAY[''owner'', ''admin'', ''mechanic''])) WITH CHECK (has_org_role(organization_id, ARRAY[''owner'', ''admin'', ''mechanic'']))',
      tbl || '_org_write',
      tbl
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS rx_receipt_lines_org_read ON rx_receipt_lines;
DROP POLICY IF EXISTS rx_receipt_lines_org_write ON rx_receipt_lines;
CREATE POLICY rx_receipt_lines_org_read ON rx_receipt_lines
  FOR SELECT
  USING (rx_receipt_id IN (SELECT id FROM rx_receipts WHERE organization_id = ANY(get_my_org_ids())));
CREATE POLICY rx_receipt_lines_org_write ON rx_receipt_lines
  FOR ALL
  USING (rx_receipt_id IN (SELECT id FROM rx_receipts WHERE has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic'])))
  WITH CHECK (rx_receipt_id IN (SELECT id FROM rx_receipts WHERE has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic'])));

DROP POLICY IF EXISTS return_lines_org_read ON return_lines;
DROP POLICY IF EXISTS return_lines_org_write ON return_lines;
CREATE POLICY return_lines_org_read ON return_lines
  FOR SELECT
  USING (return_record_id IN (SELECT id FROM return_records WHERE organization_id = ANY(get_my_org_ids())));
CREATE POLICY return_lines_org_write ON return_lines
  FOR ALL
  USING (return_record_id IN (SELECT id FROM return_records WHERE has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic'])))
  WITH CHECK (return_record_id IN (SELECT id FROM return_records WHERE has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic'])));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  part_master,
  saved_parts,
  inventory_transactions,
  part_vendor_offers,
  part_search_events,
  rx_receipts,
  rx_receipt_lines,
  return_records,
  return_lines,
  inventory_analytics_snapshots
TO authenticated;

CREATE OR REPLACE FUNCTION trg_parts_inventory_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS part_master_set_updated_at ON part_master;
DROP TRIGGER IF EXISTS saved_parts_set_updated_at ON saved_parts;
DROP TRIGGER IF EXISTS rx_receipts_set_updated_at ON rx_receipts;
DROP TRIGGER IF EXISTS return_records_set_updated_at ON return_records;

CREATE TRIGGER part_master_set_updated_at BEFORE UPDATE ON part_master FOR EACH ROW EXECUTE FUNCTION trg_parts_inventory_set_updated_at();
CREATE TRIGGER saved_parts_set_updated_at BEFORE UPDATE ON saved_parts FOR EACH ROW EXECUTE FUNCTION trg_parts_inventory_set_updated_at();
CREATE TRIGGER rx_receipts_set_updated_at BEFORE UPDATE ON rx_receipts FOR EACH ROW EXECUTE FUNCTION trg_parts_inventory_set_updated_at();
CREATE TRIGGER return_records_set_updated_at BEFORE UPDATE ON return_records FOR EACH ROW EXECUTE FUNCTION trg_parts_inventory_set_updated_at();

COMMENT ON TABLE part_master IS 'Canonical part identity for Parts & Inventory. Saved parts and stock rows can reference this without duplicating title data.';
COMMENT ON TABLE saved_parts IS 'Saved/watchlist parts. A saved part is not official inventory until converted into inventory_parts.';
COMMENT ON TABLE inventory_transactions IS 'Immutable stock movement ledger for add, receive, adjust, issue, consume, return, and core events.';
COMMENT ON TABLE rx_receipts IS 'Receiving workflow records for PO/manual receipt, barcode/image/AI extraction, and confirmation.';
COMMENT ON TABLE return_records IS 'Return, RMA, warranty, credit, wrong-part, and core return headers.';
COMMENT ON TABLE inventory_analytics_snapshots IS 'Materialized inventory performance snapshots for dashboard and reporting drilldowns.';
