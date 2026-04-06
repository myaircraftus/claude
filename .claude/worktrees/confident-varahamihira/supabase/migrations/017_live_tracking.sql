-- Migration 017: Live Tracking / Recent Flights
-- Adds provider config, live state, recent flights, track points, and sync logs.

-- ============================================================
-- 1. AIRCRAFT TRACKING PROVIDER CONFIG
-- ============================================================
CREATE TABLE aircraft_tracking_provider_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aircraft_id UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'none', -- 'flightaware' | 'adsbexchange' | 'none'
  provider_aircraft_id TEXT, -- tail/hex for the provider
  embed_enabled BOOLEAN NOT NULL DEFAULT false,
  structured_sync_enabled BOOLEAN NOT NULL DEFAULT false,
  use_as_ops_signal BOOLEAN NOT NULL DEFAULT false,
  sync_cadence_seconds INTEGER NOT NULL DEFAULT 120,
  source_priority INTEGER NOT NULL DEFAULT 10,
  api_key_ref TEXT, -- reference only, actual key in env
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(aircraft_id)
);

-- ============================================================
-- 2. AIRCRAFT LIVE STATE
-- ============================================================
CREATE TABLE aircraft_live_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aircraft_id UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  registration TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_aircraft_id TEXT,
  hex TEXT,
  callsign TEXT,
  is_live BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'no_provider', -- 'live_now' | 'recently_active' | 'no_provider' | 'unavailable'
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  altitude_ft INTEGER,
  groundspeed_kts INTEGER,
  heading_deg INTEGER,
  last_seen_at TIMESTAMPTZ,
  departed_airport TEXT,
  arrival_airport TEXT,
  current_flight_id TEXT,
  provider_link TEXT,
  embed_url TEXT,
  raw JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(aircraft_id)
);

-- ============================================================
-- 3. AIRCRAFT RECENT FLIGHTS
-- ============================================================
CREATE TABLE aircraft_recent_flights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aircraft_id UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  registration TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_flight_id TEXT NOT NULL,
  callsign TEXT,
  origin TEXT,
  destination TEXT,
  departed_at TIMESTAMPTZ,
  arrived_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  max_altitude_ft INTEGER,
  avg_groundspeed_kts INTEGER,
  last_groundspeed_kts INTEGER,
  status TEXT,
  provider_link TEXT,
  raw JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(aircraft_id, provider_flight_id)
);

-- ============================================================
-- 4. FLIGHT TRACK POINTS
-- ============================================================
CREATE TABLE flight_track_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_id UUID NOT NULL REFERENCES aircraft_recent_flights(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  altitude_ft INTEGER,
  groundspeed_kts INTEGER,
  heading_deg INTEGER
);

-- ============================================================
-- 5. FLIGHT SYNC LOGS
-- ============================================================
CREATE TABLE flight_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aircraft_id UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  sync_type TEXT NOT NULL, -- 'live_state' | 'recent_flights' | 'flight_detail'
  status TEXT NOT NULL, -- 'success' | 'error' | 'skipped'
  error_message TEXT,
  records_synced INTEGER DEFAULT 0,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE aircraft_tracking_provider_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE aircraft_live_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE aircraft_recent_flights ENABLE ROW LEVEL SECURITY;
ALTER TABLE flight_track_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE flight_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aircraft_tracking_config_org_access" ON aircraft_tracking_provider_config
  FOR ALL USING (organization_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = auth.uid()));

CREATE POLICY "aircraft_live_state_access" ON aircraft_live_state
  FOR ALL USING (aircraft_id IN (SELECT id FROM aircraft WHERE organization_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = auth.uid())));

CREATE POLICY "aircraft_recent_flights_access" ON aircraft_recent_flights
  FOR ALL USING (aircraft_id IN (SELECT id FROM aircraft WHERE organization_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = auth.uid())));

CREATE POLICY "flight_track_points_access" ON flight_track_points
  FOR ALL USING (flight_id IN (SELECT id FROM aircraft_recent_flights WHERE aircraft_id IN (SELECT id FROM aircraft WHERE organization_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = auth.uid()))));

CREATE POLICY "flight_sync_logs_access" ON flight_sync_logs
  FOR ALL USING (aircraft_id IN (SELECT id FROM aircraft WHERE organization_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = auth.uid())));
