-- Migration 063: Meter Profiles & Aircraft Times (Spec 1.1)
--
-- Three tables + one ALTER. Meter profiles are templates ("Piston Single",
-- "Turbine") that bundle multiple meter definitions ("Hobbs", "Tach",
-- "Cycles"). Aircraft pick a profile; readings are stored against the
-- (aircraft_id, meter_definition_id) pair as a time series.
--
-- Path B: existing aircraft.total_time_hours stays untouched for back-compat
-- (read by older surfaces). meter_readings is the new source of truth —
-- callers should use lib/meters/current.ts:getCurrentMeterReading() instead
-- of the legacy column going forward.

-- ─── 1. meter_profiles ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS meter_profiles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,             -- "Piston Single", "Turbine"
  description     TEXT,
  -- True iff this is one of the seed profiles every org gets at creation.
  -- Lets us upgrade seeds without stepping on user customizations.
  is_template     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_meter_profiles_org ON meter_profiles(organization_id);

-- ─── 2. meter_definitions ──────────────────────────────────────────────────
-- The individual meters within a profile. Storing as a child table (rather
-- than a JSONB array on meter_profiles) so meter_readings can FK to a
-- specific meter_definition row — that gives clean cascades and lets us
-- rename a meter without breaking history.

CREATE TABLE IF NOT EXISTS meter_definitions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meter_profile_id UUID NOT NULL REFERENCES meter_profiles(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,             -- "Hobbs", "Tach", "Cycles"
  unit            TEXT NOT NULL              -- "hours", "cycles", "landings"
    CHECK (unit IN ('hours', 'cycles', 'landings', 'minutes', 'starts')),
  -- Display precision. 1 = 1234.5, 2 = 1234.56, 0 = 1234.
  decimal_places  INTEGER NOT NULL DEFAULT 1
    CHECK (decimal_places BETWEEN 0 AND 4),
  -- Render order within the profile (smallest first). Decoupled from id
  -- order so users can reorder without rewriting rows.
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (meter_profile_id, name)
);

CREATE INDEX IF NOT EXISTS idx_meter_definitions_profile ON meter_definitions(meter_profile_id);

-- ─── 3. meter_readings ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS meter_readings (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id         UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  meter_definition_id UUID NOT NULL REFERENCES meter_definitions(id) ON DELETE CASCADE,
  value               NUMERIC(12,4) NOT NULL CHECK (value >= 0),
  -- ISO date the reading was taken (not the ISO timestamp it was logged).
  reading_date        DATE NOT NULL,
  source              TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'automatic', 'imported')),
  notes               TEXT,
  recorded_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Time-series lookups: (aircraft, meter, date DESC) for "current value"
-- queries; getCurrentMeterReading() reads the first row from this index.
CREATE INDEX IF NOT EXISTS idx_meter_readings_lookup
  ON meter_readings(aircraft_id, meter_definition_id, reading_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meter_readings_org
  ON meter_readings(organization_id, reading_date DESC);

-- ─── 4. aircraft.meter_profile_id ───────────────────────────────────────────

ALTER TABLE aircraft
  ADD COLUMN IF NOT EXISTS meter_profile_id UUID REFERENCES meter_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_aircraft_meter_profile
  ON aircraft(meter_profile_id) WHERE meter_profile_id IS NOT NULL;

COMMENT ON COLUMN aircraft.meter_profile_id IS
  'Selected meter profile (Spec 1.1). Drives which meters appear on AircraftMeterPanel + which meters auto-fill on logbook entries.';

-- ─── 5. RLS ────────────────────────────────────────────────────────────────

ALTER TABLE meter_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE meter_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE meter_readings    ENABLE ROW LEVEL SECURITY;

-- meter_profiles: org-member read, mechanic+ write (mirrors locations).
DROP POLICY IF EXISTS meter_profiles_org_read   ON meter_profiles;
DROP POLICY IF EXISTS meter_profiles_org_write  ON meter_profiles;

CREATE POLICY meter_profiles_org_read ON meter_profiles
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

CREATE POLICY meter_profiles_org_write ON meter_profiles
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid()
        AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin', 'mechanic')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid()
        AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin', 'mechanic')
    )
  );

-- meter_definitions: same as parent profile (joined via meter_profile_id).
-- Postgres can't directly express "RLS via parent FK" in a clean USING
-- clause without a subquery; we follow the same pattern as the rest of
-- the codebase (006_embeddings, 014_ocr_pipeline).
DROP POLICY IF EXISTS meter_definitions_org_read  ON meter_definitions;
DROP POLICY IF EXISTS meter_definitions_org_write ON meter_definitions;

CREATE POLICY meter_definitions_org_read ON meter_definitions
  FOR SELECT
  USING (
    meter_profile_id IN (
      SELECT id FROM meter_profiles
      WHERE organization_id IN (
        SELECT organization_id FROM organization_memberships
        WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
      )
    )
  );

CREATE POLICY meter_definitions_org_write ON meter_definitions
  FOR ALL
  USING (
    meter_profile_id IN (
      SELECT id FROM meter_profiles
      WHERE organization_id IN (
        SELECT organization_id FROM organization_memberships
        WHERE user_id = auth.uid()
          AND accepted_at IS NOT NULL
          AND role IN ('owner', 'admin', 'mechanic')
      )
    )
  )
  WITH CHECK (
    meter_profile_id IN (
      SELECT id FROM meter_profiles
      WHERE organization_id IN (
        SELECT organization_id FROM organization_memberships
        WHERE user_id = auth.uid()
          AND accepted_at IS NOT NULL
          AND role IN ('owner', 'admin', 'mechanic')
      )
    )
  );

-- meter_readings: org-member read; mechanic+ + pilot write (a pilot can log
-- their own meter readings post-flight even though they can't edit work
-- orders). Matches existing aviation conventions.
DROP POLICY IF EXISTS meter_readings_org_read  ON meter_readings;
DROP POLICY IF EXISTS meter_readings_org_write ON meter_readings;

CREATE POLICY meter_readings_org_read ON meter_readings
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

CREATE POLICY meter_readings_org_write ON meter_readings
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid()
        AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin', 'mechanic', 'pilot')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid()
        AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin', 'mechanic', 'pilot')
    )
  );

-- ─── 6. updated_at triggers ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_meter_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS meter_profiles_set_updated_at    ON meter_profiles;
DROP TRIGGER IF EXISTS meter_definitions_set_updated_at ON meter_definitions;
DROP TRIGGER IF EXISTS meter_readings_set_updated_at    ON meter_readings;

CREATE TRIGGER meter_profiles_set_updated_at    BEFORE UPDATE ON meter_profiles    FOR EACH ROW EXECUTE FUNCTION trg_meter_set_updated_at();
CREATE TRIGGER meter_definitions_set_updated_at BEFORE UPDATE ON meter_definitions FOR EACH ROW EXECUTE FUNCTION trg_meter_set_updated_at();
CREATE TRIGGER meter_readings_set_updated_at    BEFORE UPDATE ON meter_readings    FOR EACH ROW EXECUTE FUNCTION trg_meter_set_updated_at();

-- ─── 7. Comments ───────────────────────────────────────────────────────────

COMMENT ON TABLE meter_profiles    IS 'Templates bundling meter definitions (Spec 1.1).';
COMMENT ON TABLE meter_definitions IS 'Meter definitions within a profile — Hobbs, Tach, Cycles, etc.';
COMMENT ON TABLE meter_readings    IS 'Time-series of meter readings per aircraft × meter (Spec 1.1).';
