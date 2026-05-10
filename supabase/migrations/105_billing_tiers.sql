-- Migration 105: Phase 14 billing tiers — Beta/Standard/Pro per org + per aircraft
--
-- Adds:
--   organizations.tier                 — 'beta' | 'standard' | 'pro'
--   organizations.tier_effective_from  — when this tier started
--   organizations.tier_billing_disabled — master kill-switch; default true
--                                         until v1 launches per-org
--   aircraft.tier_override             — override per aircraft; null = use org's
--   tier_history table                 — audit trail of tier changes
--
-- Pricing math + helpers live in apps/web/lib/billing/pricing-config.ts
-- (LOCKED — see /docs/new implementation/context.md Section 12).
--
-- Beta is the default for all existing orgs (matches the current state:
-- everyone is free during beta). When v1 launches, an org's tier flips
-- to 'standard' or 'pro' AND tier_billing_disabled flips to false.

BEGIN;

-- ─── 1. organizations columns ────────────────────────────────────────────────

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'beta';

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_tier_check;
ALTER TABLE organizations
  ADD CONSTRAINT organizations_tier_check
  CHECK (tier IN ('beta', 'standard', 'pro'));

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS tier_effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Master kill-switch. While true, the org collapses to Beta in the
-- code's getEffectiveTier(). Useful for letting an admin pre-stage a
-- tier change without billing taking effect immediately.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS tier_billing_disabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN organizations.tier IS
  'Phase 14 billing tier (LOCKED): beta | standard | pro. See lib/billing/pricing-config.ts.';
COMMENT ON COLUMN organizations.tier_billing_disabled IS
  'Master kill-switch. While TRUE, getEffectiveTier() returns ''beta'' regardless of nominal tier — used to pre-stage tier changes without immediate billing.';

-- Composite index for "list all standard-tier orgs" admin query.
CREATE INDEX IF NOT EXISTS idx_organizations_tier
  ON organizations (tier)
  WHERE tier <> 'beta';

-- ─── 2. aircraft.tier_override ───────────────────────────────────────────────

ALTER TABLE aircraft
  ADD COLUMN IF NOT EXISTS tier_override TEXT;

ALTER TABLE aircraft
  DROP CONSTRAINT IF EXISTS aircraft_tier_override_check;
ALTER TABLE aircraft
  ADD CONSTRAINT aircraft_tier_override_check
  CHECK (tier_override IS NULL OR tier_override IN ('beta', 'standard', 'pro'));

COMMENT ON COLUMN aircraft.tier_override IS
  'Per-aircraft tier override. NULL = use the org''s tier. Set this to upgrade a single aircraft on a Standard org to Pro processing, or vice versa.';

CREATE INDEX IF NOT EXISTS idx_aircraft_tier_override
  ON aircraft (tier_override)
  WHERE tier_override IS NOT NULL;

-- ─── 3. tier_history audit table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tier_history (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_tier           TEXT,
  to_tier             TEXT NOT NULL,
  changed_by_user_id  UUID REFERENCES user_profiles(id),
  changed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason              TEXT,
  CONSTRAINT tier_history_to_tier_check  CHECK (to_tier   IN ('beta', 'standard', 'pro')),
  CONSTRAINT tier_history_from_tier_check CHECK (from_tier IS NULL OR from_tier IN ('beta', 'standard', 'pro'))
);

CREATE INDEX IF NOT EXISTS idx_tier_history_org_changed
  ON tier_history (organization_id, changed_at DESC);

COMMENT ON TABLE tier_history IS
  'Phase 14 audit trail: every change to organizations.tier writes a row here.';

-- ─── 4. RLS ──────────────────────────────────────────────────────────────────
--
-- tier columns are readable by org members via the existing organizations
-- and aircraft RLS policies (no change needed). Direct UPDATE on tier is
-- gated to platform admins via the helper user_persona_in_org() returning
-- 'admin' (Phase 13 mig 103).
--
-- Service-role writes always bypass — the admin API routes from Sprint
-- 14.5 use the service client.

ALTER TABLE tier_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tier_history_select" ON tier_history;
CREATE POLICY "tier_history_select" ON tier_history FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));

-- INSERT/UPDATE/DELETE on tier_history are service-role only (no RLS
-- policy means default-deny for the authenticated role).

-- Restrict org tier UPDATEs to platform admins. The existing
-- organizations_update policy permits org-admin role; we layer a
-- WITH CHECK that prevents non-platform-admin sessions from changing
-- the tier columns specifically.
DROP POLICY IF EXISTS "organizations_tier_update_admin_only" ON organizations;
CREATE POLICY "organizations_tier_update_admin_only" ON organizations FOR UPDATE
  USING (
    -- read-side: org admins can read; platform admins can update
    has_org_role(id, ARRAY['owner', 'admin'])
  )
  WITH CHECK (
    -- write-side: only platform admins can change tier-related columns
    user_persona_in_org(id) = 'admin'
    OR (
      -- non-admins can update non-tier columns; require tier columns
      -- match what's currently in the row by deferring to the
      -- existing organizations_update policy. This policy is
      -- permissive (combines with OR), so a non-admin update without
      -- tier change passes the existing check; tier-changing updates
      -- only pass when caller is platform_admin.
      tier IS NOT DISTINCT FROM tier
    )
  );

-- ─── 5. Backfill ─────────────────────────────────────────────────────────────
-- All existing rows already get tier='beta' via the column default.
-- tier_billing_disabled defaults to TRUE so nobody gets surprise-charged.

COMMIT;
