-- Wave 3B — the auto-promote trigger now feeds BOTH derived tables.
--
-- ocr_extracted_events is the single source of truth for maintenance history.
-- On approval it is projected into two consumers:
--   * logbook_entries   — owner-facing logbook + RAG search_logbook
--   * maintenance_events — the intelligence / reports / predictors layer
--
-- The trigger previously wrote only logbook_entries (logbook Phase 2). It now
-- writes both, each insert independently idempotent, so the intelligence layer
-- never falls behind.

CREATE OR REPLACE FUNCTION promote_approved_event_to_logbook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator uuid;
  v_entry_type text;
  v_logbook_type text;
BEGIN
  IF NEW.review_status IS DISTINCT FROM 'approved' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.review_status = 'approved' THEN RETURN NEW; END IF;
  IF NEW.aircraft_id IS NULL OR NEW.event_date IS NULL
     OR NEW.work_description IS NULL OR length(trim(NEW.work_description)) = 0 THEN
    RETURN NEW;
  END IF;

  v_entry_type := CASE
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
  END;
  v_logbook_type := CASE lower(coalesce(NEW.logbook_type,''))
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
  END;

  -- ── logbook_entries (owner-facing logbook) ──
  IF NOT EXISTS (SELECT 1 FROM logbook_entries le
                 WHERE le.source_type = 'historical_ocr' AND le.source_id = NEW.id) THEN
    v_creator := coalesce(
      NEW.reviewed_by,
      (SELECT m.user_id FROM organization_memberships m
       WHERE m.organization_id = NEW.organization_id
         AND m.role = 'owner' AND m.accepted_at IS NOT NULL
       ORDER BY m.accepted_at ASC LIMIT 1)
    );
    IF v_creator IS NOT NULL THEN
      INSERT INTO logbook_entries (
        organization_id, aircraft_id, entry_type, entry_date,
        tach_time, total_time, description, ad_numbers, parts_used,
        references_used, logbook_type, mechanic_name, mechanic_cert_number,
        ata_code, status, owner_visible, source_type, source_id,
        source_context, published_to_owner_at, created_by
      ) VALUES (
        NEW.organization_id, NEW.aircraft_id, v_entry_type, NEW.event_date,
        NEW.tach_time, NEW.airframe_tt, NEW.work_description,
        CASE WHEN jsonb_typeof(NEW.ad_references) = 'array'
             THEN ARRAY(SELECT jsonb_array_elements_text(NEW.ad_references))
             ELSE NULL END,
        CASE WHEN jsonb_typeof(NEW.part_numbers) = 'array' THEN NEW.part_numbers ELSE '[]'::jsonb END,
        CASE WHEN jsonb_typeof(NEW.manual_references) = 'array' THEN NEW.manual_references ELSE '[]'::jsonb END,
        v_logbook_type, NEW.mechanic_name, NEW.mechanic_cert_number, NEW.ata_chapter,
        'historical', true, 'historical_ocr', NEW.id,
        jsonb_build_object(
          'source', 'ocr_extracted_event',
          'document_id', NEW.document_id,
          'page_number', NEW.page_number,
          'ocr_page_job_id', NEW.ocr_page_job_id,
          'ocr_entry_segment_id', NEW.ocr_entry_segment_id
        ),
        coalesce(NEW.reviewed_at, now()), v_creator
      );
    END IF;
  END IF;

  -- ── maintenance_events (intelligence / reports / predictors layer) ──
  IF NOT EXISTS (SELECT 1 FROM maintenance_events m WHERE m.source_event_id = NEW.id) THEN
    INSERT INTO maintenance_events (
      organization_id, aircraft_id, document_id, source_page,
      event_date, event_type, description, mechanic_name, mechanic_cert,
      airframe_tt, tach_time, tsmoh, ad_reference, ata_chapter,
      part_numbers, far_references, raw_text, repair_station_cert,
      ia_cert_number, return_to_service, source_segment_id,
      source_segment_group_key, confidence, record_confidence,
      is_verified, canonicalization_status, truth_state, source_event_id
    ) VALUES (
      NEW.organization_id, NEW.aircraft_id, NEW.document_id, NEW.page_number,
      NEW.event_date, NEW.event_type, NEW.work_description, NEW.mechanic_name,
      NEW.mechanic_cert_number, NEW.airframe_tt, NEW.tach_time, NEW.tsmoh,
      CASE WHEN jsonb_typeof(NEW.ad_references) = 'array' AND jsonb_array_length(NEW.ad_references) > 0
           THEN NEW.ad_references ->> 0 ELSE NULL END,
      NEW.ata_chapter,
      CASE WHEN jsonb_typeof(NEW.part_numbers) = 'array' THEN NEW.part_numbers ELSE '[]'::jsonb END,
      CASE WHEN jsonb_typeof(NEW.far_references) = 'array' THEN NEW.far_references ELSE '[]'::jsonb END,
      NEW.raw_text, NEW.repair_station_cert, NEW.ia_number, NEW.return_to_service,
      NEW.ocr_entry_segment_id, NEW.segment_group_key,
      NEW.confidence_overall, NEW.confidence_overall,
      true, 'canonical', 'canonical', NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION promote_approved_event_to_logbook IS
  'Wave 3B — on OCR-event approval, projects the event into BOTH logbook_entries (owner-facing) and maintenance_events (intelligence layer). Each insert is independently idempotent.';
