-- Migration 003: Aircraft

CREATE TABLE aircraft (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tail_number     TEXT NOT NULL,
  serial_number   TEXT,
  make            TEXT NOT NULL,
  model           TEXT NOT NULL,
  year            INT,
  engine_make     TEXT,
  engine_model    TEXT,
  engine_serial   TEXT,
  prop_make       TEXT,
  prop_model      TEXT,
  prop_serial     TEXT,
  avionics_notes  TEXT,
  base_airport    TEXT,
  operator_name   TEXT,
  notes           TEXT,
  total_time_hours NUMERIC(10,1),
  is_archived     BOOLEAN NOT NULL DEFAULT FALSE,
  created_by      UUID REFERENCES user_profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, tail_number)
);

CREATE INDEX idx_aircraft_org ON aircraft(organization_id);
CREATE INDEX idx_aircraft_tail ON aircraft(tail_number);
