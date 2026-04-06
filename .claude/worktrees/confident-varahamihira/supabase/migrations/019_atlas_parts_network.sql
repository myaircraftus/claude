-- Migration 019: Atlas Parts Network
-- Adds parts search/ordering/tracking tables for the Atlas Parts Network feature.
-- Existing parts_searches table (from 016) is the chat-context version; these are
-- the full-featured Atlas tables.

-- ============================================================
-- 1. ATLAS PART SEARCHES
-- Tracks each search query + provider summary
-- ============================================================
CREATE TABLE atlas_part_searches (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id          UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  work_order_id        UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  maintenance_draft_id UUID,
  user_id              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  query_text           TEXT NOT NULL,
  normalized_query     TEXT,
  search_mode          TEXT NOT NULL DEFAULT 'general'
                       CHECK (search_mode IN ('exact_part','general','keyword','contextual')),
  provider_summary     JSONB NOT NULL DEFAULT '{}',
  result_count         INT NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_atlas_searches_org         ON atlas_part_searches(organization_id);
CREATE INDEX idx_atlas_searches_aircraft    ON atlas_part_searches(aircraft_id) WHERE aircraft_id IS NOT NULL;
CREATE INDEX idx_atlas_searches_work_order  ON atlas_part_searches(work_order_id) WHERE work_order_id IS NOT NULL;
CREATE INDEX idx_atlas_searches_user        ON atlas_part_searches(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_atlas_searches_created_at  ON atlas_part_searches(organization_id, created_at DESC);

ALTER TABLE atlas_part_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "atlas_searches_select" ON atlas_part_searches FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "atlas_searches_insert" ON atlas_part_searches FOR INSERT
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));
CREATE POLICY "atlas_searches_update" ON atlas_part_searches FOR UPDATE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

-- ============================================================
-- 2. ATLAS PART OFFERS
-- Each normalized offer returned from a provider for a search
-- ============================================================
CREATE TABLE atlas_part_offers (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  part_search_id        UUID NOT NULL REFERENCES atlas_part_searches(id) ON DELETE CASCADE,
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id           UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  work_order_id         UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  provider              TEXT NOT NULL,
  source_type           TEXT NOT NULL CHECK (source_type IN ('serp','marketplace','vendor')),
  external_offer_id     TEXT,
  query_text            TEXT NOT NULL,
  title                 TEXT NOT NULL,
  part_number           TEXT,
  brand                 TEXT,
  description           TEXT,
  image_url             TEXT,
  product_url           TEXT NOT NULL,
  vendor_name           TEXT NOT NULL,
  vendor_domain         TEXT,
  vendor_location       TEXT,
  price                 NUMERIC(12,2),
  currency              TEXT,
  shipping_price        NUMERIC(12,2),
  total_estimated_price NUMERIC(12,2),
  shipping_speed_label  TEXT,
  condition             TEXT CHECK (condition IN ('new','used','overhauled','serviceable','unknown')),
  stock_label           TEXT,
  rating                NUMERIC(4,2),
  rating_count          INT,
  certifications        TEXT[],
  compatibility_text    TEXT[],
  badges                TEXT[],
  rank_score            NUMERIC(8,4),
  sort_bucket           TEXT,
  raw_payload           JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_atlas_offers_search       ON atlas_part_offers(part_search_id);
CREATE INDEX idx_atlas_offers_org          ON atlas_part_offers(organization_id);
CREATE INDEX idx_atlas_offers_aircraft     ON atlas_part_offers(aircraft_id) WHERE aircraft_id IS NOT NULL;
CREATE INDEX idx_atlas_offers_part_number  ON atlas_part_offers(part_number) WHERE part_number IS NOT NULL;
CREATE INDEX idx_atlas_offers_vendor       ON atlas_part_offers(vendor_name);
CREATE INDEX idx_atlas_offers_created_at   ON atlas_part_offers(organization_id, created_at DESC);

ALTER TABLE atlas_part_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "atlas_offers_select" ON atlas_part_offers FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "atlas_offers_insert" ON atlas_part_offers FOR INSERT
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

-- ============================================================
-- 3. ATLAS ORDER RECORDS
-- Created when user clicks out to a vendor or manually records an order
-- ============================================================
CREATE TABLE atlas_order_records (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id             UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  work_order_id           UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  maintenance_draft_id    UUID,
  part_search_id          UUID REFERENCES atlas_part_searches(id) ON DELETE SET NULL,
  part_offer_id           UUID REFERENCES atlas_part_offers(id) ON DELETE SET NULL,
  user_id                 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status                  TEXT NOT NULL DEFAULT 'clicked_out'
                          CHECK (status IN (
                            'draft','clicked_out','marked_ordered','confirmed',
                            'shipped','delivered','received','installed','cancelled'
                          )),
  quantity                INT NOT NULL DEFAULT 1,
  unit_price              NUMERIC(12,2),
  shipping_price          NUMERIC(12,2),
  total_price             NUMERIC(12,2),
  currency                TEXT,
  vendor_name             TEXT,
  vendor_url              TEXT,
  vendor_order_reference  TEXT,
  internal_note           TEXT,
  selected_part_number    TEXT,
  selected_title          TEXT,
  selected_condition      TEXT,
  selected_image_url      TEXT,
  expected_for_use        TEXT,
  ordered_at              TIMESTAMPTZ,
  shipped_at              TIMESTAMPTZ,
  delivered_at            TIMESTAMPTZ,
  installed_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_atlas_orders_org          ON atlas_order_records(organization_id);
CREATE INDEX idx_atlas_orders_aircraft     ON atlas_order_records(aircraft_id) WHERE aircraft_id IS NOT NULL;
CREATE INDEX idx_atlas_orders_work_order   ON atlas_order_records(work_order_id) WHERE work_order_id IS NOT NULL;
CREATE INDEX idx_atlas_orders_status       ON atlas_order_records(organization_id, status);
CREATE INDEX idx_atlas_orders_created_at   ON atlas_order_records(organization_id, created_at DESC);
CREATE INDEX idx_atlas_orders_part_number  ON atlas_order_records(selected_part_number) WHERE selected_part_number IS NOT NULL;

ALTER TABLE atlas_order_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "atlas_orders_select" ON atlas_order_records FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "atlas_orders_insert" ON atlas_order_records FOR INSERT
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));
CREATE POLICY "atlas_orders_update" ON atlas_order_records FOR UPDATE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));
CREATE POLICY "atlas_orders_delete" ON atlas_order_records FOR DELETE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin']));

-- ============================================================
-- 4. ATLAS ORDER EVENTS (append-only audit trail)
-- ============================================================
CREATE TABLE atlas_order_events (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  order_record_id      UUID NOT NULL REFERENCES atlas_order_records(id) ON DELETE CASCADE,
  user_id              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type           TEXT NOT NULL,
  metadata_json        JSONB NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_atlas_events_order  ON atlas_order_events(order_record_id, created_at);
CREATE INDEX idx_atlas_events_org    ON atlas_order_events(organization_id);

ALTER TABLE atlas_order_events ENABLE ROW LEVEL SECURITY;

-- Append-only: SELECT (all org members) and INSERT (mechanic+)
CREATE POLICY "atlas_events_select" ON atlas_order_events FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "atlas_events_insert" ON atlas_order_events FOR INSERT
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

-- ============================================================
-- 5. EXTEND work_order_lines to link to Atlas order records
-- ============================================================
ALTER TABLE work_order_lines
  ADD COLUMN IF NOT EXISTS atlas_order_record_id UUID REFERENCES atlas_order_records(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS atlas_offer_id        UUID REFERENCES atlas_part_offers(id) ON DELETE SET NULL;

CREATE INDEX idx_wo_lines_atlas_order ON work_order_lines(atlas_order_record_id)
  WHERE atlas_order_record_id IS NOT NULL;

-- ============================================================
-- UPDATED_AT TRIGGER
-- (ensure function exists before using it)
-- ============================================================
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_atlas_orders_updated_at
  BEFORE UPDATE ON atlas_order_records
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
