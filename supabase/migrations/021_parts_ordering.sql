-- Migration 021: Parts Ordering (Atlas Network)
-- Adds normalized offers, click-out order records, events, and work-order parts
-- Extends existing parts_searches table (created in 016) with richer columns.
-- See: mark downs/17. myaircraft_atlas_parts_network_master_prompt.md

-- ============================================================
-- 1. EXTEND parts_searches (add normalized columns)
-- ============================================================
ALTER TABLE parts_searches
  ADD COLUMN IF NOT EXISTS normalized_query       TEXT,
  ADD COLUMN IF NOT EXISTS search_mode            TEXT NOT NULL DEFAULT 'general'
    CHECK (search_mode IN ('exact_part','general','keyword','contextual')),
  ADD COLUMN IF NOT EXISTS provider_summary       JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS result_count           INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS maintenance_draft_id   UUID;

-- ============================================================
-- 2. part_offers
-- ============================================================
CREATE TABLE IF NOT EXISTS part_offers (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  part_search_id          UUID NOT NULL REFERENCES parts_searches(id) ON DELETE CASCADE,
  organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id             UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  work_order_id           UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  provider                TEXT NOT NULL,            -- 'serpapi','ebay','curated'
  source_type             TEXT NOT NULL,            -- 'google_shopping','ebay_browse','aviation_vendor'
  external_offer_id       TEXT,
  query_text              TEXT NOT NULL,
  title                   TEXT NOT NULL,
  part_number             TEXT,
  brand                   TEXT,
  description             TEXT,
  image_url               TEXT,
  product_url             TEXT NOT NULL,
  vendor_name             TEXT NOT NULL,
  vendor_domain           TEXT,
  vendor_location         TEXT,
  price                   NUMERIC(12,2),
  currency                TEXT,
  shipping_price          NUMERIC(12,2),
  total_estimated_price   NUMERIC(12,2),
  shipping_speed_label    TEXT,
  condition               TEXT,                     -- 'new','overhauled','serviceable','used','as-removed','unknown'
  stock_label             TEXT,
  rating                  NUMERIC(4,2),
  rating_count            INT,
  certifications          TEXT[],                   -- ['8130-3','FAA-PMA','EASA']
  compatibility_text      TEXT[],
  badges                  TEXT[],                   -- ['aviation_vendor','ships_fast']
  rank_score              NUMERIC(8,4),
  sort_bucket             TEXT,                     -- 'aviation_trusted','general_marketplace','uncertain'
  raw_payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_part_offers_search       ON part_offers(part_search_id);
CREATE INDEX IF NOT EXISTS idx_part_offers_org          ON part_offers(organization_id);
CREATE INDEX IF NOT EXISTS idx_part_offers_aircraft     ON part_offers(aircraft_id) WHERE aircraft_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_part_offers_wo           ON part_offers(work_order_id) WHERE work_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_part_offers_part_number  ON part_offers(part_number) WHERE part_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_part_offers_vendor       ON part_offers(vendor_name);
CREATE INDEX IF NOT EXISTS idx_part_offers_created_at   ON part_offers(organization_id, created_at DESC);

ALTER TABLE part_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "part_offers_select" ON part_offers;
DROP POLICY IF EXISTS "part_offers_insert" ON part_offers;
DROP POLICY IF EXISTS "part_offers_update" ON part_offers;
DROP POLICY IF EXISTS "part_offers_delete" ON part_offers;
CREATE POLICY "part_offers_select" ON part_offers FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "part_offers_insert" ON part_offers FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "part_offers_update" ON part_offers FOR UPDATE
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "part_offers_delete" ON part_offers FOR DELETE
  USING (has_org_role(organization_id, ARRAY['owner','admin']));

-- ============================================================
-- 3. part_order_records (click-out / mark-ordered)
-- ============================================================
CREATE TABLE IF NOT EXISTS part_order_records (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id              UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  work_order_id            UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  maintenance_draft_id     UUID,
  part_search_id           UUID REFERENCES parts_searches(id) ON DELETE SET NULL,
  part_offer_id            UUID REFERENCES part_offers(id) ON DELETE SET NULL,
  user_id                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status                   TEXT NOT NULL DEFAULT 'clicked_out'
    CHECK (status IN (
      'draft','clicked_out','marked_ordered','confirmed',
      'shipped','delivered','received','installed','cancelled'
    )),
  quantity                 INT NOT NULL DEFAULT 1,
  unit_price               NUMERIC(12,2),
  shipping_price           NUMERIC(12,2),
  total_price              NUMERIC(12,2),
  currency                 TEXT,
  vendor_name              TEXT,
  vendor_url               TEXT,
  vendor_order_reference   TEXT,
  internal_note            TEXT,
  selected_part_number     TEXT,
  selected_title           TEXT,
  selected_condition       TEXT,
  selected_image_url       TEXT,
  expected_for_use         TEXT,
  ordered_at               TIMESTAMPTZ,
  shipped_at               TIMESTAMPTZ,
  delivered_at             TIMESTAMPTZ,
  installed_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_part_orders_org          ON part_order_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_part_orders_aircraft     ON part_order_records(aircraft_id) WHERE aircraft_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_part_orders_wo           ON part_order_records(work_order_id) WHERE work_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_part_orders_status       ON part_order_records(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_part_orders_user         ON part_order_records(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_part_orders_created_at   ON part_order_records(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_part_orders_part_number  ON part_order_records(selected_part_number) WHERE selected_part_number IS NOT NULL;

ALTER TABLE part_order_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "part_order_records_select" ON part_order_records;
DROP POLICY IF EXISTS "part_order_records_insert" ON part_order_records;
DROP POLICY IF EXISTS "part_order_records_update" ON part_order_records;
DROP POLICY IF EXISTS "part_order_records_delete" ON part_order_records;
CREATE POLICY "part_order_records_select" ON part_order_records FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "part_order_records_insert" ON part_order_records FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "part_order_records_update" ON part_order_records FOR UPDATE
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "part_order_records_delete" ON part_order_records FOR DELETE
  USING (has_org_role(organization_id, ARRAY['owner','admin']));

-- ============================================================
-- 4. part_order_events (activity log)
-- ============================================================
CREATE TABLE IF NOT EXISTS part_order_events (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  part_order_record_id UUID NOT NULL REFERENCES part_order_records(id) ON DELETE CASCADE,
  user_id              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type           TEXT NOT NULL,
  -- event_type examples:
  --   'created','clicked_out','marked_ordered','status_changed',
  --   'ship_info_added','cancelled','attached_to_work_order','note_added'
  metadata_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_part_order_events_order ON part_order_events(part_order_record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_part_order_events_org   ON part_order_events(organization_id);

ALTER TABLE part_order_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "part_order_events_select" ON part_order_events;
DROP POLICY IF EXISTS "part_order_events_insert" ON part_order_events;
CREATE POLICY "part_order_events_select" ON part_order_events FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "part_order_events_insert" ON part_order_events FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));

-- ============================================================
-- 5. work_order_parts (line items attached to work orders)
-- NOTE: may pre-exist with legacy columns. This block adds the columns
-- we need for the Atlas parts-ordering flow idempotently.
-- ============================================================
CREATE TABLE IF NOT EXISTS work_order_parts (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  work_order_id          UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  quantity               INT NOT NULL DEFAULT 1,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE work_order_parts
  ADD COLUMN IF NOT EXISTS aircraft_id          UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS part_order_record_id UUID REFERENCES part_order_records(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS part_offer_id        UUID REFERENCES part_offers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS part_number          TEXT,
  ADD COLUMN IF NOT EXISTS title                TEXT,
  ADD COLUMN IF NOT EXISTS unit_cost            NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS total_cost           NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS status               TEXT NOT NULL DEFAULT 'planned',
  ADD COLUMN IF NOT EXISTS source               TEXT,
  ADD COLUMN IF NOT EXISTS note                 TEXT,
  ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Add status check constraint if missing (drop first in case it has different values)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'work_order_parts_status_check'
  ) THEN
    ALTER TABLE work_order_parts
      ADD CONSTRAINT work_order_parts_status_check
      CHECK (status IN ('planned','ordered','received','installed','cancelled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wo_parts_wo           ON work_order_parts(work_order_id);
CREATE INDEX IF NOT EXISTS idx_wo_parts_org          ON work_order_parts(organization_id);
CREATE INDEX IF NOT EXISTS idx_wo_parts_aircraft     ON work_order_parts(aircraft_id) WHERE aircraft_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wo_parts_part_number  ON work_order_parts(part_number) WHERE part_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wo_parts_status       ON work_order_parts(organization_id, status);

ALTER TABLE work_order_parts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_order_parts_select" ON work_order_parts;
DROP POLICY IF EXISTS "work_order_parts_insert" ON work_order_parts;
DROP POLICY IF EXISTS "work_order_parts_update" ON work_order_parts;
DROP POLICY IF EXISTS "work_order_parts_delete" ON work_order_parts;
CREATE POLICY "work_order_parts_select" ON work_order_parts FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "work_order_parts_insert" ON work_order_parts FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "work_order_parts_update" ON work_order_parts FOR UPDATE
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "work_order_parts_delete" ON work_order_parts FOR DELETE
  USING (has_org_role(organization_id, ARRAY['owner','admin','mechanic']));

-- ============================================================
-- 6. Triggers: updated_at on part_order_records + work_order_parts
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at_parts()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_part_order_records_updated ON part_order_records;
CREATE TRIGGER trg_part_order_records_updated
  BEFORE UPDATE ON part_order_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_parts();

DROP TRIGGER IF EXISTS trg_work_order_parts_updated ON work_order_parts;
CREATE TRIGGER trg_work_order_parts_updated
  BEFORE UPDATE ON work_order_parts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_parts();
