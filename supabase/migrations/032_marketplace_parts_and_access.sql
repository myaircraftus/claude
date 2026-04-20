-- Migration 032: Marketplace parts listings, seller plans, and document access/inject events
-- Adds seller plan catalog + org assignment, physical parts listings, and
-- event tracking for buyer contact and manual/catalog access/inject flows.

-- ---------------------------------------------------------------------------
-- 1. Seller plans catalog
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS marketplace_seller_plans (
  slug                           TEXT PRIMARY KEY,
  name                           TEXT NOT NULL,
  monthly_price_cents            INTEGER NOT NULL CHECK (monthly_price_cents >= 0),
  annual_price_cents             INTEGER CHECK (annual_price_cents IS NULL OR annual_price_cents >= 0),
  active_listing_limit           INTEGER CHECK (active_listing_limit IS NULL OR active_listing_limit >= 0),
  supports_ai_listing_creation    BOOLEAN NOT NULL DEFAULT TRUE,
  supports_photo_upload          BOOLEAN NOT NULL DEFAULT TRUE,
  supports_video_upload          BOOLEAN NOT NULL DEFAULT FALSE,
  supports_priority_ranking      BOOLEAN NOT NULL DEFAULT FALSE,
  supports_advanced_analytics    BOOLEAN NOT NULL DEFAULT FALSE,
  supports_direct_contact        BOOLEAN NOT NULL DEFAULT TRUE,
  description                    TEXT,
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO marketplace_seller_plans (
  slug,
  name,
  monthly_price_cents,
  annual_price_cents,
  active_listing_limit,
  supports_ai_listing_creation,
  supports_photo_upload,
  supports_video_upload,
  supports_priority_ranking,
  supports_advanced_analytics,
  supports_direct_contact,
  description
)
VALUES
  (
    'starter',
    'Starter',
    2500,
    NULL,
    25,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    'Entry plan for individual sellers and light inventory.'
  ),
  (
    'pro',
    'Pro',
    4999,
    NULL,
    NULL,
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    'Unlimited active listings with priority search placement and analytics.'
  )
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  annual_price_cents = EXCLUDED.annual_price_cents,
  active_listing_limit = EXCLUDED.active_listing_limit,
  supports_ai_listing_creation = EXCLUDED.supports_ai_listing_creation,
  supports_photo_upload = EXCLUDED.supports_photo_upload,
  supports_video_upload = EXCLUDED.supports_video_upload,
  supports_priority_ranking = EXCLUDED.supports_priority_ranking,
  supports_advanced_analytics = EXCLUDED.supports_advanced_analytics,
  supports_direct_contact = EXCLUDED.supports_direct_contact,
  description = EXCLUDED.description,
  updated_at = NOW();

ALTER TABLE marketplace_seller_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "marketplace_seller_plans_select" ON marketplace_seller_plans;
CREATE POLICY "marketplace_seller_plans_select" ON marketplace_seller_plans FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 2. Seller plan assignment per organization
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS marketplace_seller_accounts (
  organization_id     UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  plan_slug           TEXT NOT NULL REFERENCES marketplace_seller_plans(slug),
  status              TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'canceled', 'trial')),
  current_period_end  TIMESTAMPTZ,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_seller_accounts_plan ON marketplace_seller_accounts(plan_slug);
CREATE INDEX IF NOT EXISTS idx_marketplace_seller_accounts_status ON marketplace_seller_accounts(status);

ALTER TABLE marketplace_seller_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "marketplace_seller_accounts_select" ON marketplace_seller_accounts;
DROP POLICY IF EXISTS "marketplace_seller_accounts_insert" ON marketplace_seller_accounts;
DROP POLICY IF EXISTS "marketplace_seller_accounts_update" ON marketplace_seller_accounts;
DROP POLICY IF EXISTS "marketplace_seller_accounts_delete" ON marketplace_seller_accounts;
CREATE POLICY "marketplace_seller_accounts_select" ON marketplace_seller_accounts FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "marketplace_seller_accounts_insert" ON marketplace_seller_accounts FOR INSERT
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin']));
CREATE POLICY "marketplace_seller_accounts_update" ON marketplace_seller_accounts FOR UPDATE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin']));
CREATE POLICY "marketplace_seller_accounts_delete" ON marketplace_seller_accounts FOR DELETE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin']));

CREATE OR REPLACE FUNCTION marketplace_handle_new_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO marketplace_seller_accounts (organization_id, plan_slug, status, started_at, updated_at)
  VALUES (NEW.id, 'starter', 'active', NOW(), NOW())
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_organization_created_marketplace ON organizations;
CREATE TRIGGER on_organization_created_marketplace
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION marketplace_handle_new_organization();

INSERT INTO marketplace_seller_accounts (organization_id, plan_slug, status, started_at, updated_at)
SELECT id, 'starter', 'active', COALESCE(created_at, NOW()), NOW()
FROM organizations
ON CONFLICT (organization_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Physical parts listings
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE marketplace_part_condition AS ENUM (
    'new',
    'new_surplus',
    'overhauled',
    'serviceable',
    'as_removed',
    'used',
    'for_repair'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE marketplace_part_listing_status AS ENUM (
    'draft',
    'available',
    'pending',
    'sold',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS marketplace_part_listings (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  seller_user_id         UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  seller_plan_slug       TEXT NOT NULL REFERENCES marketplace_seller_plans(slug) DEFAULT 'starter',
  title                  TEXT NOT NULL,
  part_number            TEXT,
  alternate_part_number  TEXT,
  manufacturer           TEXT,
  category               TEXT,
  subcategory            TEXT,
  condition              marketplace_part_condition NOT NULL DEFAULT 'serviceable',
  fits_applicability     TEXT,
  description            TEXT,
  seller_notes           TEXT,
  price_cents            INTEGER CHECK (price_cents IS NULL OR price_cents >= 0),
  quantity               INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  location               TEXT,
  serial_number          TEXT,
  trace_docs_available   BOOLEAN NOT NULL DEFAULT FALSE,
  cert_tag_available     BOOLEAN NOT NULL DEFAULT FALSE,
  contact_name           TEXT,
  contact_phone          TEXT,
  contact_text           TEXT,
  contact_email          TEXT,
  media_json             JSONB NOT NULL DEFAULT '[]'::jsonb,
  status                 marketplace_part_listing_status NOT NULL DEFAULT 'draft',
  featured_rank          INTEGER NOT NULL DEFAULT 0,
  view_count             INTEGER NOT NULL DEFAULT 0,
  contact_click_count    INTEGER NOT NULL DEFAULT 0,
  call_click_count       INTEGER NOT NULL DEFAULT 0,
  text_click_count       INTEGER NOT NULL DEFAULT 0,
  email_click_count      INTEGER NOT NULL DEFAULT 0,
  published_at           TIMESTAMPTZ,
  archived_at            TIMESTAMPTZ,
  last_contacted_at      TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_part_listings_org ON marketplace_part_listings(organization_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_part_listings_status ON marketplace_part_listings(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_part_listings_part_number ON marketplace_part_listings(part_number) WHERE part_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketplace_part_listings_manufacturer ON marketplace_part_listings(manufacturer) WHERE manufacturer IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketplace_part_listings_category ON marketplace_part_listings(category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketplace_part_listings_created_at ON marketplace_part_listings(organization_id, created_at DESC);

ALTER TABLE marketplace_part_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "marketplace_part_listings_select" ON marketplace_part_listings;
DROP POLICY IF EXISTS "marketplace_part_listings_insert" ON marketplace_part_listings;
DROP POLICY IF EXISTS "marketplace_part_listings_update" ON marketplace_part_listings;
DROP POLICY IF EXISTS "marketplace_part_listings_delete" ON marketplace_part_listings;
CREATE POLICY "marketplace_part_listings_select" ON marketplace_part_listings FOR SELECT
  USING (
    status = 'available'
    OR organization_id = ANY(get_my_org_ids())
  );
CREATE POLICY "marketplace_part_listings_insert" ON marketplace_part_listings FOR INSERT
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));
CREATE POLICY "marketplace_part_listings_update" ON marketplace_part_listings FOR UPDATE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));
CREATE POLICY "marketplace_part_listings_delete" ON marketplace_part_listings FOR DELETE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin']));

-- ---------------------------------------------------------------------------
-- 4. Buyer contact and listing activity metrics
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE marketplace_part_contact_channel AS ENUM ('view', 'call', 'text', 'email');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS marketplace_part_contact_events (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id             UUID NOT NULL REFERENCES marketplace_part_listings(id) ON DELETE CASCADE,
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id                UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  channel                marketplace_part_contact_channel NOT NULL,
  destination            TEXT,
  metadata_json          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_part_contact_events_listing ON marketplace_part_contact_events(listing_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_part_contact_events_org ON marketplace_part_contact_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_part_contact_events_user ON marketplace_part_contact_events(user_id, created_at DESC) WHERE user_id IS NOT NULL;

ALTER TABLE marketplace_part_contact_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "marketplace_part_contact_events_select" ON marketplace_part_contact_events;
DROP POLICY IF EXISTS "marketplace_part_contact_events_insert" ON marketplace_part_contact_events;
CREATE POLICY "marketplace_part_contact_events_select" ON marketplace_part_contact_events FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()) OR user_id = auth.uid());
CREATE POLICY "marketplace_part_contact_events_insert" ON marketplace_part_contact_events FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 5. Manual / parts catalog access and inject events
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE marketplace_document_access_action AS ENUM ('view', 'download', 'inject', 'download_and_inject');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE marketplace_inject_target_scope AS ENUM ('workspace', 'aircraft');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE marketplace_inject_status AS ENUM ('queued', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS marketplace_document_access_events (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id            UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id                UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  action                 marketplace_document_access_action NOT NULL,
  target_scope           marketplace_inject_target_scope,
  target_aircraft_id     UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  metadata_json          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_document_access_events_doc ON marketplace_document_access_events(document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_document_access_events_org ON marketplace_document_access_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_document_access_events_user ON marketplace_document_access_events(user_id, created_at DESC) WHERE user_id IS NOT NULL;

ALTER TABLE marketplace_document_access_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "marketplace_document_access_events_select" ON marketplace_document_access_events;
DROP POLICY IF EXISTS "marketplace_document_access_events_insert" ON marketplace_document_access_events;
CREATE POLICY "marketplace_document_access_events_select" ON marketplace_document_access_events FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()) OR user_id = auth.uid());
CREATE POLICY "marketplace_document_access_events_insert" ON marketplace_document_access_events FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE TABLE IF NOT EXISTS marketplace_document_inject_events (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id            UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id                UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  target_scope           marketplace_inject_target_scope NOT NULL DEFAULT 'workspace',
  target_aircraft_id     UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  status                 marketplace_inject_status NOT NULL DEFAULT 'queued',
  metadata_json          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_document_inject_events_doc ON marketplace_document_inject_events(document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_document_inject_events_org ON marketplace_document_inject_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_document_inject_events_status ON marketplace_document_inject_events(status, created_at DESC);

ALTER TABLE marketplace_document_inject_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "marketplace_document_inject_events_select" ON marketplace_document_inject_events;
DROP POLICY IF EXISTS "marketplace_document_inject_events_insert" ON marketplace_document_inject_events;
DROP POLICY IF EXISTS "marketplace_document_inject_events_update" ON marketplace_document_inject_events;
CREATE POLICY "marketplace_document_inject_events_select" ON marketplace_document_inject_events FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()) OR user_id = auth.uid());
CREATE POLICY "marketplace_document_inject_events_insert" ON marketplace_document_inject_events FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "marketplace_document_inject_events_update" ON marketplace_document_inject_events FOR UPDATE
  USING (organization_id = ANY(get_my_org_ids()) OR user_id = auth.uid());
