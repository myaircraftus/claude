-- Sprint stub-layer-batch — QuickBooks Online sync state (Spec 3.3 + 5.7).
--
-- qbo_sync_state — one row per organization. OAuth tokens encrypted at
-- rest (TODO: integrate existing AES helper from Google Drive sprint).
-- qbo_invoice_mappings — local invoice → QBO invoice id.
-- qbo_payment_mappings — local payment → QBO payment id, stamped after
-- the auto-recon flow (5.7) finds a matching payment by amount + date.

CREATE TABLE IF NOT EXISTS qbo_sync_state (
  organization_id   uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  /** Intuit realm id == QBO company id. Distinct from Stripe customer id. */
  realm_id          text,
  access_token      text,
  refresh_token     text,
  /** Token expiry — refresh proactively N minutes before. */
  token_expires_at  timestamptz,
  /** Status flags surfaced in the integrations UI. */
  connected_at      timestamptz,
  disconnected_at   timestamptz,
  last_sync_at      timestamptz,
  last_sync_status  text CHECK (last_sync_status IS NULL OR last_sync_status IN ('success','partial','failed')),
  last_error        text,
  /** Operator-controlled mapping config — which local invoice statuses
      trigger a push, which QBO accounts to use, etc. */
  config            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qbo_invoice_mappings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  /** Local invoice id (work-order invoice from sprint 016 invoices table). */
  local_invoice_id  uuid NOT NULL,
  qbo_invoice_id    text NOT NULL,
  /** Stripe-style sync status — mirrors what the QBO API returns. */
  sync_status       text NOT NULL DEFAULT 'pushed' CHECK (sync_status IN (
                       'pushed','updated','failed','reconciled'
                    )),
  pushed_at         timestamptz NOT NULL DEFAULT now(),
  last_error        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS qbo_invoice_mappings_local_unique
  ON qbo_invoice_mappings (organization_id, local_invoice_id);
CREATE INDEX IF NOT EXISTS qbo_invoice_mappings_qbo_idx
  ON qbo_invoice_mappings (organization_id, qbo_invoice_id);

CREATE TABLE IF NOT EXISTS qbo_payment_mappings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  /** Local invoice the payment was applied to (auto-matched by recon). */
  local_invoice_id  uuid,
  qbo_payment_id    text NOT NULL,
  /** Cents to match invoices.total schema convention. */
  amount_cents      int NOT NULL DEFAULT 0,
  payment_date      date,
  /** Auto-recon confidence — 1.0 = exact-amount + same-date match;
      0.5 = amount-only with date drift; below threshold → review queue. */
  match_confidence  numeric(3,2) NOT NULL DEFAULT 1.0,
  matched_at        timestamptz NOT NULL DEFAULT now(),
  /** When low-confidence rows go to the review queue, operator confirms
      → review_status flips to 'confirmed'. */
  review_status     text NOT NULL DEFAULT 'auto' CHECK (review_status IN (
                       'auto','review','confirmed','rejected'
                    )),
  notes             text
);
CREATE INDEX IF NOT EXISTS qbo_payment_mappings_org_recent_idx
  ON qbo_payment_mappings (organization_id, matched_at DESC);
CREATE INDEX IF NOT EXISTS qbo_payment_mappings_review_idx
  ON qbo_payment_mappings (organization_id, review_status)
  WHERE review_status IN ('review','rejected');

ALTER TABLE qbo_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE qbo_invoice_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE qbo_payment_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members read qbo_sync_state" ON qbo_sync_state;
CREATE POLICY "Org members read qbo_sync_state" ON qbo_sync_state
  FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

DROP POLICY IF EXISTS "Org admins write qbo_sync_state" ON qbo_sync_state;
CREATE POLICY "Org admins write qbo_sync_state" ON qbo_sync_state
  FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL AND role IN ('owner','admin')
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL AND role IN ('owner','admin')
  ));

-- Mappings tables read-only to org members; service-role writes via sync handlers.
DROP POLICY IF EXISTS "Org members read qbo_invoice_mappings" ON qbo_invoice_mappings;
CREATE POLICY "Org members read qbo_invoice_mappings" ON qbo_invoice_mappings
  FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

DROP POLICY IF EXISTS "Org members read qbo_payment_mappings" ON qbo_payment_mappings;
CREATE POLICY "Org members read qbo_payment_mappings" ON qbo_payment_mappings
  FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

DROP TRIGGER IF EXISTS qbo_sync_state_updated_at_trg ON qbo_sync_state;
CREATE TRIGGER qbo_sync_state_updated_at_trg
  BEFORE UPDATE ON qbo_sync_state
  FOR EACH ROW EXECUTE FUNCTION stripe_subscriptions_set_updated_at();
