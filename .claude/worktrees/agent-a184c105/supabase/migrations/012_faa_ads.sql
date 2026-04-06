-- faa_airworthiness_directives: canonical AD records fetched from FAA
CREATE TABLE faa_airworthiness_directives (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_number TEXT NOT NULL UNIQUE, -- e.g. "2024-05-05"
  title TEXT,
  aircraft_make TEXT,
  aircraft_model TEXT,
  aircraft_series TEXT,
  engine_make TEXT,
  engine_model TEXT,
  prop_make TEXT,
  prop_model TEXT,
  effective_date DATE,
  compliance_date DATE,
  compliance_description TEXT,
  recurring BOOLEAN NOT NULL DEFAULT FALSE,
  recurring_interval_hours NUMERIC(10,1),
  recurring_interval_days INT,
  superseded_by TEXT,
  source_url TEXT,
  raw_text TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_faa_ads_make_model ON faa_airworthiness_directives(aircraft_make, aircraft_model);
CREATE INDEX idx_faa_ads_engine ON faa_airworthiness_directives(engine_make, engine_model);
CREATE INDEX idx_faa_ads_number ON faa_airworthiness_directives(ad_number);

-- aircraft_ad_applicability: which ADs apply to which aircraft
CREATE TABLE aircraft_ad_applicability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  aircraft_id UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ad_id UUID NOT NULL REFERENCES faa_airworthiness_directives(id) ON DELETE CASCADE,
  ad_number TEXT NOT NULL,
  applicability_status TEXT NOT NULL DEFAULT 'likely_applicable', -- 'applicable','not_applicable','likely_applicable','needs_review'
  compliance_status TEXT NOT NULL DEFAULT 'unknown', -- 'compliant','non_compliant','unknown','overdue'
  compliance_method TEXT, -- 'one_time','recurring'
  last_compliance_date DATE,
  last_compliance_tach NUMERIC(10,1),
  last_compliance_tt NUMERIC(10,1),
  next_due_date DATE,
  next_due_tach NUMERIC(10,1),
  evidence_document_id UUID REFERENCES documents(id),
  evidence_page INT,
  evidence_notes TEXT,
  manually_overridden BOOLEAN NOT NULL DEFAULT FALSE,
  override_notes TEXT,
  override_by UUID REFERENCES auth.users(id),
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(aircraft_id, ad_id)
);
CREATE INDEX idx_aircraft_ad_aircraft ON aircraft_ad_applicability(aircraft_id);
CREATE INDEX idx_aircraft_ad_status ON aircraft_ad_applicability(compliance_status);
