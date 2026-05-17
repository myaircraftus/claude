-- Add STC and Form 337 as first-class document types.
--
--   stc       — Supplemental Type Certificate (FAA approval for a modification)
--   form_337  — Major Repair & Alteration form (already in the legacy doc_type
--               enum; added here only to the new document_type taxonomy)
--
-- Two type systems touched:
--   1. doc_type (legacy enum, mig 004) — already has 'form_337'; add 'stc'.
--   2. document_type (text + CHECK, mig 103) — add both 'stc' and 'form_337'
--      to the CHECK constraint and to the documents_insert RLS persona matrix.
--
-- Persona rule (unchanged from mig 103 + persona-scope.ts): STC and 337 are
-- aircraft permanent records — uploaded by the OWNER persona (admin too).
-- Shop is excluded, consistent with form_337 already being OWNER_ONLY.

-- ── 1. Legacy doc_type enum — add 'stc' (form_337 already present) ───────────
ALTER TYPE doc_type ADD VALUE IF NOT EXISTS 'stc';

-- ── 2. document_type CHECK constraint — add 'stc' + 'form_337' ───────────────
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_document_type_check;

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
    -- Modifications & alterations
    'stc',
    'form_337',
    -- Operations
    'photo',
    'receipt',
    'invoice',
    'work_order_attachment',
    -- Other
    'other'
  ));

-- ── 3. documents_insert RLS — extend the persona × document_type matrix ──────
-- Owner gains 'stc' + 'form_337'. Shop is explicitly excluded (added to its
-- NOT IN list) so the RLS matches the app-layer canPersonaUpload rule.
DROP POLICY IF EXISTS "documents_insert" ON documents;

CREATE POLICY "documents_insert" ON documents FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic'])
    AND (
      CASE user_persona_in_org(organization_id)
        WHEN 'admin' THEN TRUE
        WHEN 'shop' THEN document_type NOT IN (
          'aircraft_logbook', 'aircraft_registration', 'stc', 'form_337'
        )
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
          'stc', 'form_337',
          'photo', 'receipt', 'other'
        )
        ELSE FALSE
      END
    )
  );

COMMENT ON POLICY "documents_insert" ON documents IS
  'Phase 13.1 + STC/337 — persona-strict upload matrix. STC and Form 337 are owner-persona aircraft records. Mechanics cannot upload aircraft_*. Shop cannot upload aircraft_logbook/registration/stc/form_337. Admin can upload anything. Service-role bypasses entirely.';
