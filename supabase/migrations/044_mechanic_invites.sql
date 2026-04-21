CREATE TABLE IF NOT EXISTS mechanic_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Who invited them
  invited_by_user_id UUID REFERENCES auth.users(id),
  invited_by_org_id UUID REFERENCES organizations(id),

  -- What they're invited to (optional context)
  estimate_id UUID,  -- if tied to an estimate
  aircraft_id UUID REFERENCES aircraft(id),

  -- Mechanic details
  mechanic_name TEXT NOT NULL,
  mechanic_email TEXT,
  mechanic_phone TEXT,

  -- Resolution
  existing_user_id UUID REFERENCES auth.users(id),  -- if found in system
  existing_org_id UUID REFERENCES organizations(id), -- org they belong to

  -- Trial auto-created
  trial_user_id UUID REFERENCES auth.users(id),  -- if we created a trial account
  trial_org_id UUID REFERENCES organizations(id),
  trial_expires_at TIMESTAMPTZ,

  -- Delivery
  invite_token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  email_sent_at TIMESTAMPTZ,
  sms_sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','accepted','expired','revoked'))
);

CREATE INDEX IF NOT EXISTS idx_mechanic_invites_token ON mechanic_invites(invite_token);
CREATE INDEX IF NOT EXISTS idx_mechanic_invites_email ON mechanic_invites(lower(mechanic_email));
CREATE INDEX IF NOT EXISTS idx_mechanic_invites_org ON mechanic_invites(invited_by_org_id);

ALTER TABLE mechanic_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invites_read_own_org" ON mechanic_invites FOR SELECT
USING (invited_by_org_id IN (
  SELECT organization_id FROM organization_memberships
  WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
));
