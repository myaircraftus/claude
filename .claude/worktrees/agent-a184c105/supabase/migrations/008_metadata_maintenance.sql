-- Migration 008: Extracted Metadata & Maintenance Events

CREATE TABLE document_metadata_extractions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id     UUID REFERENCES aircraft(id),
  extraction_type TEXT NOT NULL,
  extracted_data  JSONB NOT NULL,
  source_page     INT,
  source_chunk_id UUID REFERENCES document_chunks(id),
  confidence      NUMERIC(5,4),
  is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE maintenance_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id     UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  document_id     UUID REFERENCES documents(id),
  source_page     INT,
  event_date      DATE,
  event_type      TEXT,
  description     TEXT,
  mechanic_name   TEXT,
  mechanic_cert   TEXT,
  shop_name       TEXT,
  airframe_tt     NUMERIC(10,1),
  tach_time       NUMERIC(10,1),
  parts_replaced  JSONB,
  ad_reference    TEXT,
  sb_reference    TEXT,
  raw_text        TEXT,
  confidence      NUMERIC(5,4),
  is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_maintenance_aircraft ON maintenance_events(aircraft_id);
CREATE INDEX idx_maintenance_date ON maintenance_events(event_date DESC);
CREATE INDEX idx_maintenance_type ON maintenance_events(event_type);
