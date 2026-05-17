-- Intelligence cache — stores generated Aircraft Intelligence module reports
-- (history / prebuy / ad-traceability / missing-records) so the expensive
-- multi-query AI analysis is not re-run on every page load. Reads pick the
-- latest non-expired row per (aircraft, module); a 24h TTL is the default.

CREATE TABLE IF NOT EXISTS intelligence_cache (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  aircraft_id   UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  module        TEXT NOT NULL
                CHECK (module IN ('history', 'prebuy', 'ad-traceability', 'missing-records')),
  result_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intelligence_cache_lookup
  ON intelligence_cache(aircraft_id, module, expires_at);
CREATE INDEX IF NOT EXISTS idx_intelligence_cache_org ON intelligence_cache(org_id);

ALTER TABLE intelligence_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intelligence_cache_read ON intelligence_cache;
CREATE POLICY intelligence_cache_read ON intelligence_cache
  FOR SELECT USING (org_id = ANY(get_my_org_ids()));

DROP POLICY IF EXISTS intelligence_cache_write ON intelligence_cache;
CREATE POLICY intelligence_cache_write ON intelligence_cache
  FOR ALL
  USING (org_id = ANY(get_my_org_ids()))
  WITH CHECK (org_id = ANY(get_my_org_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON intelligence_cache TO authenticated;

COMMENT ON TABLE intelligence_cache IS 'Cached Aircraft Intelligence module reports (24h TTL); read picks the latest non-expired row per aircraft+module.';
