-- Document upload lockdown — shop persona cannot insert aircraft historical
-- records.
--
-- The documents_insert RLS policy (mig 103, updated by mig 119) previously let
-- the shop persona insert ANY document_type except a 4-item blocklist
-- (aircraft_logbook, aircraft_registration, stc, form_337). That still let a
-- shop write an owner's aircraft_airworthiness / aircraft_insurance /
-- aircraft_annual / aircraft_100hr / aircraft_poh / aircraft_afm /
-- aircraft_weight_balance / aircraft_prebuy records.
--
-- Aircraft historical records are owner-only. This migration replaces the shop
-- blocklist with an explicit ALLOWLIST of shop reference + operations types, so
-- the shop persona can ONLY insert documents that belong to the shop's own
-- reference library or its operational workflow. The allowlist below is mirrored
-- byte-for-byte by DOCUMENT_TYPE_META.shopCanUpload in
-- apps/web/lib/documents/persona-taxonomy.ts — keep the two in sync.
--
-- Owner and admin branches are unchanged. Reads are unaffected: documents_select
-- stays org-wide, so the shop persona can still READ every aircraft's documents
-- in its org (needed for Ask Logbook AI / RAG).

DROP POLICY IF EXISTS documents_insert ON documents;

CREATE POLICY documents_insert ON documents
  FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, ARRAY['owner'::text, 'admin'::text, 'mechanic'::text])
    AND CASE user_persona_in_org(organization_id)
      WHEN 'admin'::text THEN true
      -- Shop / mechanic: reference library + operations docs ONLY. No aircraft_*
      -- historical records, no STC, no Form 337.
      WHEN 'shop'::text THEN (
        document_type = ANY (ARRAY[
          'maintenance_manual'::text, 'parts_catalog'::text, 'service_bulletin'::text,
          'airworthiness_directive'::text, 'wiring_diagram'::text, 'service_letter'::text,
          'tcds'::text, 'training_manual'::text, 'photo'::text, 'receipt'::text,
          'invoice'::text, 'work_order_attachment'::text, 'other'::text
        ])
      )
      WHEN 'mechanic'::text THEN (
        document_type = ANY (ARRAY[
          'maintenance_manual'::text, 'parts_catalog'::text, 'service_bulletin'::text,
          'airworthiness_directive'::text, 'wiring_diagram'::text, 'service_letter'::text,
          'tcds'::text, 'training_manual'::text, 'photo'::text, 'receipt'::text,
          'invoice'::text, 'work_order_attachment'::text, 'other'::text
        ])
      )
      -- Owner: aircraft historical records (logbooks, registration, airworthiness,
      -- insurance, POH/AFM, W&B, prebuy, annual, 100hr), STC, Form 337, plus
      -- photos / receipts / other.
      WHEN 'owner'::text THEN (
        document_type = ANY (ARRAY[
          'aircraft_logbook'::text, 'aircraft_registration'::text,
          'aircraft_airworthiness'::text, 'aircraft_insurance'::text,
          'aircraft_poh'::text, 'aircraft_afm'::text, 'aircraft_weight_balance'::text,
          'aircraft_prebuy'::text, 'aircraft_annual'::text, 'aircraft_100hr'::text,
          'stc'::text, 'form_337'::text, 'photo'::text, 'receipt'::text, 'other'::text
        ])
      )
      ELSE false
    END
  );
