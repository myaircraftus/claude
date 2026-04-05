-- Migration 025: Report Generation System

CREATE TYPE report_type AS ENUM (
  'aircraft_overview',
  'engine_prop_summary',
  'inspection_status',
  'maintenance_timeline',
  'missing_records',
  'prebuy_packet',
  'lender_packet',
  'insurer_packet'
);

CREATE TYPE report_status AS ENUM (
  'queued',
  'generating',
  'completed',
  'failed'
);

CREATE TABLE report_jobs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aircraft_id         UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by        UUID REFERENCES user_profiles(id),

  report_type         report_type NOT NULL,
  status              report_status NOT NULL DEFAULT 'queued',

  -- Options passed at generation time
  options             JSONB DEFAULT '{}',
  -- e.g. { "as_of_date": "2026-04-01", "include_timeline": true, "include_findings": true }

  -- For prebuy/lender/insurer packets -- billing
  stripe_payment_intent_id   TEXT,
  is_paid                    BOOLEAN DEFAULT false,

  -- For share links
  share_token                TEXT UNIQUE,   -- UUID used in public share URL
  share_token_expires_at     TIMESTAMPTZ,
  share_accessed_count       INTEGER DEFAULT 0,

  -- Output
  storage_path        TEXT,           -- Supabase Storage path of generated PDF
  signed_url          TEXT,           -- short-lived signed URL for download
  signed_url_expires  TIMESTAMPTZ,
  page_count          INTEGER,
  file_size_bytes     INTEGER,

  -- Tracking
  generation_started_at   TIMESTAMPTZ,
  generation_completed_at TIMESTAMPTZ,
  error_message           TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_report_jobs_aircraft ON report_jobs(aircraft_id);
CREATE INDEX idx_report_jobs_org ON report_jobs(organization_id);
CREATE INDEX idx_report_jobs_share ON report_jobs(share_token) WHERE share_token IS NOT NULL;

ALTER TABLE report_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_read_reports" ON report_jobs
  FOR SELECT USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "org_members_insert_reports" ON report_jobs
  FOR INSERT WITH CHECK (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "service_role_all_reports" ON report_jobs
  FOR ALL USING (auth.role() = 'service_role');
-- Public share access (no auth required -- share_token acts as bearer token)
CREATE POLICY "public_share_access" ON report_jobs
  FOR SELECT USING (
    share_token IS NOT NULL
    AND share_token_expires_at > now()
  );
