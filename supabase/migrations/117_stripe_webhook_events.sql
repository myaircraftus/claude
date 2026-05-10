-- Migration 117: Phase 17 Sprint 17.4 — stripe_webhook_events
--
-- Idempotency log for Stripe webhook delivery. Stripe retries failed
-- webhooks with the same event.id; without dedup we risk applying the
-- same subscription update multiple times. Insert-on-receive with a
-- conflict-do-nothing on (id) means the second delivery short-circuits
-- before reaching the handler.
--
-- The full event payload is also retained for ~30 days so we can
-- replay or audit without re-fetching from Stripe.

CREATE TYPE stripe_webhook_event_status AS ENUM (
  'received',
  'processed',
  'failed',
  'skipped'
);

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id              text PRIMARY KEY,                     -- Stripe event id (e.g. evt_…)
  type            text NOT NULL,                        -- e.g. customer.subscription.updated
  livemode        boolean NOT NULL DEFAULT false,
  api_version     text,
  payload         jsonb NOT NULL,
  status          stripe_webhook_event_status NOT NULL DEFAULT 'received',
  error_message   text,
  received_at     timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS stripe_webhook_events_received_idx
  ON stripe_webhook_events(received_at DESC);
CREATE INDEX IF NOT EXISTS stripe_webhook_events_status_idx
  ON stripe_webhook_events(status, received_at DESC);
CREATE INDEX IF NOT EXISTS stripe_webhook_events_type_idx
  ON stripe_webhook_events(type, received_at DESC);

ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Read: platform admins only (operational data).
CREATE POLICY stripe_webhook_events_admin_read ON stripe_webhook_events
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_platform_admin = true)
  );

-- Inserts/updates go through service-role only.

COMMENT ON TABLE stripe_webhook_events IS
  'Phase 17: idempotency log for Stripe webhook deliveries. PK on Stripe event id ensures duplicate-delivery safety.';
