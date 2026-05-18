-- SOP-DOC-001: Document & Persona Architecture
-- Item 4 — operation_type: the sub-classification of the OWNER persona.
--
-- operation_type controls which dashboard modules / intelligence features are
-- shown for an owner organization. It NEVER affects document upload or view
-- permissions — the Document Iron Wall (SOP-DOC-001 Section 4) applies to all
-- owner operation types equally.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS operation_type TEXT NOT NULL DEFAULT 'private'
  CHECK (operation_type IN ('private','partnership','flight_school','flying_club','corporate'));

COMMENT ON COLUMN organizations.operation_type IS
  'Owner persona sub-type. Controls dashboard module visibility only — does NOT affect document permissions. See SOP-DOC-001.';

-- Index for dashboard queries that filter by operation_type
CREATE INDEX IF NOT EXISTS idx_organizations_operation_type ON organizations(operation_type);
