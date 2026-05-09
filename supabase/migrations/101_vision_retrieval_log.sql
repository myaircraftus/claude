-- Sprint 8.8 — Vision Retrieval Log + Confidence Telemetry (Phase 8).
--
-- ⚠ NOT APPLIED — Andy applies via psql or apps/web/scripts/apply-101.ts.
--
-- One row per /api/vision/search OR /api/vision/answer request.
-- Powers /admin/vision/telemetry (p50/p95 latency, fallback rate,
-- average confidence over the last 7 days, top low-confidence queries).
--
-- Append-only — no soft-delete column. PII content (the user's query)
-- is preserved because admins triage by query, but rows older than the
-- retention window can be hard-deleted via a future cron sweep.

CREATE TABLE IF NOT EXISTS vision_retrieval_log (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Routing — which API route generated this row.
  route                    text NOT NULL CHECK (route IN ('search', 'answer')),
  mode                     text CHECK (mode IN ('hybrid', 'text', 'vision')),

  -- Query + result-shape signals.
  search_query             text NOT NULL,
  result_count             int NOT NULL DEFAULT 0,
  top_combined_score       numeric,        -- score_combined of the top hit
  raw_confidence           numeric,        -- pre-calibration score (0-1)
  calibrated_confidence    numeric,        -- post-calibration score (0-1)

  -- Fallback signals.
  fallback_invoked         boolean NOT NULL DEFAULT false,
  fallback_model           text,
  fallback_citations       int,            -- count of pages cited by the fallback

  -- Performance.
  retrieval_ms             int,            -- hybridRetrieve() duration
  total_ms                 int NOT NULL,   -- end-to-end route duration

  -- Outcome.
  status                   text NOT NULL DEFAULT 'ok'
    CHECK (status IN ('ok', 'error')),
  error_message            text,

  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vision_retrieval_log_org_created_idx
  ON vision_retrieval_log (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS vision_retrieval_log_org_route_idx
  ON vision_retrieval_log (organization_id, route, created_at DESC);

CREATE INDEX IF NOT EXISTS vision_retrieval_log_org_low_confidence_idx
  ON vision_retrieval_log (organization_id, calibrated_confidence)
  WHERE calibrated_confidence IS NOT NULL AND calibrated_confidence < 0.5;

ALTER TABLE vision_retrieval_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org admins read vision_retrieval_log" ON vision_retrieval_log;
CREATE POLICY "Org admins read vision_retrieval_log"
  ON vision_retrieval_log FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid()
      AND accepted_at IS NOT NULL
      AND role IN ('owner', 'admin')
  ));

-- Writes go through service-role only (the API routes use
-- createServiceSupabase() to bypass RLS for telemetry).
DROP POLICY IF EXISTS "Service role writes vision_retrieval_log" ON vision_retrieval_log;
CREATE POLICY "Service role writes vision_retrieval_log"
  ON vision_retrieval_log FOR INSERT TO service_role
  WITH CHECK (true);

COMMENT ON TABLE  vision_retrieval_log IS 'One row per vision retrieval request (Phase 8 Sprint 8.8). Powers /admin/vision/telemetry.';
COMMENT ON COLUMN vision_retrieval_log.raw_confidence IS 'Top combined retrieval score before calibrator runs (Sprint 8.8).';
COMMENT ON COLUMN vision_retrieval_log.calibrated_confidence IS 'Calibrated confidence after folding in feedback + review verdicts.';
COMMENT ON COLUMN vision_retrieval_log.fallback_invoked IS 'True when /api/vision/answer fell back to OpenAI Vision.';
