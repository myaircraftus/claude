-- ocr_page_jobs: per-page OCR processing tracking
CREATE TABLE ocr_page_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id UUID REFERENCES aircraft(id),
  page_number INT NOT NULL,
  page_image_path TEXT, -- path in storage
  processed_image_path TEXT,
  page_classification TEXT, -- 'engine_log','airframe_log','prop_log','maintenance_entry','work_order','ad_compliance','cover','blank','unknown'
  classification_confidence NUMERIC(5,4),
  ocr_raw_text TEXT,
  ocr_confidence NUMERIC(5,4),
  extraction_status TEXT NOT NULL DEFAULT 'pending', -- 'pending','processing','extracted','needs_review','approved','rejected'
  needs_human_review BOOLEAN NOT NULL DEFAULT FALSE,
  review_reason TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_id, page_number)
);
CREATE INDEX idx_ocr_pages_document ON ocr_page_jobs(document_id);
CREATE INDEX idx_ocr_pages_status ON ocr_page_jobs(extraction_status);
CREATE INDEX idx_ocr_pages_review ON ocr_page_jobs(needs_human_review);

-- ocr_extracted_events: structured maintenance events from OCR
CREATE TABLE ocr_extracted_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ocr_page_job_id UUID NOT NULL REFERENCES ocr_page_jobs(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id UUID REFERENCES aircraft(id),
  page_number INT NOT NULL,
  event_type TEXT, -- 'maintenance','inspection','oil_change','overhaul','repair','ad_compliance','annual','100hr'
  logbook_type TEXT, -- 'airframe','engine','prop','avionics'
  event_date DATE,
  tach_time NUMERIC(10,1),
  airframe_tt NUMERIC(10,1),
  tsmoh NUMERIC(10,1),
  work_description TEXT,
  work_description_normalized TEXT,
  ata_chapter TEXT,
  part_numbers JSONB,
  serial_numbers JSONB,
  ad_references JSONB,
  far_references JSONB,
  manual_references JSONB,
  mechanic_name TEXT,
  mechanic_cert_number TEXT,
  ia_number TEXT,
  repair_station_cert TEXT,
  return_to_service BOOLEAN,
  rts_by TEXT,
  confidence_overall NUMERIC(5,4),
  confidence_date NUMERIC(5,4),
  confidence_tach NUMERIC(5,4),
  confidence_mechanic NUMERIC(5,4),
  raw_text TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending', -- 'pending','approved','rejected','needs_review'
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT,
  linked_maintenance_event_id UUID REFERENCES maintenance_events(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ocr_events_document ON ocr_extracted_events(document_id);
CREATE INDEX idx_ocr_events_aircraft ON ocr_extracted_events(aircraft_id);
CREATE INDEX idx_ocr_events_review ON ocr_extracted_events(review_status);
CREATE INDEX idx_ocr_events_type ON ocr_extracted_events(event_type);

-- review_queue: items needing human review
CREATE TABLE review_queue_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id UUID REFERENCES aircraft(id),
  ocr_page_job_id UUID REFERENCES ocr_page_jobs(id),
  ocr_extracted_event_id UUID REFERENCES ocr_extracted_events(id),
  queue_type TEXT NOT NULL, -- 'ocr_page','extracted_event','ad_compliance'
  priority TEXT NOT NULL DEFAULT 'normal',
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending','in_review','resolved','skipped'
  assigned_to UUID REFERENCES auth.users(id),
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_review_queue_org ON review_queue_items(organization_id);
CREATE INDEX idx_review_queue_status ON review_queue_items(status);

-- RLS
ALTER TABLE ocr_page_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_extracted_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_queue_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE aircraft_ad_applicability ENABLE ROW LEVEL SECURITY;
ALTER TABLE faa_airworthiness_directives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_ocr_pages" ON ocr_page_jobs FOR ALL USING (
  organization_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = auth.uid() AND accepted_at IS NOT NULL)
);
CREATE POLICY "org_ocr_events" ON ocr_extracted_events FOR ALL USING (
  organization_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = auth.uid() AND accepted_at IS NOT NULL)
);
CREATE POLICY "org_review_queue" ON review_queue_items FOR ALL USING (
  organization_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = auth.uid() AND accepted_at IS NOT NULL)
);
CREATE POLICY "aircraft_ad_applicability_policy" ON aircraft_ad_applicability FOR ALL USING (
  organization_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = auth.uid() AND accepted_at IS NOT NULL)
);
CREATE POLICY "faa_ads_read" ON faa_airworthiness_directives FOR SELECT USING (true);
