-- Migration 024: Record Findings
-- Output table for missing-record detection and discrepancy detection

CREATE TYPE finding_type AS ENUM (
  -- Missing record findings
  'missing_annual_gap',
  'missing_100hr_gap',
  'missing_elt_inspection',
  'missing_transponder_test',
  'missing_pitot_static_test',
  'missing_engine_log_continuity',
  'missing_prop_log_continuity',
  'missing_airframe_log_continuity',
  'missing_form_337',
  'missing_8130_for_component',
  'missing_back_to_birth',
  'missing_overhaul_documentation',
  'missing_ad_compliance_record',
  'missing_stc_documentation',
  'missing_registration',
  'missing_airworthiness_cert',
  'missing_weight_balance',
  'missing_equipment_list',
  'incomplete_return_to_service',
  'missing_mechanic_signature',
  'missing_mechanic_certificate',
  -- Discrepancy findings
  'time_regression',
  'time_gap_anomaly',
  'conflicting_overhaul_dates',
  'ad_compliance_conflict',
  'duplicate_entry_suspected',
  'unsigned_entry',
  'future_dated_entry',
  'implausible_time_jump'
);

CREATE TYPE finding_severity AS ENUM (
  'critical',   -- airworthiness risk, grounds aircraft if unresolved
  'warning',    -- significant gap, affects value/compliance
  'info'        -- minor gap, informational only
);

CREATE TABLE record_findings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aircraft_id           UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  findings_run_id       UUID NOT NULL,   -- groups all findings from one detection run

  finding_type          finding_type NOT NULL,
  severity              finding_severity NOT NULL,

  title                 TEXT NOT NULL,   -- short display title, e.g. "Missing Annual 2018–2020"
  description           TEXT NOT NULL,   -- full human-readable explanation
  recommendation        TEXT,            -- what to do about it

  affected_date_start   DATE,            -- beginning of the affected period
  affected_date_end     DATE,            -- end of the affected period
  affected_component    TEXT,            -- 'airframe' | 'engine' | 'prop' | 'avionics' | specific component

  source_event_ids      UUID[],          -- maintenance_events that surfaced this finding
  source_document_ids   UUID[],          -- documents relevant to this finding

  -- Resolution tracking
  is_resolved           BOOLEAN DEFAULT false,
  resolved_at           TIMESTAMPTZ,
  resolved_by           UUID REFERENCES user_profiles(id),
  resolution_note       TEXT,

  -- Whether this finding was acknowledged (but not resolved) by a reviewer
  is_acknowledged       BOOLEAN DEFAULT false,
  acknowledged_at       TIMESTAMPTZ,
  acknowledged_by       UUID REFERENCES user_profiles(id),
  acknowledge_note      TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Track each detection run
CREATE TABLE findings_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aircraft_id     UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  triggered_by    UUID REFERENCES user_profiles(id),
  trigger_source  TEXT NOT NULL DEFAULT 'manual',  -- manual | scheduled | post_ingest
  status          TEXT NOT NULL DEFAULT 'running', -- running | completed | failed
  findings_count  INTEGER DEFAULT 0,
  critical_count  INTEGER DEFAULT 0,
  warning_count   INTEGER DEFAULT 0,
  info_count      INTEGER DEFAULT 0,
  completed_at    TIMESTAMPTZ,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_findings_aircraft ON record_findings(aircraft_id);
CREATE INDEX idx_findings_run ON record_findings(findings_run_id);
CREATE INDEX idx_findings_severity ON record_findings(severity) WHERE is_resolved = false;
CREATE INDEX idx_findings_runs_aircraft ON findings_runs(aircraft_id);

ALTER TABLE record_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_read_findings" ON record_findings
  FOR SELECT USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "org_members_update_findings" ON record_findings
  FOR UPDATE USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "service_role_all_findings" ON record_findings
  FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE findings_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_read_runs" ON findings_runs
  FOR SELECT USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "service_role_all_runs" ON findings_runs
  FOR ALL USING (auth.role() = 'service_role');
