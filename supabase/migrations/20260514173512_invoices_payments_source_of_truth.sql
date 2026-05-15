-- Invoices / Payments source-of-truth layer.
-- Invoices own billed charges and payment status. Work orders own actual work.
-- Deposits are payment credits, not revenue line items.

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check CHECK (
  status IN (
    'draft',
    'ready_to_send',
    'sent',
    'viewed',
    'due',
    'pending',
    'partially_paid',
    'paid',
    'overdue',
    'void',
    'refunded',
    'writeoff',
    'written_off'
  )
);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source_id UUID;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS estimate_id UUID REFERENCES estimates(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payee_id UUID REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fees_total NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deposit_credit_total NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_total NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS terms TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS memo TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS signed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS signed_name TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS signed_role TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_hash TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_hash TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'internal_review'
  CHECK (approval_status IN ('internal_review', 'ready', 'approved', 'signed', 'voided'));
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid'
  CHECK (payment_status IN ('unpaid', 'pending', 'partial', 'paid', 'overdue', 'refunded', 'written_off'));
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS manual_bypass_reason TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source_context JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS owner_visible BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE invoices
SET
  source_type = COALESCE(source_type, CASE WHEN work_order_id IS NOT NULL THEN 'work_order' ELSE 'manual' END),
  source_id = COALESCE(source_id, work_order_id),
  payee_id = COALESCE(payee_id, customer_id),
  terms = COALESCE(terms, payment_terms),
  payment_total = COALESCE(payment_total, amount_paid),
  payment_status = CASE
    WHEN status = 'paid' THEN 'paid'
    WHEN status = 'partially_paid' THEN 'partial'
    WHEN status = 'overdue' THEN 'overdue'
    ELSE payment_status
  END
WHERE source_type IS NULL
   OR source_id IS NULL
   OR payee_id IS NULL
   OR terms IS NULL
   OR payment_total IS DISTINCT FROM amount_paid;

CREATE INDEX IF NOT EXISTS idx_invoices_source
  ON invoices (organization_id, source_type, source_id)
  WHERE source_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_estimate
  ON invoices (estimate_id)
  WHERE estimate_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_payment_status
  ON invoices (organization_id, payment_status, due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_aircraft_status
  ON invoices (organization_id, aircraft_id, status)
  WHERE aircraft_id IS NOT NULL;

ALTER TABLE invoice_line_items DROP CONSTRAINT IF EXISTS invoice_line_items_item_type_check;
ALTER TABLE invoice_line_items ADD CONSTRAINT invoice_line_items_item_type_check CHECK (
  item_type IN (
    'labor',
    'part',
    'service',
    'outside_service',
    'supply',
    'tax',
    'fee',
    'discount',
    'adjustment',
    'deposit_credit'
  )
);

ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS source_id UUID;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS source_label TEXT;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS tax_category TEXT;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS billable BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS owner_visible BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS approved_for_billing BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS linked_task_id UUID;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS linked_part_id UUID;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS linked_labor_id UUID;

UPDATE invoice_line_items
SET
  source_type = COALESCE(source_type, CASE WHEN work_order_line_id IS NOT NULL THEN 'work_order_line' ELSE 'manual' END),
  source_id = COALESCE(source_id, work_order_line_id),
  source_label = COALESCE(
    source_label,
    CASE
      WHEN work_order_line_id IS NOT NULL AND item_type = 'labor' THEN 'WO Actual'
      WHEN work_order_line_id IS NOT NULL AND item_type = 'part' THEN 'Installed Part'
      WHEN work_order_line_id IS NOT NULL AND item_type = 'outside_service' THEN 'Outside Service'
      WHEN work_order_line_id IS NOT NULL THEN 'Work Order'
      ELSE 'Manual'
    END
  )
WHERE source_label IS NULL OR source_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_lines_source
  ON invoice_line_items (organization_id, source_type, source_id)
  WHERE source_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_lines_billing_ready
  ON invoice_line_items (organization_id, invoice_id, approved_for_billing, billable);

ALTER TABLE work_order_lines ADD COLUMN IF NOT EXISTS approved_for_billing BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE work_order_lines ADD COLUMN IF NOT EXISTS billing_review_status TEXT NOT NULL DEFAULT 'approved'
  CHECK (billing_review_status IN ('needs_review', 'approved', 'excluded', 'disputed'));

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_payment_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_payment_method_check CHECK (
  payment_method IN (
    'cash',
    'check',
    'credit_card',
    'card',
    'stripe',
    'wire',
    'ach',
    'zelle',
    'manual',
    'deposit_credit',
    'other'
  )
);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS aircraft_id UUID REFERENCES aircraft(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'received'
  CHECK (status IN ('pending', 'received', 'verified', 'failed', 'refunded', 'voided'));
ALTER TABLE payments ADD COLUMN IF NOT EXISTS received_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS processor_reference TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS manual_reference TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS proof_attachment_id UUID;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'not_required'
  CHECK (verification_status IN ('not_required', 'pending', 'verified', 'rejected'));
ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_number TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_delivered_to TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_delivered_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE payments p
SET
  aircraft_id = COALESCE(p.aircraft_id, i.aircraft_id),
  owner_id = COALESCE(p.owner_id, i.customer_id),
  received_by = COALESCE(p.received_by, p.recorded_by),
  received_at = COALESCE(p.received_at, (p.payment_date::timestamp at time zone 'UTC')),
  manual_reference = COALESCE(p.manual_reference, p.reference_number),
  status = CASE WHEN p.status IS NULL THEN 'received' ELSE p.status END
FROM invoices i
WHERE p.invoice_id = i.id;

CREATE INDEX IF NOT EXISTS idx_payments_aircraft
  ON payments (aircraft_id, payment_date DESC)
  WHERE aircraft_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_owner
  ON payments (owner_id, payment_date DESC)
  WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_status
  ON payments (organization_id, status, verification_status, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_proofs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payment_id          UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  file_id             UUID,
  proof_type          TEXT NOT NULL DEFAULT 'upload'
                      CHECK (proof_type IN ('upload', 'photo', 'receipt', 'zelle', 'check', 'other')),
  uploaded_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at         TIMESTAMPTZ,
  verification_status TEXT NOT NULL DEFAULT 'pending'
                      CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_proofs_payment
  ON payment_proofs (payment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_org
  ON payment_proofs (organization_id, verification_status, created_at DESC);

CREATE TABLE IF NOT EXISTS invoice_receipts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payment_id      UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  receipt_number  TEXT NOT NULL,
  delivered_to    TEXT,
  delivered_at    TIMESTAMPTZ,
  pdf_hash        TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, receipt_number)
);

CREATE INDEX IF NOT EXISTS idx_invoice_receipts_invoice
  ON invoice_receipts (invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_receipts_payment
  ON invoice_receipts (payment_id);

CREATE TABLE IF NOT EXISTS invoice_share_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'link', 'print', 'pdf', 'share')),
  recipient       TEXT,
  sent_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_at       TIMESTAMPTZ,
  delivery_status TEXT NOT NULL DEFAULT 'sent'
                  CHECK (delivery_status IN ('queued', 'sent', 'opened', 'failed')),
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_invoice_share_events_invoice
  ON invoice_share_events (invoice_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_share_events_org
  ON invoice_share_events (organization_id, sent_at DESC);

CREATE TABLE IF NOT EXISTS invoice_versions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id       UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  version          INT NOT NULL,
  reason           TEXT NOT NULL,
  snapshot         JSONB NOT NULL DEFAULT '{}'::jsonb,
  invoice_hash     TEXT,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (invoice_id, version)
);

CREATE INDEX IF NOT EXISTS idx_invoice_versions_invoice
  ON invoice_versions (invoice_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_versions_org
  ON invoice_versions (organization_id, created_at DESC);

ALTER TABLE payment_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_share_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_proofs_select ON payment_proofs;
CREATE POLICY payment_proofs_select ON payment_proofs FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
DROP POLICY IF EXISTS payment_proofs_write ON payment_proofs;
CREATE POLICY payment_proofs_write ON payment_proofs FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']))
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

DROP POLICY IF EXISTS invoice_receipts_select ON invoice_receipts;
CREATE POLICY invoice_receipts_select ON invoice_receipts FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
DROP POLICY IF EXISTS invoice_receipts_write ON invoice_receipts;
CREATE POLICY invoice_receipts_write ON invoice_receipts FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']))
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

DROP POLICY IF EXISTS invoice_share_events_select ON invoice_share_events;
CREATE POLICY invoice_share_events_select ON invoice_share_events FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
DROP POLICY IF EXISTS invoice_share_events_write ON invoice_share_events;
CREATE POLICY invoice_share_events_write ON invoice_share_events FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']))
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

DROP POLICY IF EXISTS invoice_versions_select ON invoice_versions;
CREATE POLICY invoice_versions_select ON invoice_versions FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
DROP POLICY IF EXISTS invoice_versions_write ON invoice_versions;
CREATE POLICY invoice_versions_write ON invoice_versions FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin']))
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin']));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  invoices,
  invoice_line_items,
  payments,
  payment_proofs,
  invoice_receipts,
  invoice_share_events,
  invoice_versions
TO authenticated;

COMMENT ON COLUMN invoices.source_type IS 'Invoice source: work_order, aircraft, estimate, custom, or manual.';
COMMENT ON COLUMN invoices.deposit_credit_total IS 'Deposit/payment credits applied to invoice balance. Not revenue.';
COMMENT ON COLUMN invoice_line_items.source_label IS 'Human-readable reason for line: WO Actual, Installed Part, Manual, Estimate Reference, etc.';
COMMENT ON COLUMN invoice_line_items.approved_for_billing IS 'Line is reviewed and allowed to appear on billed invoice.';
COMMENT ON TABLE payment_proofs IS 'Uploaded/manual payment proof records such as Zelle proof or check photos.';
COMMENT ON TABLE invoice_receipts IS 'Receipt records generated after verified payment.';
COMMENT ON TABLE invoice_share_events IS 'Send/share/print/download audit projection for invoices.';
COMMENT ON TABLE invoice_versions IS 'Signed/exported invoice revision snapshots. Avoids silent overwrite.';
