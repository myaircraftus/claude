-- 056: portal messaging between aircraft owners (customers.portal_user_id)
-- and their mechanic shop's org members.

CREATE TABLE IF NOT EXISTS portal_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  last_message_at timestamptz,
  last_message_snippet text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, customer_id)
);

CREATE INDEX IF NOT EXISTS portal_threads_customer_idx ON portal_threads(customer_id);
CREATE INDEX IF NOT EXISTS portal_threads_org_idx ON portal_threads(organization_id);

CREATE TABLE IF NOT EXISTS portal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES portal_threads(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('owner', 'mechanic')),
  body text NOT NULL CHECK (length(body) > 0 AND length(body) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_messages_thread_idx
  ON portal_messages(thread_id, created_at);

ALTER TABLE portal_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portal_threads_org_read" ON portal_threads FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
    OR customer_id IN (
      SELECT id FROM customers WHERE portal_user_id = auth.uid() AND portal_access = true
    )
  );

CREATE POLICY "portal_messages_thread_read" ON portal_messages FOR SELECT
  USING (
    thread_id IN (
      SELECT id FROM portal_threads WHERE
        organization_id IN (
          SELECT organization_id FROM organization_memberships
          WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
        )
        OR customer_id IN (
          SELECT id FROM customers WHERE portal_user_id = auth.uid() AND portal_access = true
        )
    )
  );
