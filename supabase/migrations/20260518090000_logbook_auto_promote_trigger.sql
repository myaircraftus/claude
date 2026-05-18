-- Phase 2 — automate the historical pipeline.
--
-- Replaces the old trg_promote_approved_event_to_draft trigger (mig 051a),
-- which created a maintenance_entry_drafts row that nothing finalized. When an
-- OCR-extracted event becomes `approved` it is now promoted DIRECTLY into a
-- `historical` logbook_entry — owner-visible, with full document/page lineage.
-- Historical records do not need the mechanic draft -> sign workflow; that
-- workflow is only for NEW entries a mechanic authors.
--
-- Idempotent (skips if the event already has an entry) and defensive (skips
-- events missing aircraft / date / description, or with no resolvable creator).

CREATE OR REPLACE FUNCTION promote_approved_event_to_logbook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator uuid;
BEGIN
  IF NEW.review_status IS DISTINCT FROM 'approved' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.review_status = 'approved' THEN RETURN NEW; END IF;
  IF NEW.aircraft_id IS NULL OR NEW.event_date IS NULL
     OR NEW.work_description IS NULL OR length(trim(NEW.work_description)) = 0 THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM logbook_entries le
             WHERE le.source_type = 'historical_ocr' AND le.source_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_creator := coalesce(
    NEW.reviewed_by,
    (SELECT m.user_id FROM organization_memberships m
     WHERE m.organization_id = NEW.organization_id
       AND m.role = 'owner' AND m.accepted_at IS NOT NULL
     ORDER BY m.accepted_at ASC LIMIT 1)
  );
  IF v_creator IS NULL THEN RETURN NEW; END IF;  -- created_by is NOT NULL

  INSERT INTO logbook_entries (
    organization_id, aircraft_id, entry_type, entry_date,
    tach_time, total_time, description, ad_numbers, parts_used,
    references_used, logbook_type, mechanic_name, mechanic_cert_number,
    ata_code, status, owner_visible, source_type, source_id,
    source_context, published_to_owner_at, created_by
  ) VALUES (
    NEW.organization_id,
    NEW.aircraft_id,
    CASE
      WHEN lower(coalesce(NEW.event_type,'')) LIKE '%annual%'         THEN 'annual'
      WHEN lower(coalesce(NEW.event_type,'')) LIKE '100%hour%'        THEN '100hr'
      WHEN lower(coalesce(NEW.event_type,'')) LIKE '100hr%'           THEN '100hr'
      WHEN lower(coalesce(NEW.event_type,'')) LIKE '%ad%compliance%'  THEN 'ad_compliance'
      WHEN lower(coalesce(NEW.event_type,'')) LIKE '%sb%compliance%'  THEN 'sb_compliance'
      WHEN lower(coalesce(NEW.event_type,'')) LIKE '%oil%'            THEN 'oil_change'
      WHEN lower(coalesce(NEW.event_type,'')) LIKE '%major%repair%'   THEN 'major_repair'
      WHEN lower(coalesce(NEW.event_type,'')) LIKE '%major%alter%'    THEN 'major_alteration'
      WHEN lower(coalesce(NEW.event_type,'')) LIKE '%alteration%'     THEN 'major_alteration'
      WHEN lower(coalesce(NEW.event_type,'')) LIKE '%repair%'         THEN 'major_repair'
      WHEN lower(coalesce(NEW.event_type,'')) LIKE '%component%'      THEN 'component_replacement'
      WHEN lower(coalesce(NEW.event_type,'')) LIKE '%return%service%' THEN 'return_to_service'
      WHEN lower(coalesce(NEW.event_type,'')) LIKE '%discrepancy%'    THEN 'discrepancy'
      ELSE 'maintenance'
    END,
    NEW.event_date,
    NEW.tach_time,
    NEW.airframe_tt,
    NEW.work_description,
    CASE WHEN jsonb_typeof(NEW.ad_references) = 'array'
         THEN ARRAY(SELECT jsonb_array_elements_text(NEW.ad_references))
         ELSE NULL END,
    CASE WHEN jsonb_typeof(NEW.part_numbers) = 'array' THEN NEW.part_numbers ELSE '[]'::jsonb END,
    CASE WHEN jsonb_typeof(NEW.manual_references) = 'array' THEN NEW.manual_references ELSE '[]'::jsonb END,
    CASE lower(coalesce(NEW.logbook_type,''))
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
    NEW.mechanic_name,
    NEW.mechanic_cert_number,
    NEW.ata_chapter,
    'historical',
    true,
    'historical_ocr',
    NEW.id,
    jsonb_build_object(
      'source', 'ocr_extracted_event',
      'document_id', NEW.document_id,
      'page_number', NEW.page_number,
      'ocr_page_job_id', NEW.ocr_page_job_id,
      'ocr_entry_segment_id', NEW.ocr_entry_segment_id
    ),
    coalesce(NEW.reviewed_at, now()),
    v_creator
  );

  RETURN NEW;
END;
$$;

-- Replace the old draft-creating trigger with the entry-creating one.
DROP TRIGGER IF EXISTS trg_promote_approved_event_to_draft ON ocr_extracted_events;
DROP TRIGGER IF EXISTS trg_promote_approved_event_to_logbook ON ocr_extracted_events;

CREATE TRIGGER trg_promote_approved_event_to_logbook
AFTER INSERT OR UPDATE OF review_status ON ocr_extracted_events
FOR EACH ROW
WHEN (NEW.review_status = 'approved')
EXECUTE FUNCTION promote_approved_event_to_logbook();

COMMENT ON FUNCTION promote_approved_event_to_logbook IS
  'Phase 2 — on OCR-event approval, auto-create a historical (owner-visible, lineaged) logbook_entry. Replaces promote_approved_event_to_draft.';
