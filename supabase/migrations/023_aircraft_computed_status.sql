-- Migration 023: Aircraft Computed Status
-- Materialized snapshot of current aircraft intelligence state

CREATE TABLE aircraft_computed_status (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aircraft_id                 UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  organization_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Computed at timestamp
  computed_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Airframe time
  airframe_total_time         NUMERIC(8,1),   -- TTAF decimal hours, from latest maintenance_event
  airframe_time_source_date   DATE,           -- date of the entry that provided this time

  -- Engine state
  engine_time_since_new       NUMERIC(8,1),
  engine_time_since_overhaul  NUMERIC(8,1),   -- SMOH
  engine_last_overhaul_date   DATE,
  engine_last_overhaul_shop   TEXT,
  engine_tbo_hours            NUMERIC(8,1),   -- from aircraft profile or known TBO for this engine model
  engine_hours_to_tbo         NUMERIC(8,1),   -- computed: engine_tbo_hours - engine_time_since_overhaul

  -- Propeller state
  prop_time_since_new         NUMERIC(8,1),
  prop_time_since_overhaul    NUMERIC(8,1),
  prop_last_overhaul_date     DATE,

  -- Inspection currency (all dates are last-completed dates)
  last_annual_date            DATE,
  last_annual_aircraft_time   NUMERIC(8,1),
  annual_next_due_date        DATE,           -- computed: last_annual_date + 12 months
  annual_is_current           BOOLEAN,        -- computed: annual_next_due_date >= today

  last_100hr_date             DATE,
  last_100hr_aircraft_time    NUMERIC(8,1),
  next_100hr_due_time         NUMERIC(8,1),   -- computed: last_100hr_aircraft_time + 100

  last_elt_inspection_date    DATE,
  elt_next_due_date           DATE,           -- +24 months
  elt_is_current              BOOLEAN,

  last_transponder_test_date  DATE,
  transponder_next_due_date   DATE,           -- +24 months
  transponder_is_current      BOOLEAN,

  last_pitot_static_date      DATE,
  pitot_static_next_due_date  DATE,           -- +24 months
  pitot_static_is_current     BOOLEAN,

  last_altimeter_date         DATE,
  altimeter_next_due_date     DATE,
  altimeter_is_current        BOOLEAN,

  last_vor_check_date         DATE,
  vor_check_next_due_date     DATE,           -- +30 days
  vor_check_is_current        BOOLEAN,

  -- AD compliance summary
  total_applicable_ads        INTEGER DEFAULT 0,
  ads_complied                INTEGER DEFAULT 0,
  ads_open                    INTEGER DEFAULT 0,
  ads_unknown                 INTEGER DEFAULT 0,
  next_ad_due_date            DATE,           -- earliest upcoming recurring AD due date
  next_ad_number              TEXT,           -- which AD is due next

  -- Required document presence
  has_registration            BOOLEAN DEFAULT false,
  registration_expiry_date    DATE,
  has_airworthiness_cert      BOOLEAN DEFAULT false,
  has_weight_balance          BOOLEAN DEFAULT false,
  has_equipment_list          BOOLEAN DEFAULT false,

  -- Overall health score (0–100, computed)
  health_score                INTEGER,
  health_score_breakdown      JSONB,          -- component scores for display

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_computed_status_aircraft ON aircraft_computed_status(aircraft_id);
CREATE INDEX idx_computed_status_org ON aircraft_computed_status(organization_id);

-- RLS
ALTER TABLE aircraft_computed_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_read_computed_status" ON aircraft_computed_status
  FOR SELECT USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "service_role_all_computed_status" ON aircraft_computed_status
  FOR ALL USING (auth.role() = 'service_role');
