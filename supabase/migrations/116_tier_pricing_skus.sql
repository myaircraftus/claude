-- Migration 116: Phase 17 Sprint 17.3 — tier_pricing_skus
--
-- Maps each (tier_slug × volume bracket) row from
-- apps/web/lib/billing/pricing-config.ts to its corresponding Stripe
-- Product + Price. The sync script (lib/billing/stripe-sync.ts)
-- populates this table; runtime code reads it to look up the right
-- price ID at Checkout time without hardcoding Stripe IDs in env vars.
--
-- 6 rows total: standard{1-5,6-15,16+} + pro{1-5,6-15,16+}. Beta is
-- free → no row.
--
-- is_test_mode lets us keep both test-mode and live-mode prices in the
-- same table during the launch transition. Routes filter by
-- is_test_mode = (NODE_ENV !== 'production' OR STRIPE_USE_TEST=true).

CREATE TABLE IF NOT EXISTS tier_pricing_skus (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_slug              text NOT NULL CHECK (tier_slug IN ('standard', 'pro')),
  min_aircraft           int NOT NULL,
  max_aircraft           int,                          -- null = unbounded
  price_per_aircraft_cents int NOT NULL,
  stripe_product_id      text NOT NULL,
  stripe_price_id        text NOT NULL,
  is_test_mode           boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tier_slug, min_aircraft, is_test_mode)
);

CREATE INDEX IF NOT EXISTS tier_pricing_skus_lookup_idx
  ON tier_pricing_skus(tier_slug, min_aircraft, is_test_mode);

ALTER TABLE tier_pricing_skus ENABLE ROW LEVEL SECURITY;

-- Read: platform admins only (this is operational data; org owners
-- don't need to see other orgs' SKUs).
CREATE POLICY tier_pricing_skus_admin_read ON tier_pricing_skus
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_platform_admin = true)
  );

-- Inserts/updates go through service-role only.

COMMENT ON TABLE tier_pricing_skus IS
  'Phase 17: maps pricing-config.ts brackets to Stripe Products+Prices. Populated by lib/billing/stripe-sync.ts.';
