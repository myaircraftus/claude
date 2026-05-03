-- Migration 077: ADSB Fallback telemetry (Spec 4.3) — schema-only
--
-- Three concerns:
--   1. flight_events     — one row per detected flight (start/end pings)
--   2. telemetry_sources — per-aircraft per-source config (priority + enabled)
--   3. meter_readings    — widen CHECK on source + add confidence column
--
-- Path B: rolls into the existing aviation Aircraft / MeterReading shape;
-- no parallel "aircraft_telemetry" table. The flight is the new entity.
-- Spec 4.4's inference engine (multi-source dedupe) will read these rows
-- — not built this sprint; the schema accommodates it.

-- ─── 1. flight_events ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS flight_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id     UUID NOT NULL REFERENCES aircraft(id)      ON DELETE CASCADE,

  -- Source taxonomy. UI badge logic in lib/telemetry/inference.ts maps these
  -- to Verified / Synced / Estimated / Logged.
  source          TEXT NOT NULL
    CHECK (source IN ('airbly', 'fsp', 'adsb-exchange', 'flightaware', 'manual')),
  -- 0–1. ADSB inferred = 0.55-0.75; user-confirmed = 1.0.
  confidence      NUMERIC(3,2) NOT NULL DEFAULT 0.6
    CHECK (confidence >= 0 AND confidence <= 1),

  -- Detected timing (airborne window, NOT engine-on/off).
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ NOT NULL CHECK (end_time >= start_time),
  airborne_hours  NUMERIC(6,2) NOT NULL CHECK (airborne_hours >= 0),

  -- Inferred meter deltas. Owner can override; on override, source flips
  -- to 'manual' and confidence → 1.0 (handled in /api/flight-events/[id]).
  inferred_hobbs_delta NUMERIC(6,2),
  inferred_tach_delta  NUMERIC(6,2),

  -- Path: array of { lat, lon, ts, alt? } pings the source returned. Bounded
  -- (typically 50-300 per flight); JSONB keeps the row self-contained.
  path            JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Origin / destination ICAO if the source labelled them; otherwise NULL.
  origin_icao     TEXT,
  destination_icao TEXT,

  -- User confirmation lifecycle. NULL = pending. confirmed_at NOT NULL =
  -- owner saw the estimate and accepted/overrode it.
  confirmed_at    TIMESTAMPTZ,
  confirmed_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- True iff owner edited the inferred values before confirming.
  was_overridden  BOOLEAN NOT NULL DEFAULT FALSE,

  -- For dedupe across sources (Spec 4.4): same flight seen by Airbly + ADSB
  -- gets one row + this points at the kept-source row.
  superseded_by   UUID REFERENCES flight_events(id) ON DELETE SET NULL,

  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hot path: "give me unconfirmed flights for aircraft X" — drives the
-- aircraft Sync tab + the AI Inbox card.
CREATE INDEX IF NOT EXISTS flight_events_aircraft_pending_idx
  ON flight_events (aircraft_id, start_time DESC)
  WHERE confirmed_at IS NULL AND superseded_by IS NULL;

-- Org-wide recent flights — Dashboard widget (Phase 5).
CREATE INDEX IF NOT EXISTS flight_events_org_recent_idx
  ON flight_events (organization_id, start_time DESC);

-- Dedupe lookup: "did we already capture a flight starting around T for
-- aircraft A?" Spec 4.4 dedupe logic uses ±10 min window.
CREATE INDEX IF NOT EXISTS flight_events_dedupe_idx
  ON flight_events (aircraft_id, start_time);

ALTER TABLE flight_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flight_events_org_read  ON flight_events;
DROP POLICY IF EXISTS flight_events_org_write ON flight_events;

CREATE POLICY flight_events_org_read ON flight_events
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

-- WRITE: server (service role) inserts from the cron sync, owner/admin/
-- mechanic can confirm/override. Pilots can confirm their own flights via
-- the UI but the API gate handles the role check.
CREATE POLICY flight_events_org_write ON flight_events
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin', 'mechanic', 'pilot')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin', 'mechanic', 'pilot')
    )
  );

-- ─── 2. telemetry_sources — per-aircraft source config ──────────────────────
-- One row per (aircraft × source). Drives Spec 4.4's source priority pick.
-- This sprint only writes 'adsb-exchange' rows; future sprints add airbly /
-- fsp / flightaware. Settings UI lands in Spec 4.4.

CREATE TABLE IF NOT EXISTS telemetry_sources (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id     UUID NOT NULL REFERENCES aircraft(id)      ON DELETE CASCADE,
  source          TEXT NOT NULL
    CHECK (source IN ('airbly', 'fsp', 'adsb-exchange', 'flightaware')),

  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  -- Lower = higher priority. airbly=10, fsp=20, adsb-exchange=30,
  -- flightaware=40. Spec 4.4 picks the lowest-numbered enabled source
  -- that has data for the day.
  priority        INTEGER NOT NULL DEFAULT 30,

  -- Spec 4.3 §Tach inference: shop can override the 0.4-hour buffer for
  -- atypical ops (e.g. ag flights have very short cycles).
  tach_buffer_hours_per_cycle NUMERIC(4,2) NOT NULL DEFAULT 0.4
    CHECK (tach_buffer_hours_per_cycle >= 0 AND tach_buffer_hours_per_cycle <= 2),
  -- Spec 4.3 §Tach inference: Hobbs→Tach ratio. Defaults map per
  -- aircraft class in lib/telemetry/inference.ts; this column allows
  -- per-aircraft override.
  tach_to_hobbs_ratio          NUMERIC(4,3) NOT NULL DEFAULT 0.85
    CHECK (tach_to_hobbs_ratio > 0 AND tach_to_hobbs_ratio <= 1),

  -- Last successful sync timestamp + opaque cursor (provider-specific).
  last_synced_at  TIMESTAMPTZ,
  last_cursor     TEXT,

  -- Free-form provider config (e.g. ICAO24 hex code for ADSB Exchange,
  -- API key reference for FSP, device id for Airbly). NEVER stores raw
  -- secrets — those are in env or Vault.
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (aircraft_id, source)
);

CREATE INDEX IF NOT EXISTS telemetry_sources_aircraft_idx
  ON telemetry_sources (aircraft_id, priority)
  WHERE enabled = TRUE;
CREATE INDEX IF NOT EXISTS telemetry_sources_due_for_sync_idx
  ON telemetry_sources (last_synced_at NULLS FIRST)
  WHERE enabled = TRUE;

ALTER TABLE telemetry_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS telemetry_sources_org_read  ON telemetry_sources;
DROP POLICY IF EXISTS telemetry_sources_org_write ON telemetry_sources;

CREATE POLICY telemetry_sources_org_read ON telemetry_sources
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

CREATE POLICY telemetry_sources_org_write ON telemetry_sources
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin', 'mechanic')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin', 'mechanic')
    )
  );

-- ─── 3. meter_readings: widen source CHECK + add confidence column ──────────

ALTER TABLE meter_readings
  DROP CONSTRAINT IF EXISTS meter_readings_source_check;

ALTER TABLE meter_readings
  ADD CONSTRAINT meter_readings_source_check
  CHECK (source IN ('manual', 'automatic', 'imported',
                    'airbly', 'fsp', 'adsb-exchange', 'flightaware'));

ALTER TABLE meter_readings
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(3,2)
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));
ALTER TABLE meter_readings
  ADD COLUMN IF NOT EXISTS source_flight_event_id UUID
    REFERENCES flight_events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS meter_readings_source_flight_idx
  ON meter_readings (source_flight_event_id)
  WHERE source_flight_event_id IS NOT NULL;

-- ─── 4. updated_at triggers ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_telemetry_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS flight_events_set_updated_at      ON flight_events;
DROP TRIGGER IF EXISTS telemetry_sources_set_updated_at  ON telemetry_sources;

CREATE TRIGGER flight_events_set_updated_at      BEFORE UPDATE ON flight_events      FOR EACH ROW EXECUTE FUNCTION trg_telemetry_set_updated_at();
CREATE TRIGGER telemetry_sources_set_updated_at  BEFORE UPDATE ON telemetry_sources  FOR EACH ROW EXECUTE FUNCTION trg_telemetry_set_updated_at();

-- ─── 5. Comments ────────────────────────────────────────────────────────────

COMMENT ON TABLE  flight_events      IS 'Spec 4.3 — one row per detected flight. ADSB inferred = source=adsb-exchange + confidence 0.55-0.75. Owner-confirmed flips source=manual + confidence=1.0.';
COMMENT ON TABLE  telemetry_sources  IS 'Spec 4.3 — per-aircraft per-source config. priority: airbly=10, fsp=20, adsb-exchange=30, flightaware=40. tach_buffer + ratio overridable per aircraft.';
COMMENT ON COLUMN meter_readings.source              IS 'Spec 4.3 widened — manual/automatic/imported (legacy 1.1) + airbly/fsp/adsb-exchange/flightaware (4.x telemetry).';
COMMENT ON COLUMN meter_readings.confidence          IS 'Spec 4.3 — 0–1 score. UI badge: 0.95+ Verified, 0.80+ Synced, 0.55+ Estimated, manual NULL = Logged.';
COMMENT ON COLUMN meter_readings.source_flight_event_id IS 'Spec 4.3 — when a reading was inferred from a flight, this is the source flight. NULL for non-telemetry readings.';
