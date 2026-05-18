-- Wave 3B — bridge the maintenance history into the intelligence layer.
--
-- 12 intelligence readers (computeAircraftStatus, detectMissingRecords, the
-- report generators, the AI predictors) read `maintenance_events` — but that
-- table is empty (its parser-metadata writer almost never produces events).
-- Meanwhile the real maintenance history lives in ocr_extracted_events (the
-- OCR pipeline, 5,848 rows / 2,754 approved) and was bridged into
-- logbook_entries by the logbook Phase 2 work.
--
-- maintenance_events was DESIGNED to be fed from ocr_extracted_events — the
-- columns map nearly 1:1. This backfill wires that: every approved OCR event
-- becomes a canonical maintenance_events row. Zero intelligence-reader code
-- changes — the whole intelligence/reports layer simply lights up with data.
--
-- A new source_event_id column gives lineage + an idempotent dedup key.

ALTER TABLE maintenance_events
  ADD COLUMN IF NOT EXISTS source_event_id uuid;

COMMENT ON COLUMN maintenance_events.source_event_id IS
  'Wave 3B — the ocr_extracted_events row this maintenance event was promoted from. NULL for rows written by the legacy parser-metadata ingestion path.';

CREATE INDEX IF NOT EXISTS idx_maintenance_events_source_event
  ON maintenance_events(source_event_id);

INSERT INTO maintenance_events (
  organization_id, aircraft_id, document_id, source_page,
  event_date, event_type, description, mechanic_name, mechanic_cert,
  airframe_tt, tach_time, tsmoh, ad_reference, ata_chapter,
  part_numbers, far_references, raw_text, repair_station_cert,
  ia_cert_number, return_to_service, source_segment_id,
  source_segment_group_key, confidence, record_confidence,
  is_verified, canonicalization_status, truth_state, source_event_id
)
SELECT
  e.organization_id, e.aircraft_id, e.document_id, e.page_number,
  e.event_date, e.event_type, e.work_description, e.mechanic_name, e.mechanic_cert_number,
  e.airframe_tt, e.tach_time, e.tsmoh,
  CASE WHEN jsonb_typeof(e.ad_references) = 'array' AND jsonb_array_length(e.ad_references) > 0
       THEN e.ad_references ->> 0 ELSE NULL END,
  e.ata_chapter,
  CASE WHEN jsonb_typeof(e.part_numbers) = 'array' THEN e.part_numbers ELSE '[]'::jsonb END,
  CASE WHEN jsonb_typeof(e.far_references) = 'array' THEN e.far_references ELSE '[]'::jsonb END,
  e.raw_text, e.repair_station_cert, e.ia_number, e.return_to_service,
  e.ocr_entry_segment_id, e.segment_group_key,
  e.confidence_overall, e.confidence_overall,
  true, 'canonical', 'canonical', e.id
FROM ocr_extracted_events e
WHERE e.review_status = 'approved'
  AND e.aircraft_id IS NOT NULL
  AND e.event_date IS NOT NULL
  AND e.work_description IS NOT NULL
  AND length(trim(e.work_description)) > 0
  AND NOT EXISTS (
    SELECT 1 FROM maintenance_events m WHERE m.source_event_id = e.id
  );
