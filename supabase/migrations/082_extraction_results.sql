-- Migration 082: Extraction Results (Spec 7.3)
--
-- One row per extraction attempt against an intake_documents row. The
-- AI vision pipeline runs the router (small classification call) → the
-- specialized extractor (cost-receipt / maintenance-invoice /
-- insurance-declaration) → writes the parsed JSON here. Cost +
-- token usage are mirrored from ai_activity_log so the operator UI
-- doesn't need to JOIN to render "this took N tokens, cost $0.012."
--
-- An intake_documents row may have multiple extraction_results rows
-- over its lifetime (operator clicks "re-extract" after a model
-- upgrade or a stricter prompt update). The latest by created_at is
-- the canonical one.

CREATE TABLE IF NOT EXISTS extraction_results (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  intake_document_id UUID NOT NULL REFERENCES intake_documents(id) ON DELETE CASCADE,

  -- Which extractor handled this run. Open enum for future variants.
  extractor       TEXT NOT NULL
    CHECK (extractor IN (
      'cost-receipt',
      'maintenance-invoice',
      'insurance-declaration',
      'router-only',          -- classified but no specialist matched
      'manual'                -- operator overrode + saved direct
    )),

  model_used      TEXT NOT NULL,

  -- Optional raw OCR/vision text (pre-JSON). Useful for debugging
  -- prompt regressions; only stored for short-circuit cases. NULL for
  -- production runs to keep row size tight.
  raw_text        TEXT,

  -- Structured fields the extractor returned. JSONB shape varies per
  -- extractor — see types/index.ts ExtractionResult for the union.
  parsed_fields   JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- 0-1 confidence the extraction is correct end-to-end (vendor +
  -- date + total + line items match the document).
  extraction_confidence NUMERIC(3,2)
    CHECK (extraction_confidence IS NULL OR (extraction_confidence >= 0 AND extraction_confidence <= 1)),

  -- 0-1 confidence the aircraft was matched correctly (NULL when no
  -- aircraft was attempted, e.g. a software subscription invoice).
  aircraft_match_confidence NUMERIC(3,2)
    CHECK (aircraft_match_confidence IS NULL OR (aircraft_match_confidence >= 0 AND aircraft_match_confidence <= 1)),
  -- Aircraft id matched, NULL when the doc isn't aircraft-specific or
  -- match confidence was too low.
  aircraft_id     UUID REFERENCES aircraft(id) ON DELETE SET NULL,

  -- Cost mirror columns from ai_activity_log so the operator UI
  -- doesn't have to JOIN to render token + cost telemetry.
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  cost_usd_cents  INTEGER,
  duration_ms     INTEGER,

  status          TEXT NOT NULL DEFAULT 'success'
    CHECK (status IN (
      'success',                -- clean extraction, auto-creating cost_entries
      'partial',                -- extracted but totals mismatch / aircraft unclear
      'failed',                 -- LLM error or unparseable response
      'manual_review_needed'    -- below auto-approve confidence threshold
    )),
  error_message   TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS extraction_results_intake_idx
  ON extraction_results (intake_document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS extraction_results_org_idx
  ON extraction_results (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS extraction_results_review_idx
  ON extraction_results (organization_id, created_at DESC)
  WHERE status IN ('partial', 'manual_review_needed');

-- Back-reference: cost_entries.extraction_result_id (column exists from
-- 080 unconstrained; add the FK now that the target table exists).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='cost_entries'
      AND constraint_name='cost_entries_extraction_result_id_fkey'
  ) THEN
    ALTER TABLE cost_entries
      ADD CONSTRAINT cost_entries_extraction_result_id_fkey
      FOREIGN KEY (extraction_result_id)
      REFERENCES extraction_results(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS cost_entries_extraction_idx
  ON cost_entries (extraction_result_id)
  WHERE extraction_result_id IS NOT NULL;

ALTER TABLE extraction_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS extraction_results_org_read  ON extraction_results;
DROP POLICY IF EXISTS extraction_results_org_write ON extraction_results;

CREATE POLICY extraction_results_org_read ON extraction_results
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

-- Writes only via service-role (the extractor runs server-side from
-- /api/costs/intake/[id]/extract). Mechanic+ admin override allowed
-- for the rare manual fix.
CREATE POLICY extraction_results_org_write ON extraction_results
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin', 'mechanic')
    )
  ) WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin', 'mechanic')
    )
  );

COMMENT ON TABLE extraction_results IS 'Spec 7.3 — one row per Claude Vision extraction. Latest row per intake_document_id is canonical. Cost mirror columns avoid a JOIN to ai_activity_log for the queue UI.';
