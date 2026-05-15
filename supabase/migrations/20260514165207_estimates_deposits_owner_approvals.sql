-- Estimates / Deposits / Owner Approvals source-of-truth layer.
-- Estimate remains planned commercial scope. Work orders remain execution truth.
-- Deposits are payment credits, not estimate line items.

ALTER TABLE estimates DROP CONSTRAINT IF EXISTS estimates_status_check;
ALTER TABLE estimates ADD CONSTRAINT estimates_status_check CHECK (
  status IN (
    'draft',
    'internal_review',
    'ready_to_send',
    'sent',
    'viewed',
    'owner_question',
    'awaiting_approval',
    'awaiting_deposit',
    'approved',
    'deposit_paid',
    'rejected',
    'declined',
    'expired',
    'superseded',
    'converted',
    'converted_to_work_order',
    'archived'
  )
);

ALTER TABLE estimates ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS source_id UUID;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS estimate_type TEXT;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS price_book_id UUID;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS tax_profile_id UUID;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS terms TEXT;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS deposit_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS deposit_due_policy TEXT;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS deposit_status TEXT NOT NULL DEFAULT 'not_required'
  CHECK (deposit_status IN ('not_required', 'requested', 'pending', 'paid', 'waived', 'failed', 'refunded'));
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'not_requested'
  CHECK (approval_status IN ('not_requested', 'internal_review', 'ready', 'sent', 'viewed', 'owner_question', 'approved', 'declined', 'expired', 'superseded'));
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS approved_by_identity JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS converted_work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS owner_approval_summary TEXT;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS ai_review_status TEXT NOT NULL DEFAULT 'not_started'
  CHECK (ai_review_status IN ('not_started', 'draft', 'needs_review', 'accepted', 'rejected', 'superseded'));

UPDATE estimates
SET converted_work_order_id = COALESCE(converted_work_order_id, linked_work_order_id)
WHERE linked_work_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_estimates_approval_status
  ON estimates (organization_id, approval_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_estimates_deposit_status
  ON estimates (organization_id, deposit_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_estimates_source
  ON estimates (organization_id, source_type, source_id)
  WHERE source_type IS NOT NULL;

ALTER TABLE estimate_line_items DROP CONSTRAINT IF EXISTS estimate_line_items_item_type_check;
ALTER TABLE estimate_line_items ADD CONSTRAINT estimate_line_items_item_type_check CHECK (
  item_type IN ('labor', 'part', 'outside_service', 'service', 'supply', 'tax', 'fee', 'discount')
);

ALTER TABLE estimate_line_items ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE estimate_line_items ADD COLUMN IF NOT EXISTS source_id UUID;
ALTER TABLE estimate_line_items ADD COLUMN IF NOT EXISTS source_label TEXT;
ALTER TABLE estimate_line_items ADD COLUMN IF NOT EXISTS billable BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE estimate_line_items ADD COLUMN IF NOT EXISTS owner_visible BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE estimate_line_items ADD COLUMN IF NOT EXISTS inventory_part_id UUID REFERENCES inventory_parts(id) ON DELETE SET NULL;
ALTER TABLE estimate_line_items ADD COLUMN IF NOT EXISTS inventory_status TEXT;
ALTER TABLE estimate_line_items ADD COLUMN IF NOT EXISTS tax_code TEXT;
ALTER TABLE estimate_line_items ADD COLUMN IF NOT EXISTS amount_snapshot NUMERIC(10,2);

UPDATE estimate_line_items
SET
  source_label = COALESCE(source_label, 'Manual'),
  amount_snapshot = COALESCE(amount_snapshot, line_total)
WHERE source_label IS NULL OR amount_snapshot IS NULL;

CREATE INDEX IF NOT EXISTS idx_estimate_lines_source
  ON estimate_line_items (organization_id, source_type, source_id)
  WHERE source_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estimate_lines_inventory
  ON estimate_line_items (inventory_part_id)
  WHERE inventory_part_id IS NOT NULL;

ALTER TABLE work_order_lines ADD COLUMN IF NOT EXISTS planned_from_estimate_id UUID REFERENCES estimates(id) ON DELETE SET NULL;
ALTER TABLE work_order_lines ADD COLUMN IF NOT EXISTS estimate_line_item_id UUID REFERENCES estimate_line_items(id) ON DELETE SET NULL;
ALTER TABLE work_order_lines ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE work_order_lines ADD COLUMN IF NOT EXISTS source_id UUID;
ALTER TABLE work_order_lines ADD COLUMN IF NOT EXISTS source_label TEXT;
ALTER TABLE work_order_lines ADD COLUMN IF NOT EXISTS billable BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE work_order_lines ADD COLUMN IF NOT EXISTS owner_visible BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_wo_lines_estimate_source
  ON work_order_lines (planned_from_estimate_id, estimate_line_item_id)
  WHERE planned_from_estimate_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS estimate_ai_drafts (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  estimate_id        UUID REFERENCES estimates(id) ON DELETE CASCADE,
  aircraft_id        UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  prompt             TEXT,
  transcript         TEXT,
  attachments        JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_squawk_ids UUID[] NOT NULL DEFAULT '{}',
  model_output_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence         NUMERIC,
  warnings           JSONB NOT NULL DEFAULT '[]'::jsonb,
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'needs_review', 'accepted', 'rejected', 'superseded')),
  accepted_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at        TIMESTAMPTZ,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estimate_ai_drafts_estimate
  ON estimate_ai_drafts (estimate_id, created_at DESC)
  WHERE estimate_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estimate_ai_drafts_org
  ON estimate_ai_drafts (organization_id, status, created_at DESC);

DROP TRIGGER IF EXISTS trg_estimate_ai_drafts_updated_at ON estimate_ai_drafts;
CREATE TRIGGER trg_estimate_ai_drafts_updated_at
  BEFORE UPDATE ON estimate_ai_drafts
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS owner_approvals (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  estimate_id              UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  aircraft_id              UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  owner_id                 UUID REFERENCES customers(id) ON DELETE SET NULL,
  guest_identity           JSONB NOT NULL DEFAULT '{}'::jsonb,
  approved_scope_snapshot  JSONB NOT NULL DEFAULT '{}'::jsonb,
  approved_amount          NUMERIC(10,2) NOT NULL DEFAULT 0,
  approved_terms           TEXT,
  deposit_status           TEXT,
  action                   TEXT NOT NULL CHECK (action IN ('approved', 'declined', 'question')),
  ip_address               INET,
  device_metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  signature_or_typed_name  TEXT,
  created_by               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_owner_approvals_estimate
  ON owner_approvals (estimate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_owner_approvals_org
  ON owner_approvals (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS deposit_payments (
  id                         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  estimate_id                UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  owner_id                   UUID REFERENCES customers(id) ON DELETE SET NULL,
  method                     TEXT NOT NULL CHECK (method IN ('card', 'zelle', 'cash', 'check', 'ach', 'manual', 'none')),
  amount                     NUMERIC(10,2) NOT NULL DEFAULT 0,
  status                     TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'paid', 'failed', 'waived', 'refunded', 'verified')),
  proof_attachment_id         UUID,
  external_payment_reference TEXT,
  verified_by                UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at                TIMESTAMPTZ,
  applies_to_invoice_id      UUID REFERENCES invoices(id) ON DELETE SET NULL,
  metadata                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deposit_payments_estimate
  ON deposit_payments (estimate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposit_payments_org
  ON deposit_payments (organization_id, status, created_at DESC);

DROP TRIGGER IF EXISTS trg_deposit_payments_updated_at ON deposit_payments;
CREATE TRIGGER trg_deposit_payments_updated_at
  BEFORE UPDATE ON deposit_payments
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS estimate_revisions (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  estimate_id        UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  revision_number    INT NOT NULL DEFAULT 1,
  reason             TEXT NOT NULL,
  before_snapshot    JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_snapshot     JSONB NOT NULL DEFAULT '{}'::jsonb,
  requires_owner_approval BOOLEAN NOT NULL DEFAULT FALSE,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (estimate_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_estimate_revisions_estimate
  ON estimate_revisions (estimate_id, revision_number DESC);
CREATE INDEX IF NOT EXISTS idx_estimate_revisions_org
  ON estimate_revisions (organization_id, created_at DESC);

ALTER TABLE estimate_ai_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposit_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estimate_ai_drafts_select ON estimate_ai_drafts;
CREATE POLICY estimate_ai_drafts_select ON estimate_ai_drafts FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
DROP POLICY IF EXISTS estimate_ai_drafts_write ON estimate_ai_drafts;
CREATE POLICY estimate_ai_drafts_write ON estimate_ai_drafts FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']))
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

DROP POLICY IF EXISTS owner_approvals_select ON owner_approvals;
CREATE POLICY owner_approvals_select ON owner_approvals FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
DROP POLICY IF EXISTS owner_approvals_write ON owner_approvals;
CREATE POLICY owner_approvals_write ON owner_approvals FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']))
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

DROP POLICY IF EXISTS deposit_payments_select ON deposit_payments;
CREATE POLICY deposit_payments_select ON deposit_payments FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
DROP POLICY IF EXISTS deposit_payments_write ON deposit_payments;
CREATE POLICY deposit_payments_write ON deposit_payments FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']))
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

DROP POLICY IF EXISTS estimate_revisions_select ON estimate_revisions;
CREATE POLICY estimate_revisions_select ON estimate_revisions FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
DROP POLICY IF EXISTS estimate_revisions_write ON estimate_revisions;
CREATE POLICY estimate_revisions_write ON estimate_revisions FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']))
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  estimate_ai_drafts,
  owner_approvals,
  deposit_payments,
  estimate_revisions
TO authenticated;

COMMENT ON TABLE estimate_ai_drafts IS 'AI-created estimate scope and line-item drafts. Human acceptance is required before owner delivery.';
COMMENT ON TABLE owner_approvals IS 'Audited owner approval, decline, or question records for estimates.';
COMMENT ON TABLE deposit_payments IS 'Structured deposit/payment credits linked to estimates and later invoices.';
COMMENT ON TABLE estimate_revisions IS 'Revision/change-order history for post-approval estimate changes.';
COMMENT ON COLUMN work_order_lines.planned_from_estimate_id IS 'Estimate that planned this work-order line. Work order actuals remain execution truth.';
COMMENT ON COLUMN work_order_lines.estimate_line_item_id IS 'Source estimate line item used to create this planned work-order line.';
