-- When an ocr_extracted_events row transitions to review_status='approved', auto-create
-- a maintenance_entry_drafts row so the reviewer can finalize it into a logbook_entry
-- via /api/logbook-entries/from-draft.
--
-- The Next.js canonicalize endpoint (apps/web/app/api/ocr/canonicalize/route.ts) already
-- does this inline for the happy path. This trigger is belt-and-suspenders: it catches
-- approvals coming from any source (SQL console, future endpoints, backfill scripts).
--
-- Idempotent: skips insert if a draft already references this source event.

CREATE OR REPLACE FUNCTION promote_approved_event_to_draft()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draft_entry_type text;
  v_draft_logbook_type text;
  v_reviewer uuid;
BEGIN
  IF NEW.review_status IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;
  IF OLD.review_status = 'approved' THEN
    RETURN NEW;
  END IF;
  IF NEW.aircraft_id IS NULL OR NEW.event_date IS NULL OR NEW.work_description IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM maintenance_entry_drafts
    WHERE organization_id = NEW.organization_id
      AND structured_fields @> jsonb_build_object('source_event_id', NEW.id::text)
  ) THEN
    RETURN NEW;
  END IF;

  v_draft_entry_type := CASE
    WHEN LOWER(COALESCE(NEW.event_type,'')) LIKE '%annual%' THEN 'annual'
    WHEN LOWER(COALESCE(NEW.event_type,'')) LIKE '100%hour%' THEN '100hr'
    WHEN LOWER(COALESCE(NEW.event_type,'')) LIKE '100hr%' THEN '100hr'
    WHEN LOWER(COALESCE(NEW.event_type,'')) LIKE '%ad%compliance%' THEN 'ad_compliance'
    WHEN LOWER(COALESCE(NEW.event_type,'')) LIKE '%oil%' THEN 'oil_change'
    WHEN LOWER(COALESCE(NEW.event_type,'')) LIKE '%repair%' THEN 'repair'
    WHEN LOWER(COALESCE(NEW.event_type,'')) LIKE '%overhaul%' THEN 'overhaul'
    ELSE 'maintenance'
  END;

  v_draft_logbook_type := CASE LOWER(COALESCE(NEW.logbook_type,''))
    WHEN 'airframe_log' THEN 'airframe'
    WHEN 'airframe' THEN 'airframe'
    WHEN 'engine_log' THEN 'engine'
    WHEN 'engine' THEN 'engine'
    WHEN 'prop_log' THEN 'prop'
    WHEN 'prop' THEN 'prop'
    WHEN 'avionics' THEN 'avionics'
    ELSE NULL
  END;

  v_reviewer := COALESCE(NEW.reviewed_by, OLD.reviewed_by);
  IF v_reviewer IS NULL THEN
    SELECT user_id INTO v_reviewer
    FROM organization_memberships
    WHERE organization_id = NEW.organization_id
      AND role = 'owner'
      AND accepted_at IS NOT NULL
    ORDER BY accepted_at ASC
    LIMIT 1;
  END IF;
  IF v_reviewer IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO maintenance_entry_drafts (
    organization_id, aircraft_id, created_by, entry_type, logbook_type,
    ai_generated_text, status, structured_fields
  )
  VALUES (
    NEW.organization_id,
    NEW.aircraft_id,
    v_reviewer,
    v_draft_entry_type,
    v_draft_logbook_type,
    NEW.work_description,
    'pending',
    jsonb_build_object(
      'source_event_id', NEW.id::text,
      'source_page_id', NEW.ocr_page_job_id,
      'source_segment_id', NEW.ocr_entry_segment_id,
      'entry_type', NEW.event_type,
      'logbook_type', NEW.logbook_type,
      'date', NEW.event_date,
      'tach_time', NEW.tach_time,
      'airframe_tt', NEW.airframe_tt,
      'tsmoh', NEW.tsmoh,
      'ata_chapter', NEW.ata_chapter,
      'part_numbers', COALESCE(NEW.part_numbers, '[]'::jsonb),
      'parts_used', COALESCE(NEW.part_numbers, '[]'::jsonb),
      'ad_references', COALESCE(NEW.ad_references, '[]'::jsonb),
      'far_references', COALESCE(NEW.far_references, '[]'::jsonb),
      'manual_references', COALESCE(NEW.manual_references, '[]'::jsonb),
      'mechanic_name', NEW.mechanic_name,
      'mechanic_cert_number', NEW.mechanic_cert_number,
      'cert_number', NEW.mechanic_cert_number,
      'ia_number', NEW.ia_number,
      'created_via', 'trigger_promote_approved_event_to_draft'
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_promote_approved_event_to_draft ON ocr_extracted_events;

CREATE TRIGGER trg_promote_approved_event_to_draft
AFTER UPDATE OF review_status ON ocr_extracted_events
FOR EACH ROW
WHEN (NEW.review_status = 'approved' AND (OLD.review_status IS DISTINCT FROM 'approved'))
EXECUTE FUNCTION promote_approved_event_to_draft();
