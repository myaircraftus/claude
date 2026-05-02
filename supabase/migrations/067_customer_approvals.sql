-- Migration 067: Customer Approvals portal (Spec 1.5)
--
-- Customer-facing approval flow on quoted work. The operator builds an
-- ApprovalRequest from a WO + selected line items, gets a public token
-- to share, the customer opens the link (no auth — token is the auth)
-- and approves / denies / defers each line. Deferred items
-- automatically become continued_items (1.4 cross-wire) so they follow
-- the aircraft.
--
-- Path B: existing `estimates` (040) is a different concept — internal
-- operator-facing pricing/quoting with a status enum, no public token,
-- no per-line customer response. Kept untouched per "add, don't replace".

-- ─── 1. approval_requests ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS approval_requests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Source WO (nullable: an approval can also be built freeform without
  -- a backing work order — e.g. for an estimate that hasn't yet been
  -- promoted to a WO).
  work_order_id   UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  customer_id     UUID REFERENCES customers(id)   ON DELETE SET NULL,
  aircraft_id     UUID REFERENCES aircraft(id)    ON DELETE SET NULL,

  -- Unguessable URL token. UNIQUE so /approve/<token> resolves to one
  -- request. Stored in a TEXT column rather than UUID so we can use a
  -- longer base32 token (collision-proof at scale, more URL-friendly than
  -- UUIDs).
  public_token    TEXT NOT NULL UNIQUE,

  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'partially-responded', 'completed', 'expired')),
  -- Subject line + freeform message shown above the line items in the
  -- public view. Operator-controlled — not the line-item descriptions.
  subject         TEXT,
  message         TEXT,

  sent_date       TIMESTAMPTZ,
  responded_date  TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,

  -- Audit
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_org      ON approval_requests(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_requests_wo       ON approval_requests(work_order_id) WHERE work_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_approval_requests_customer ON approval_requests(customer_id)  WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_approval_requests_status   ON approval_requests(organization_id, status);
-- Token lookup needs to be fast (every customer link click hits this).
CREATE INDEX IF NOT EXISTS idx_approval_requests_token    ON approval_requests(public_token);

-- ─── 2. approval_line_items ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS approval_line_items (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  approval_request_id   UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  description           TEXT NOT NULL,
  estimated_cost        NUMERIC(10,2) NOT NULL DEFAULT 0,
  labor_hours           NUMERIC(8,1)  NOT NULL DEFAULT 0,
  parts_cost            NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- URLs of photos for this line item — stored as TEXT[] until file
  -- storage wiring lands (logged follow-up). Empty by default.
  photo_urls            TEXT[] NOT NULL DEFAULT '{}'::TEXT[],

  -- Customer response. NULL while waiting; set on /respond.
  customer_response     TEXT
    CHECK (customer_response IS NULL OR customer_response IN ('approved', 'denied', 'deferred')),
  customer_comment      TEXT,
  responded_at          TIMESTAMPTZ,
  -- The continued_items row created when customer_response='deferred'.
  -- Tracks the cross-wire so we don't create duplicates on idempotent
  -- /respond calls.
  resulting_continued_item UUID REFERENCES continued_items(id) ON DELETE SET NULL,

  -- Optional FK to a work_order_line for downstream WO-status validation
  -- (denied items can't be billed; spec calls for this).
  work_order_line_id    UUID,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_line_items_request ON approval_line_items(approval_request_id, sort_order);

-- ─── 3. RLS ────────────────────────────────────────────────────────────────

ALTER TABLE approval_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_line_items ENABLE ROW LEVEL SECURITY;

-- approval_requests: org-member read; mechanic+/admin/owner write.
DROP POLICY IF EXISTS approval_requests_org_read  ON approval_requests;
DROP POLICY IF EXISTS approval_requests_org_write ON approval_requests;

CREATE POLICY approval_requests_org_read ON approval_requests
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

CREATE POLICY approval_requests_org_write ON approval_requests
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid()
        AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin', 'mechanic')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid()
        AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin', 'mechanic')
    )
  );

-- approval_line_items: gated through parent approval_request's org.
-- Public token access bypasses RLS via service-role client in
-- /api/public/approvals routes.
DROP POLICY IF EXISTS approval_line_items_org_read  ON approval_line_items;
DROP POLICY IF EXISTS approval_line_items_org_write ON approval_line_items;

CREATE POLICY approval_line_items_org_read ON approval_line_items
  FOR SELECT
  USING (
    approval_request_id IN (
      SELECT id FROM approval_requests
      WHERE organization_id IN (
        SELECT organization_id FROM organization_memberships
        WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
      )
    )
  );

CREATE POLICY approval_line_items_org_write ON approval_line_items
  FOR ALL
  USING (
    approval_request_id IN (
      SELECT id FROM approval_requests
      WHERE organization_id IN (
        SELECT organization_id FROM organization_memberships
        WHERE user_id = auth.uid()
          AND accepted_at IS NOT NULL
          AND role IN ('owner', 'admin', 'mechanic')
      )
    )
  )
  WITH CHECK (
    approval_request_id IN (
      SELECT id FROM approval_requests
      WHERE organization_id IN (
        SELECT organization_id FROM organization_memberships
        WHERE user_id = auth.uid()
          AND accepted_at IS NOT NULL
          AND role IN ('owner', 'admin', 'mechanic')
      )
    )
  );

-- ─── 4. updated_at triggers ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_approvals_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS approval_requests_set_updated_at   ON approval_requests;
DROP TRIGGER IF EXISTS approval_line_items_set_updated_at ON approval_line_items;

CREATE TRIGGER approval_requests_set_updated_at
  BEFORE UPDATE ON approval_requests
  FOR EACH ROW EXECUTE FUNCTION trg_approvals_set_updated_at();

CREATE TRIGGER approval_line_items_set_updated_at
  BEFORE UPDATE ON approval_line_items
  FOR EACH ROW EXECUTE FUNCTION trg_approvals_set_updated_at();

-- ─── 5. Comments ───────────────────────────────────────────────────────────

COMMENT ON TABLE  approval_requests   IS 'Customer-facing approval requests (Spec 1.5). Public access via approval_requests.public_token without auth.';
COMMENT ON COLUMN approval_requests.public_token IS 'Cryptographically random URL token. Generated server-side via lib/approvals/token.ts.';
COMMENT ON COLUMN approval_line_items.resulting_continued_item IS 'When customer_response=''deferred'', the continued_items row created (Sprint 1.4 cross-wire). Used for idempotency on repeated /respond calls.';
