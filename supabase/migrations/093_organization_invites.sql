-- Sprint 6.5 — Organization invites (magic-link signup).
--
-- One row per pending or accepted invite. accepted_at flips to non-null
-- when the recipient consumes the token via /api/invites/[token]/accept.
-- Token is a 32-char URL-safe random string generated server-side.

CREATE TABLE IF NOT EXISTS organization_invites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           text NOT NULL,
  role            text NOT NULL CHECK (role IN ('owner','admin','mechanic','pilot','viewer','auditor')),
  persona         text CHECK (persona IS NULL OR persona IN ('owner','mechanic','shop','admin')),
  token           text NOT NULL UNIQUE,
  expires_at      timestamptz NOT NULL,
  accepted_at     timestamptz,
  accepted_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at      timestamptz,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organization_invites_org_pending_idx
  ON organization_invites (organization_id, created_at DESC)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS organization_invites_email_idx
  ON organization_invites (lower(email));

ALTER TABLE organization_invites ENABLE ROW LEVEL SECURITY;

-- Org admins read; nobody else.
DROP POLICY IF EXISTS "Org admins read invites" ON organization_invites;
CREATE POLICY "Org admins read invites"
  ON organization_invites FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
      AND role IN ('owner','admin')
  ));

DROP POLICY IF EXISTS "Org admins create invites" ON organization_invites;
CREATE POLICY "Org admins create invites"
  ON organization_invites FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
      AND role IN ('owner','admin')
  ));

DROP POLICY IF EXISTS "Org admins update invites" ON organization_invites;
CREATE POLICY "Org admins update invites"
  ON organization_invites FOR UPDATE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
      AND role IN ('owner','admin')
  ));

-- The public /accept endpoint uses the service-role client to look up
-- by token + flip accepted_at — bypasses RLS by design.
