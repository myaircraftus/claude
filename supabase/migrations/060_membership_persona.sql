-- Migration 060: per-membership persona (Spec 0.2)
--
-- Background: 047 added user_profiles.persona TEXT CHECK ('owner','mechanic')
-- as a *user-global* default. Spec 0.2 makes persona an org-scoped concept —
-- the same person can be the *owner* in their own LLC and a *mechanic* on a
-- different shop's payroll. The persona drives nav, dashboards, and AI prompts.
--
-- This migration adds organization_memberships.persona (nullable; NULL means
-- "fall back to user_profiles.persona, then 'owner' as final default") and
-- widens both CHECK constraints to include 'shop' for the shop-foreman view
-- (referenced in PERSONA_CONFIG.shop in lib/persona/config.ts; not yet
-- surfaced in the persona switcher UI but reserved for Phase 5).

-- ─── 1. Widen user_profiles.persona to include 'shop' ────────────────────────

ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_persona_check;

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_persona_check
  CHECK (persona IS NULL OR persona IN ('owner', 'mechanic', 'shop'));

-- ─── 2. organization_memberships.persona ─────────────────────────────────────

ALTER TABLE organization_memberships
  ADD COLUMN IF NOT EXISTS persona TEXT;

ALTER TABLE organization_memberships
  DROP CONSTRAINT IF EXISTS organization_memberships_persona_check;

ALTER TABLE organization_memberships
  ADD CONSTRAINT organization_memberships_persona_check
  CHECK (persona IS NULL OR persona IN ('owner', 'mechanic', 'shop'));

COMMENT ON COLUMN organization_memberships.persona IS
  'Per-membership UI persona (Spec 0.2). NULL = fall back to user_profiles.persona, then ''owner''. Same user can be owner in one org + mechanic in another.';

CREATE INDEX IF NOT EXISTS idx_organization_memberships_persona
  ON organization_memberships(persona)
  WHERE persona IS NOT NULL;
