-- Sprint stub-layer-batch — Stripe billing mirror tables (Spec 6.3).
--
-- Stub-layer pattern: shape mirrors the real Stripe Subscription +
-- Invoice objects byte-for-byte so swapping the mock client for the
-- real SDK is a single env-var flip. Distinct from the existing
-- `invoices` table (which is work-order invoices from sprint 016).
--
-- One row per Stripe subscription / invoice. Service-role writes via
-- the webhook handler; org-member read for /org/billing.

CREATE TABLE IF NOT EXISTS stripe_subscriptions (
  id                   text PRIMARY KEY,                   -- sub_xxxxxxxxxxxx (Stripe id)
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_customer_id   text NOT NULL,
  status               text NOT NULL CHECK (status IN (
                          'incomplete','incomplete_expired','trialing','active',
                          'past_due','canceled','unpaid','paused'
                        )),
  -- The plan/price the subscription is on. Stripe price ids are stable.
  price_id             text,
  product_id           text,
  /** Persona this subscription unlocks — owner / mechanic / shop. NULL = bundle. */
  persona              text CHECK (persona IS NULL OR persona IN ('owner','mechanic','shop','bundle')),
  current_period_start timestamptz,
  current_period_end   timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  trial_end            timestamptz,
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_subscriptions_org_idx
  ON stripe_subscriptions (organization_id, status);
CREATE INDEX IF NOT EXISTS stripe_subscriptions_customer_idx
  ON stripe_subscriptions (stripe_customer_id);

CREATE TABLE IF NOT EXISTS stripe_invoices (
  id                  text PRIMARY KEY,                    -- in_xxxxxxxxxxxx
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_customer_id  text NOT NULL,
  subscription_id     text REFERENCES stripe_subscriptions(id) ON DELETE SET NULL,
  status              text NOT NULL CHECK (status IN (
                         'draft','open','paid','uncollectible','void'
                       )),
  amount_due          int NOT NULL DEFAULT 0,              -- cents
  amount_paid         int NOT NULL DEFAULT 0,
  currency            text NOT NULL DEFAULT 'usd',
  invoice_pdf         text,
  hosted_invoice_url  text,
  /** Stripe period_start / period_end on the line items */
  period_start        timestamptz,
  period_end          timestamptz,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_invoices_org_recent_idx
  ON stripe_invoices (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stripe_invoices_subscription_idx
  ON stripe_invoices (subscription_id) WHERE subscription_id IS NOT NULL;

ALTER TABLE stripe_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members read stripe_subscriptions" ON stripe_subscriptions;
CREATE POLICY "Org members read stripe_subscriptions" ON stripe_subscriptions
  FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

DROP POLICY IF EXISTS "Org members read stripe_invoices" ON stripe_invoices;
CREATE POLICY "Org members read stripe_invoices" ON stripe_invoices
  FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- Writes go through the webhook (service-role); block authenticated writes.
DROP POLICY IF EXISTS "Service-only write stripe_subscriptions" ON stripe_subscriptions;
CREATE POLICY "Service-only write stripe_subscriptions" ON stripe_subscriptions
  FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "Service-only write stripe_invoices" ON stripe_invoices;
CREATE POLICY "Service-only write stripe_invoices" ON stripe_invoices
  FOR INSERT TO authenticated WITH CHECK (false);

CREATE OR REPLACE FUNCTION stripe_subscriptions_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stripe_subscriptions_updated_at_trg ON stripe_subscriptions;
CREATE TRIGGER stripe_subscriptions_updated_at_trg
  BEFORE UPDATE ON stripe_subscriptions
  FOR EACH ROW EXECUTE FUNCTION stripe_subscriptions_set_updated_at();
