-- Migration 081: Intake Documents (Spec 7.2)
--
-- Each row represents one inbound bill/receipt awaiting extraction +
-- review. Three sources:
--   upload — operator uploaded a PDF/image via the UI
--   email  — SendGrid Inbound Parse webhook posted a forwarded bill
--   manual — operator typed the cost directly (already in cost_entries
--            from 7.1; this is a degenerate intake row for audit/parity)
--
-- Status lifecycle:
--   received → extracting → extracted → review → posted
--                                     ↘ rejected
--
-- Sprint 7.3 will add the extraction trigger + extraction_results
-- table (082). 7.2 just lands rows with status='received'; the
-- extraction step is a separate sprint.

CREATE TABLE IF NOT EXISTS intake_documents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uploaded_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  source          TEXT NOT NULL
    CHECK (source IN ('upload', 'email', 'manual')),

  -- Original filename (from upload) or synthetic ("email-{ts}.pdf").
  filename        TEXT NOT NULL,
  -- Path within Supabase Storage (no signed URL — caller fetches per-
  -- request). NULL allowed for source='manual' (no file artifact).
  storage_path    TEXT,
  -- Public-ish URL for the operator UI thumbnail. Storage bucket is
  -- 'cost-receipts' (created in this migration).
  storage_url     TEXT,
  mime_type       TEXT,
  file_size_bytes BIGINT,

  -- Email-source metadata. Captured from SendGrid Inbound Parse.
  email_from      TEXT,
  email_subject   TEXT,
  email_received_at TIMESTAMPTZ,

  status          TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN (
      'received',     -- file landed, no extraction yet
      'extracting',   -- 7.3 extractor running
      'extracted',    -- extraction complete, awaiting review
      'review',       -- operator viewing
      'posted',       -- cost_entries row(s) created + approved
      'rejected'      -- operator dismissed (spam, wrong org, duplicate)
    )),

  extraction_started_at   TIMESTAMPTZ,
  extraction_completed_at TIMESTAMPTZ,
  -- Array of cost_entries.id rows produced by extraction. Empty until
  -- 7.3 lands; 7.2 leaves it [].
  resulting_cost_entry_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],

  error_message   TEXT,
  notes           TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hot path: operator's intake queue ("show me unposted intake"). The
-- partial index keeps the row count tight even after years of postings.
CREATE INDEX IF NOT EXISTS intake_documents_org_pending_idx
  ON intake_documents (organization_id, created_at DESC)
  WHERE status NOT IN ('posted', 'rejected');
CREATE INDEX IF NOT EXISTS intake_documents_org_idx
  ON intake_documents (organization_id, created_at DESC);
-- Email dedupe: same sender + same subject + same day = likely a resend.
CREATE INDEX IF NOT EXISTS intake_documents_email_dedupe_idx
  ON intake_documents (organization_id, email_from, email_received_at DESC)
  WHERE source = 'email' AND email_from IS NOT NULL;

ALTER TABLE intake_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intake_documents_org_read ON intake_documents;
DROP POLICY IF EXISTS intake_documents_org_write ON intake_documents;

CREATE POLICY intake_documents_org_read ON intake_documents
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

CREATE POLICY intake_documents_org_write ON intake_documents
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin', 'mechanic', 'pilot')
    )
  ) WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin', 'mechanic', 'pilot')
    )
  );

-- Updated_at trigger reuses the helper function shape.
CREATE OR REPLACE FUNCTION trg_intake_documents_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS intake_documents_set_updated_at ON intake_documents;
CREATE TRIGGER intake_documents_set_updated_at
  BEFORE UPDATE ON intake_documents
  FOR EACH ROW EXECUTE FUNCTION trg_intake_documents_set_updated_at();

-- ─── 2. Storage bucket for cost receipts ────────────────────────────────────

-- Private bucket (signed URL only). RLS on storage.objects gates
-- read/write to org members.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cost-receipts',
  'cost-receipts',
  FALSE,
  10 * 1024 * 1024,           -- 10 MB cap
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- ─── 3. Now back-reference cost_entries.intake_document_id ──────────────────

-- The 080 migration created the column unconstrained (no FK) so this 081
-- migration could add the FK after intake_documents exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='cost_entries'
      AND constraint_name='cost_entries_intake_document_id_fkey'
  ) THEN
    ALTER TABLE cost_entries
      ADD CONSTRAINT cost_entries_intake_document_id_fkey
      FOREIGN KEY (intake_document_id)
      REFERENCES intake_documents(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS cost_entries_intake_idx
  ON cost_entries (intake_document_id)
  WHERE intake_document_id IS NOT NULL;

COMMENT ON TABLE intake_documents IS 'Spec 7.2 — inbound bill/receipt awaiting extraction (7.3) + review. Sources: upload / email (SendGrid Inbound Parse) / manual.';
COMMENT ON COLUMN intake_documents.status IS 'received → extracting (7.3 starts) → extracted → review → posted | rejected.';
