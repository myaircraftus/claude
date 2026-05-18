-- SOP-DOC-001: Document & Persona Architecture
-- Schema for Items 5 & 6 — shared-records attribution + owner visibility on
-- the documents table.
--
-- uploader_persona      — which persona uploaded the document. Drives the
--                         "Shared by [shop]" attribution badge and owner
--                         edit/delete gating: owners may view but never edit
--                         or delete a shop-uploaded record (SOP §5.3).
-- owner_visible         — whether the aircraft owner may see this document.
--                         A shop's cross-aircraft MRO library is not owner
--                         visible; aircraft-specific records are.
-- published_to_owner_at — set when a shop explicitly shares a document to the
--                         owner via the Shared Records Flow (SOP §5).

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS uploader_persona TEXT
    CHECK (uploader_persona IN ('owner','shop','admin'));

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS owner_visible BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS published_to_owner_at TIMESTAMPTZ;

COMMENT ON COLUMN documents.uploader_persona IS
  'Persona that uploaded the document (owner | shop | admin). NULL for legacy rows whose uploader is no longer a member. See SOP-DOC-001 §6.';
COMMENT ON COLUMN documents.owner_visible IS
  'True when the aircraft owner may see this document. Shop MRO-library docs are false. See SOP-DOC-001 §5.';
COMMENT ON COLUMN documents.published_to_owner_at IS
  'Timestamp a shop explicitly shared this document to the owner (Shared Records Flow). NULL = not shared via the flow. See SOP-DOC-001 §5.';

-- Backfill uploader_persona from the uploader's org-membership persona.
UPDATE documents d
SET uploader_persona = om.persona
FROM organization_memberships om
WHERE om.user_id = d.uploaded_by
  AND om.organization_id = d.organization_id
  AND om.persona IN ('owner','shop')
  AND d.uploader_persona IS NULL;

-- A shop's cross-aircraft reference library (shop-uploaded, no aircraft_id)
-- is the MRO Library — not owner-visible. Owner-uploaded documents and any
-- aircraft-specific record stay visible so no existing data is hidden.
UPDATE documents
SET owner_visible = FALSE
WHERE uploader_persona = 'shop' AND aircraft_id IS NULL;

-- Index for the owner documents page (owner_visible filter).
CREATE INDEX IF NOT EXISTS idx_documents_owner_visible ON documents(owner_visible);
