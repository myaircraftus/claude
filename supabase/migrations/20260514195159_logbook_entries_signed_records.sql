-- Logbook Entries signed-record foundation.
-- This extends the legacy draft/final/signed table into the component-specific,
-- source-linked recordkeeping workflow described in the Logbook SOP.

ALTER TABLE logbook_entries
  ADD COLUMN IF NOT EXISTS target_logbook TEXT,
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_id UUID,
  ADD COLUMN IF NOT EXISTS source_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_references JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS signer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS certificate_number TEXT,
  ADD COLUMN IF NOT EXISTS certificate_type TEXT,
  ADD COLUMN IF NOT EXISTS ia_flag BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS revision_number INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS supersedes_entry_id UUID REFERENCES logbook_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS previous_revision_hash TEXT,
  ADD COLUMN IF NOT EXISTS entry_hash TEXT,
  ADD COLUMN IF NOT EXISTS pdf_hash TEXT,
  ADD COLUMN IF NOT EXISTS signature_reason TEXT,
  ADD COLUMN IF NOT EXISTS signature_audit JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_review_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (ai_review_status IN ('draft', 'suggested', 'needs_review', 'accepted_by_human', 'rejected', 'superseded')),
  ADD COLUMN IF NOT EXISTS ai_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS owner_visible BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ready_for_review_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ready_to_sign_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS printed_unsigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_to_owner_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

UPDATE logbook_entries
SET
  target_logbook = COALESCE(
    target_logbook,
    CASE
      WHEN logbook_type = 'prop' THEN 'propeller'
      WHEN logbook_type IN ('airframe', 'engine', 'avionics') THEN logbook_type
      ELSE NULL
    END
  ),
  source_type = COALESCE(source_type, CASE WHEN work_order_id IS NOT NULL THEN 'work_order' ELSE NULL END),
  source_id = COALESCE(source_id, work_order_id),
  certificate_number = COALESCE(certificate_number, mechanic_cert_number),
  certificate_type = COALESCE(certificate_type, cert_type),
  signer_id = COALESCE(signer_id, signed_by),
  revision_number = GREATEST(COALESCE(revision_number, 1), COALESCE(version, 1));

ALTER TABLE logbook_entries
  DROP CONSTRAINT IF EXISTS logbook_entries_status_check;

ALTER TABLE logbook_entries
  ADD CONSTRAINT logbook_entries_status_check
  CHECK (status IN (
    'draft',
    'ready_for_review',
    'ready_to_sign',
    'final',
    'signed',
    'published_to_owner',
    'printed_unsigned',
    'superseded',
    'voided',
    'voided_with_reason',
    'amended'
  ));

ALTER TABLE logbook_entries
  DROP CONSTRAINT IF EXISTS logbook_entries_logbook_type_check;

ALTER TABLE logbook_entries
  ADD CONSTRAINT logbook_entries_logbook_type_check
  CHECK (
    logbook_type IS NULL
    OR logbook_type IN ('airframe', 'engine', 'prop', 'propeller', 'avionics', 'appliance', 'component', 'multiple')
  );

ALTER TABLE logbook_entries
  DROP CONSTRAINT IF EXISTS logbook_entries_target_logbook_check;

ALTER TABLE logbook_entries
  ADD CONSTRAINT logbook_entries_target_logbook_check
  CHECK (
    target_logbook IS NULL
    OR target_logbook IN ('airframe', 'engine', 'propeller', 'avionics', 'appliance', 'component')
  );

CREATE INDEX IF NOT EXISTS idx_logbook_entries_target_logbook
  ON logbook_entries (organization_id, target_logbook)
  WHERE target_logbook IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_logbook_entries_source
  ON logbook_entries (organization_id, source_type, source_id)
  WHERE source_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_logbook_entries_revision_chain
  ON logbook_entries (supersedes_entry_id, revision_number)
  WHERE supersedes_entry_id IS NOT NULL;

ALTER TABLE signature_certificates
  ADD COLUMN IF NOT EXISTS logbook_entry_id UUID REFERENCES logbook_entries(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS signer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS certificate_number TEXT,
  ADD COLUMN IF NOT EXISTS certificate_type TEXT,
  ADD COLUMN IF NOT EXISTS ia_flag BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mfa_event_id TEXT,
  ADD COLUMN IF NOT EXISTS signature_reason TEXT,
  ADD COLUMN IF NOT EXISTS entry_hash TEXT,
  ADD COLUMN IF NOT EXISTS pdf_hash TEXT,
  ADD COLUMN IF NOT EXISTS previous_revision_hash TEXT,
  ADD COLUMN IF NOT EXISTS source_references JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE signature_certificates
SET
  logbook_entry_id = COALESCE(logbook_entry_id, document_id)
WHERE document_type = 'logbook_entry'
  AND EXISTS (
    SELECT 1 FROM logbook_entries
    WHERE logbook_entries.id = signature_certificates.document_id
  );

UPDATE signature_certificates
SET
  signer_user_id = COALESCE(signer_user_id, signer_id),
  certificate_number = COALESCE(certificate_number, signer_certificate_number),
  certificate_type = COALESCE(certificate_type, signer_role),
  entry_hash = COALESCE(entry_hash, document_hash),
  pdf_hash = COALESCE(pdf_hash, document_hash);

CREATE INDEX IF NOT EXISTS idx_signature_certificates_logbook_entry
  ON signature_certificates (logbook_entry_id)
  WHERE logbook_entry_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS logbook_source_bundles (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  logbook_entry_id    UUID NOT NULL REFERENCES logbook_entries(id) ON DELETE CASCADE,
  aircraft_id         UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  work_order_id       UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  task_ids            UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  checklist_item_ids  UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  part_ids            UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  ad_sb_ids           TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  attachment_ids      UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  ai_summary_id       UUID,
  source_snapshot     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (logbook_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_logbook_source_bundles_aircraft
  ON logbook_source_bundles (aircraft_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logbook_source_bundles_work_order
  ON logbook_source_bundles (work_order_id)
  WHERE work_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS logbook_entry_revisions (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  logbook_entry_id         UUID NOT NULL REFERENCES logbook_entries(id) ON DELETE CASCADE,
  revision_number          INT NOT NULL,
  previous_entry_hash      TEXT,
  entry_hash               TEXT,
  snapshot                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason                   TEXT NOT NULL,
  created_by               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (logbook_entry_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_logbook_entry_revisions_entry
  ON logbook_entry_revisions (logbook_entry_id, revision_number DESC);
CREATE INDEX IF NOT EXISTS idx_logbook_entry_revisions_org
  ON logbook_entry_revisions (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS logbook_output_events (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  logbook_entry_id    UUID NOT NULL REFERENCES logbook_entries(id) ON DELETE CASCADE,
  aircraft_id         UUID REFERENCES aircraft(id) ON DELETE CASCADE,
  action              TEXT NOT NULL
                      CHECK (action IN ('print_unsigned', 'email_signed_pdf', 'share_link', 'publish_owner', 'download_pdf')),
  channel             TEXT,
  recipient           TEXT,
  actor_id            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_logbook_output_events_entry
  ON logbook_output_events (logbook_entry_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_logbook_output_events_aircraft
  ON logbook_output_events (aircraft_id, occurred_at DESC)
  WHERE aircraft_id IS NOT NULL;

ALTER TABLE logbook_source_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE logbook_entry_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE logbook_output_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS logbook_source_bundles_select ON logbook_source_bundles;
CREATE POLICY logbook_source_bundles_select ON logbook_source_bundles FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
DROP POLICY IF EXISTS logbook_source_bundles_write ON logbook_source_bundles;
CREATE POLICY logbook_source_bundles_write ON logbook_source_bundles FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']))
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

DROP POLICY IF EXISTS logbook_entry_revisions_select ON logbook_entry_revisions;
CREATE POLICY logbook_entry_revisions_select ON logbook_entry_revisions FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
DROP POLICY IF EXISTS logbook_entry_revisions_write ON logbook_entry_revisions;
CREATE POLICY logbook_entry_revisions_write ON logbook_entry_revisions FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']))
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

DROP POLICY IF EXISTS logbook_output_events_select ON logbook_output_events;
CREATE POLICY logbook_output_events_select ON logbook_output_events FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
DROP POLICY IF EXISTS logbook_output_events_write ON logbook_output_events;
CREATE POLICY logbook_output_events_write ON logbook_output_events FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']))
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  logbook_entries,
  signature_certificates,
  logbook_source_bundles,
  logbook_entry_revisions,
  logbook_output_events
TO authenticated;

COMMENT ON COLUMN logbook_entries.target_logbook IS 'Component-specific logbook target: airframe, engine, propeller, avionics, appliance, or component.';
COMMENT ON COLUMN logbook_entries.source_references IS 'Structured source references used to generate the human-reviewed logbook entry.';
COMMENT ON COLUMN logbook_entries.signature_audit IS 'UI/audit projection of signing controls and identity metadata. Signature certificate remains the immutable authority.';
COMMENT ON TABLE logbook_source_bundles IS 'Source bundle behind a generated logbook entry: WO facts, tasks, checklist, parts, AD/SB, attachments, and AI summary references.';
COMMENT ON TABLE logbook_entry_revisions IS 'Revision snapshots for signed or exported logbook entries. Avoids silent overwrite.';
COMMENT ON TABLE logbook_output_events IS 'Print/email/share/publish events for logbook entry output and owner delivery.';
