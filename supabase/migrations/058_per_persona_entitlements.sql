-- 058: Per-persona entitlements, payment-method gating, signup abuse tracking
--
-- Splits the single org-level subscription_status into per-persona rows so
-- an org can hold an "owner" trial, a "mechanic" trial, and a "bundle"
-- subscription independently. Adds payment-method-on-file fields so trial
-- start can require a card via Stripe SetupIntent. Adds a signup_attempts
-- table for rate-limiting and trial-abuse prevention.

-- ─────────────────────────────────────────────────────────────────
-- 1. entitlements: one row per (organization, persona)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  persona text NOT NULL CHECK (persona IN ('owner','mechanic')),
  status text NOT NULL DEFAULT 'none'
    CHECK (status IN ('none','trial','active','paywalled','cancelled','past_due')),
  trial_ends_at timestamptz,
  trial_started_at timestamptz NOT NULL DEFAULT now(),
  stripe_subscription_id text,
  stripe_price_id text,
  bundle boolean NOT NULL DEFAULT false,
  paywalled_reason text
    CHECK (paywalled_reason IS NULL OR paywalled_reason IN
      ('trial_expired','payment_failed','cancelled','manual','mechanic_invited')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, persona)
);

CREATE INDEX IF NOT EXISTS entitlements_org_idx
  ON entitlements(organization_id);
CREATE INDEX IF NOT EXISTS entitlements_stripe_sub_idx
  ON entitlements(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS entitlements_status_idx
  ON entitlements(status, trial_ends_at);

ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entitlements org members read" ON entitlements;
CREATE POLICY "entitlements org members read" ON entitlements
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );
-- writes are service-role only (no anon/authenticated INSERT/UPDATE policy)

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_entitlement_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS entitlements_set_updated_at ON entitlements;
CREATE TRIGGER entitlements_set_updated_at
  BEFORE UPDATE ON entitlements
  FOR EACH ROW EXECUTE FUNCTION set_entitlement_updated_at();

-- ─────────────────────────────────────────────────────────────────
-- 2. organizations: payment method on file (Stripe SetupIntent flow)
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id text,
  ADD COLUMN IF NOT EXISTS stripe_setup_intent_id text,
  ADD COLUMN IF NOT EXISTS payment_method_card_fingerprint text,
  ADD COLUMN IF NOT EXISTS payment_method_added_at timestamptz;

CREATE INDEX IF NOT EXISTS organizations_card_fingerprint_idx
  ON organizations(payment_method_card_fingerprint)
  WHERE payment_method_card_fingerprint IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────
-- 3. signup_attempts: trial-abuse tracking (per email, IP, card)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS signup_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  ip_address text,
  user_agent text,
  card_fingerprint text,
  user_id uuid,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  outcome text NOT NULL DEFAULT 'attempted'
    CHECK (outcome IN ('attempted','succeeded','blocked_email','blocked_ip','blocked_card','blocked_other')),
  blocked_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signup_attempts_email_idx
  ON signup_attempts(lower(email));
CREATE INDEX IF NOT EXISTS signup_attempts_ip_idx
  ON signup_attempts(ip_address)
  WHERE ip_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS signup_attempts_card_idx
  ON signup_attempts(card_fingerprint)
  WHERE card_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS signup_attempts_created_idx
  ON signup_attempts(created_at DESC);

ALTER TABLE signup_attempts ENABLE ROW LEVEL SECURITY;
-- service-role only; no read/write policies for anon/authenticated

-- ─────────────────────────────────────────────────────────────────
-- 4. Backfill entitlements from legacy organizations table
-- ─────────────────────────────────────────────────────────────────
-- Every existing org gets an owner entitlement carrying its current state.
-- (The legacy product was owner-only; mechanic was an invited-customer flow.)
INSERT INTO entitlements (
  organization_id, persona, status, trial_ends_at,
  stripe_subscription_id, paywalled_reason, created_at, updated_at
)
SELECT
  id,
  'owner',
  COALESCE(subscription_status, 'trial'),
  trial_ends_at,
  stripe_subscription_id,
  paywalled_reason,
  created_at,
  COALESCE(updated_at, created_at)
FROM organizations
ON CONFLICT (organization_id, persona) DO NOTHING;

-- Orgs invited by a mechanic get a mechanic entitlement seeded as paywalled —
-- the inviting mechanic shop is the one paying for the relationship.
INSERT INTO entitlements (
  organization_id, persona, status, trial_ends_at,
  paywalled_reason, created_at, updated_at
)
SELECT
  id,
  'mechanic',
  'paywalled',
  NULL,
  'mechanic_invited',
  created_at,
  COALESCE(updated_at, created_at)
FROM organizations
WHERE paywalled_reason = 'mechanic_invited'
ON CONFLICT (organization_id, persona) DO NOTHING;
