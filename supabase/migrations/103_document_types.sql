-- Migration 103: Document type taxonomy + persona-strict upload RLS
--
-- Phase 13 Sprint 13.1 — every document gets a strict `document_type` from a
-- larger taxonomy than the legacy `doc_type` enum (mig 004), an `aircraft_id`
-- (already present), and an `uploaded_by_persona` so we can audit who uploaded
-- what. RLS INSERT policies enforce who can upload which types — UI gating is
-- defense in depth, not the only barrier.
--
-- Backwards compat:
--   * The legacy `doc_type` enum column stays as-is. Reads continue to work.
--   * `document_type` is a new TEXT column, defaulted to 'other' so existing
--     INSERT paths that don't set it remain valid.
--   * The CHECK constraint covers ALL legal values; backfill below maps existing
--     rows from `doc_type` → `document_type` so the constraint passes.
--   * Existing INSERT policy ("documents_insert" from 011_rls.sql) is preserved
--     and remains the BASELINE (org-membership check). The new persona-strict
--     policy is ADDITIVE: an INSERT must satisfy BOTH the existing policy AND
--     the new persona policy. PostgreSQL combines multiple FOR INSERT policies
--     with OR, so we DROP the old one and CREATE a single combined policy that
--     ANDs the org check with the persona-vs-type check.

BEGIN;

-- ─── 1. Helper: resolve the user's persona within a specific org ─────────────
-- Same fallback chain as lib/persona/server.ts:
--   is_platform_admin → 'admin'
--   organization_memberships.persona → that value
--   user_profiles.persona → that value
--   else → 'owner'
CREATE OR REPLACE FUNCTION public.user_persona_in_org(p_org_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    CASE
      WHEN COALESCE(up.is_platform_admin, FALSE) THEN 'admin'
      WHEN om.persona IS NOT NULL THEN om.persona
      WHEN up.persona IS NOT NULL THEN up.persona
      ELSE 'owner'
    END
  FROM user_profiles up
  LEFT JOIN organization_memberships om
    ON om.user_id = up.id
    AND om.organization_id = p_org_id
    AND om.accepted_at IS NOT NULL
  WHERE up.id = auth.uid()
  LIMIT 1
$$;

COMMENT ON FUNCTION public.user_persona_in_org(UUID) IS
  'Resolve the calling user''s persona for the given org. Mirrors lib/persona/server.ts fallback (is_platform_admin → membership.persona → profile.persona → ''owner'').';

-- ─── 2. New columns on documents ─────────────────────────────────────────────

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'other';

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS uploaded_by_persona TEXT NOT NULL DEFAULT 'owner';

-- aircraft_id already exists from migration 004; intentionally NOT re-added.

-- ─── 3. Backfill document_type from legacy doc_type ──────────────────────────
-- This maps the 17 legacy enum values onto the 23-value taxonomy below.
-- The mapping is best-effort:
--   * Aircraft-specific records keep their identity but get the aircraft_ prefix
--   * Reference manuals stay as-is
--   * Compliance / form_337 / form_8130 → other (compliance form, no narrower bucket)
--   * miscellaneous → other
UPDATE documents SET document_type = CASE doc_type::text
  WHEN 'logbook'                  THEN 'aircraft_logbook'
  WHEN 'poh'                      THEN 'aircraft_poh'
  WHEN 'afm'                      THEN 'aircraft_afm'
  WHEN 'afm_supplement'           THEN 'aircraft_afm'
  WHEN 'maintenance_manual'       THEN 'maintenance_manual'
  WHEN 'service_manual'           THEN 'maintenance_manual'
  WHEN 'parts_catalog'            THEN 'parts_catalog'
  WHEN 'service_bulletin'         THEN 'service_bulletin'
  WHEN 'airworthiness_directive'  THEN 'airworthiness_directive'
  WHEN 'work_order'               THEN 'work_order_attachment'
  WHEN 'inspection_report'        THEN 'aircraft_annual'
  WHEN 'form_337'                 THEN 'other'
  WHEN 'form_8130'                THEN 'other'
  WHEN 'lease_ownership'          THEN 'aircraft_registration'
  WHEN 'insurance'                THEN 'aircraft_insurance'
  WHEN 'compliance'               THEN 'other'
  ELSE 'other'
END
WHERE document_type = 'other';  -- only touch rows still on the default

-- Backfill uploaded_by_persona: existing rows can't reliably be attributed to a
-- persona, so they default to 'owner' (most likely). Future inserts MUST set
-- this explicitly via the upload route.
UPDATE documents
SET uploaded_by_persona = 'owner'
WHERE uploaded_by_persona = 'owner';  -- no-op idempotent

-- ─── 4. CHECK constraints ────────────────────────────────────────────────────

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_document_type_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_document_type_check CHECK (document_type IN (
    -- Aircraft-specific (require aircraft_id)
    'aircraft_logbook',
    'aircraft_registration',
    'aircraft_airworthiness',
    'aircraft_insurance',
    'aircraft_poh',
    'aircraft_afm',
    'aircraft_weight_balance',
    'aircraft_prebuy',
    'aircraft_annual',
    'aircraft_100hr',
    -- Reference manuals (no aircraft_id)
    'maintenance_manual',
    'parts_catalog',
    'service_bulletin',
    'airworthiness_directive',
    'wiring_diagram',
    'service_letter',
    'tcds',
    'training_manual',
    -- Operations
    'photo',
    'receipt',
    'invoice',
    'work_order_attachment',
    -- Other
    'other'
  ));

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_uploaded_by_persona_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_uploaded_by_persona_check CHECK (uploaded_by_persona IN (
    'owner', 'mechanic', 'shop', 'admin'
  ));

-- ─── 5. Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_documents_org_type
  ON documents (organization_id, document_type);

CREATE INDEX IF NOT EXISTS idx_documents_org_aircraft
  ON documents (organization_id, aircraft_id)
  WHERE aircraft_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_uploaded_persona
  ON documents (uploaded_by_persona)
  WHERE uploaded_by_persona <> 'owner';

-- ─── 6. RLS — replace the documents_insert policy with a persona-strict one ──
--
-- The original policy (mig 011) only checked org membership role
-- (owner/admin/mechanic). The replacement does TWO things:
--   1. The original org-role check (defense in depth)
--   2. A persona-vs-document_type guard:
--      * persona='admin'    → ANY document_type
--      * persona='shop'     → ANY EXCEPT aircraft_logbook + aircraft_registration
--      * persona='mechanic' → reference manuals + photo + other ONLY
--      * persona='owner'    → aircraft_* + photo + other ONLY
--
-- aircraft_id presence/absence is enforced by the application layer (Sprint
-- 13.2) not by RLS — the policy stays focused on persona×type. The application
-- checks "if document_type starts with aircraft_, aircraft_id is required and
-- must belong to this org's aircraft."
--
-- Service-role inserts (used by Phase 12 auto-dispatch and the ingestion
-- pipeline) bypass RLS entirely, so this policy never blocks a server-side
-- system insert.

DROP POLICY IF EXISTS "documents_insert" ON documents;

CREATE POLICY "documents_insert" ON documents FOR INSERT
  WITH CHECK (
    -- 1. Org-role guard (preserved from mig 011)
    has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic'])
    -- 2. Persona × document_type guard
    AND (
      CASE user_persona_in_org(organization_id)
        WHEN 'admin' THEN TRUE
        WHEN 'shop' THEN document_type NOT IN ('aircraft_logbook', 'aircraft_registration')
        WHEN 'mechanic' THEN document_type IN (
          'maintenance_manual', 'parts_catalog', 'service_bulletin',
          'airworthiness_directive', 'wiring_diagram', 'service_letter',
          'tcds', 'training_manual',
          'photo', 'receipt', 'invoice', 'work_order_attachment',
          'other'
        )
        WHEN 'owner' THEN document_type IN (
          'aircraft_logbook', 'aircraft_registration', 'aircraft_airworthiness',
          'aircraft_insurance', 'aircraft_poh', 'aircraft_afm',
          'aircraft_weight_balance', 'aircraft_prebuy', 'aircraft_annual',
          'aircraft_100hr',
          'photo', 'receipt', 'other'
        )
        ELSE FALSE
      END
    )
  );

COMMENT ON POLICY "documents_insert" ON documents IS
  'Phase 13.1 — replaces the org-role-only policy with a persona-strict matrix. Mechanics cannot upload aircraft_*. Owners cannot upload reference manuals. Shop cannot upload aircraft_logbook/registration. Admin can upload anything. Service-role bypasses entirely.';

-- ─── 7. Done ─────────────────────────────────────────────────────────────────

COMMIT;
