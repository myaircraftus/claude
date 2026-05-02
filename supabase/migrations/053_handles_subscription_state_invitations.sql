-- 053: vanity handles, org subscription state machine, customer_invitations
-- Applied directly via MCP on 2026-04-24; this file exists to keep the repo in sync.

-- 1. user_profiles.handle (public vanity URL slug)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS handle text;

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_handle_key
  ON user_profiles (lower(handle)) WHERE handle IS NOT NULL;

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_handle_format
  CHECK (handle IS NULL OR handle ~ '^[a-z0-9][a-z0-9-]{2,31}$');

-- 2. organizations: subscription state machine + per-aircraft pricing
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'trial'
    CHECK (subscription_status IN ('trial','active','paywalled','cancelled','past_due')),
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS paywalled_reason text
    CHECK (paywalled_reason IS NULL OR paywalled_reason IN ('mechanic_invited','trial_expired','payment_failed','manual')),
  ADD COLUMN IF NOT EXISTS billing_model text NOT NULL DEFAULT 'per_aircraft'
    CHECK (billing_model IN ('flat','per_aircraft')),
  ADD COLUMN IF NOT EXISTS price_per_aircraft_cents integer NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS invited_by_org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invited_by_user_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL;

-- Backfill trial_ends_at for existing orgs without it: 30 days from created_at
UPDATE organizations
  SET trial_ends_at = created_at + interval '30 days'
  WHERE trial_ends_at IS NULL;

-- 3. customer_invitations: mechanic -> owner invite flow
CREATE TABLE IF NOT EXISTS customer_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_token text NOT NULL UNIQUE,
  invited_by_org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invited_by_user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  email text NOT NULL,
  name text,
  phone text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','accepted','expired','revoked')),
  accepted_org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  accepted_user_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  email_sent_at timestamptz,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_invitations_org_idx
  ON customer_invitations(invited_by_org_id);
CREATE INDEX IF NOT EXISTS customer_invitations_email_idx
  ON customer_invitations(lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS customer_invitations_pending_email_org_key
  ON customer_invitations(invited_by_org_id, lower(email))
  WHERE status IN ('pending','sent');

ALTER TABLE customer_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_invitations org members read" ON customer_invitations;
CREATE POLICY "customer_invitations org members read" ON customer_invitations
  FOR SELECT USING (
    invited_by_org_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "customer_invitations org members insert" ON customer_invitations;
CREATE POLICY "customer_invitations org members insert" ON customer_invitations
  FOR INSERT WITH CHECK (
    invited_by_org_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "customer_invitations org members update" ON customer_invitations;
CREATE POLICY "customer_invitations org members update" ON customer_invitations
  FOR UPDATE USING (
    invited_by_org_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

-- 4. Handle auto-generator function
CREATE OR REPLACE FUNCTION generate_user_handle(
  p_full_name text,
  p_email text
) RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  base_handle text;
  candidate text;
  i integer := 0;
BEGIN
  base_handle := lower(coalesce(nullif(trim(p_full_name), ''), split_part(p_email, '@', 1)));
  base_handle := regexp_replace(base_handle, '[^a-z0-9-]+', '-', 'g');
  base_handle := regexp_replace(base_handle, '^-+|-+$', '', 'g');
  base_handle := regexp_replace(base_handle, '-+', '-', 'g');
  IF length(base_handle) < 3 THEN base_handle := base_handle || 'user'; END IF;
  IF length(base_handle) > 28 THEN base_handle := substring(base_handle FROM 1 FOR 28); END IF;

  candidate := base_handle;
  WHILE EXISTS (SELECT 1 FROM user_profiles WHERE lower(handle) = candidate) LOOP
    i := i + 1;
    candidate := substring(base_handle FROM 1 FOR 28) || '-' || i::text;
  END LOOP;

  RETURN candidate;
END;
$$;

-- 5. Trigger: auto-assign handle on user_profiles insert if null
CREATE OR REPLACE FUNCTION assign_user_handle_on_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.handle IS NULL THEN
    NEW.handle := generate_user_handle(NEW.full_name, NEW.email);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profiles_assign_handle ON user_profiles;
CREATE TRIGGER user_profiles_assign_handle
  BEFORE INSERT ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION assign_user_handle_on_insert();

-- 6. Backfill handles for existing profiles
UPDATE user_profiles
SET handle = generate_user_handle(full_name, email)
WHERE handle IS NULL;
