CREATE TABLE IF NOT EXISTS aircraft_registry_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  aircraft_id UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  tail_number TEXT NOT NULL,
  normalized_tail TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'faa_registry_api',
  raw_payload JSONB NOT NULL DEFAULT '{}',
  make TEXT,
  model TEXT,
  year INT,
  serial_number TEXT,
  engine_make TEXT,
  engine_model TEXT,
  registrant_name TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registry_snapshots_tail ON aircraft_registry_snapshots(normalized_tail);
CREATE INDEX IF NOT EXISTS idx_registry_snapshots_aircraft ON aircraft_registry_snapshots(aircraft_id);
CREATE INDEX IF NOT EXISTS idx_registry_snapshots_fetched_at ON aircraft_registry_snapshots(fetched_at DESC);

CREATE TABLE IF NOT EXISTS aircraft_registry_sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  aircraft_id UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  tail_number TEXT NOT NULL,
  normalized_tail TEXT NOT NULL,
  cache_status TEXT,
  sync_status TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'faa_lookup',
  message TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registry_sync_logs_tail ON aircraft_registry_sync_logs(normalized_tail);
CREATE INDEX IF NOT EXISTS idx_registry_sync_logs_created_at ON aircraft_registry_sync_logs(created_at DESC);
