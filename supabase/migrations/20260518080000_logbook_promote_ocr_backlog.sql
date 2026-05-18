-- Phase 2 — promote the OCR-extracted maintenance-event backlog into
-- logbook_entries as historical records, with full lineage.
--
-- 389 of the 391 existing historical entries were created by old bulk scripts
-- with no lineage (source_id IS NULL); they are verified derivatives of
-- approved ocr_extracted_events (matched on aircraft + date + description).
-- We delete those 389 and re-promote the FULL approved-event backlog fresh,
-- each entry carrying source_id + document/page lineage. The 2 historical
-- entries that are NOT derived from an approved event are kept untouched.
-- ocr_extracted_events (the source) is never modified.

-- 1. Remove the lineage-less orphan entries that are derivatives of an
--    approved event — they are re-created fresh, with lineage, in step 2.
DELETE FROM logbook_entries le
WHERE le.status = 'historical'
  AND le.source_id IS NULL
  AND EXISTS (
    SELECT 1 FROM ocr_extracted_events e
    WHERE e.review_status = 'approved'
      AND e.aircraft_id = le.aircraft_id
      AND e.event_date = le.entry_date
  );

-- 2. Promote every approved OCR event into a historical logbook entry.
INSERT INTO logbook_entries (
  organization_id, aircraft_id, entry_type, entry_date,
  tach_time, total_time, description,
  ad_numbers, parts_used, references_used,
  logbook_type, mechanic_name, mechanic_cert_number, ata_code,
  status, owner_visible, source_type, source_id, source_context,
  published_to_owner_at, created_by
)
SELECT
  e.organization_id,
  e.aircraft_id,
  CASE
    WHEN lower(coalesce(e.event_type,'')) LIKE '%annual%'            THEN 'annual'
    WHEN lower(coalesce(e.event_type,'')) LIKE '100%hour%'           THEN '100hr'
    WHEN lower(coalesce(e.event_type,'')) LIKE '100hr%'              THEN '100hr'
    WHEN lower(coalesce(e.event_type,'')) LIKE '%ad%compliance%'     THEN 'ad_compliance'
    WHEN lower(coalesce(e.event_type,'')) LIKE '%sb%compliance%'     THEN 'sb_compliance'
    WHEN lower(coalesce(e.event_type,'')) LIKE '%oil%'               THEN 'oil_change'
    WHEN lower(coalesce(e.event_type,'')) LIKE '%major%repair%'      THEN 'major_repair'
    WHEN lower(coalesce(e.event_type,'')) LIKE '%major%alter%'       THEN 'major_alteration'
    WHEN lower(coalesce(e.event_type,'')) LIKE '%alteration%'        THEN 'major_alteration'
    WHEN lower(coalesce(e.event_type,'')) LIKE '%repair%'            THEN 'major_repair'
    WHEN lower(coalesce(e.event_type,'')) LIKE '%component%'         THEN 'component_replacement'
    WHEN lower(coalesce(e.event_type,'')) LIKE '%return%service%'    THEN 'return_to_service'
    WHEN lower(coalesce(e.event_type,'')) LIKE '%discrepancy%'       THEN 'discrepancy'
    ELSE 'maintenance'
  END,
  e.event_date,
  e.tach_time,
  e.airframe_tt,
  e.work_description,
  CASE WHEN jsonb_typeof(e.ad_references) = 'array'
       THEN ARRAY(SELECT jsonb_array_elements_text(e.ad_references))
       ELSE NULL END,
  CASE WHEN jsonb_typeof(e.part_numbers) = 'array' THEN e.part_numbers ELSE '[]'::jsonb END,
  CASE WHEN jsonb_typeof(e.manual_references) = 'array' THEN e.manual_references ELSE '[]'::jsonb END,
  CASE lower(coalesce(e.logbook_type,''))
    WHEN 'airframe_log'  THEN 'airframe'
    WHEN 'airframe'      THEN 'airframe'
    WHEN 'engine_log'    THEN 'engine'
    WHEN 'engine'        THEN 'engine'
    WHEN 'prop_log'      THEN 'prop'
    WHEN 'prop'          THEN 'prop'
    WHEN 'propeller'     THEN 'propeller'
    WHEN 'propeller_log' THEN 'propeller'
    WHEN 'avionics'      THEN 'avionics'
    WHEN 'avionics_log'  THEN 'avionics'
    ELSE NULL
  END,
  e.mechanic_name,
  e.mechanic_cert_number,
  e.ata_chapter,
  'historical',
  true,
  'historical_ocr',
  e.id,
  jsonb_build_object(
    'source', 'ocr_extracted_event',
    'document_id', e.document_id,
    'page_number', e.page_number,
    'ocr_page_job_id', e.ocr_page_job_id,
    'ocr_entry_segment_id', e.ocr_entry_segment_id
  ),
  coalesce(e.reviewed_at, now()),
  coalesce(
    e.reviewed_by,
    (SELECT m.user_id FROM organization_memberships m
     WHERE m.organization_id = e.organization_id
       AND m.role = 'owner' AND m.accepted_at IS NOT NULL
     ORDER BY m.accepted_at ASC LIMIT 1)
  )
FROM ocr_extracted_events e
WHERE e.review_status = 'approved'
  AND e.aircraft_id IS NOT NULL
  AND e.event_date IS NOT NULL
  AND e.work_description IS NOT NULL
  AND length(trim(e.work_description)) > 0
  -- created_by is NOT NULL — only promote events whose creator resolves.
  AND (
    e.reviewed_by IS NOT NULL
    OR EXISTS (SELECT 1 FROM organization_memberships m
               WHERE m.organization_id = e.organization_id
                 AND m.role = 'owner' AND m.accepted_at IS NOT NULL)
  )
  -- Idempotent: skip events already promoted.
  AND NOT EXISTS (
    SELECT 1 FROM logbook_entries le
    WHERE le.source_type = 'historical_ocr' AND le.source_id = e.id
  );
