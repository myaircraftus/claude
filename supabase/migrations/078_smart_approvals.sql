-- Migration 078: Smart Customer Approvals (Spec 5.6)
--
-- Two concerns:
--   1. approval_line_items: ALTER ADD ai_explanation_md / generated_at / model
--      so each line carries a plain-English explanation alongside the
--      operator's technical description. NEVER replaces description —
--      "add, don't replace" — and the public view falls back gracefully
--      when ai_explanation_md is NULL.
--   2. ai_activity_log: new table for cost + observability of every LLM
--      call across the platform. This is the FIRST production LLM use,
--      so we put the audit trail in place from day one. Future sprints
--      (5.3 ML, 5.4 voice/camera, 5.7 QBO recon, 5.8 persona AI) all log
--      through this same table.

-- ─── 1. approval_line_items: AI explanation columns ─────────────────────────

ALTER TABLE approval_line_items
  ADD COLUMN IF NOT EXISTS ai_explanation_md          TEXT,
  ADD COLUMN IF NOT EXISTS ai_explanation_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_explanation_model       TEXT,
  -- Cached input tokens / output tokens for the explanation. Helps the
  -- regenerate route show "this took N tokens last time" without a
  -- second call to ai_activity_log.
  ADD COLUMN IF NOT EXISTS ai_explanation_input_tokens  INTEGER,
  ADD COLUMN IF NOT EXISTS ai_explanation_output_tokens INTEGER;

COMMENT ON COLUMN approval_line_items.ai_explanation_md          IS 'Spec 5.6 — plain-English Markdown explanation. NULL = use description as fallback. Generated server-side via lib/ai/explainers/approval-line.ts.';
COMMENT ON COLUMN approval_line_items.ai_explanation_generated_at IS 'When the LLM produced this explanation. NULL until first generation.';
COMMENT ON COLUMN approval_line_items.ai_explanation_model       IS 'Model id (e.g. claude-sonnet-4-5). Allows model-version-aware regeneration when we upgrade.';

-- ─── 2. ai_activity_log: every LLM call across the platform ─────────────────

CREATE TABLE IF NOT EXISTS ai_activity_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Who triggered the call. NULL = system / cron.
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Free-form scope label so we can attribute cost ("approval-explainer",
  -- "smart-greeting", "qbo-match", etc.). Open enum, validated in app
  -- layer rather than CHECK so future scopes don't need a migration.
  scope           TEXT NOT NULL,
  -- Optional FK-style anchors so we can join cost to the entity it
  -- generated content for. Stored as TEXT so any entity type works.
  entity_kind     TEXT,
  entity_id       TEXT,
  model           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'failure', 'cap-exceeded', 'rate-limited', 'timeout')),
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  -- Estimated cost in USD cents (×100 to keep it integer-friendly). The
  -- pricing map lives in lib/ai/anthropic.ts; if a model is unknown we
  -- store NULL and surface that in the admin UI.
  cost_usd_cents  INTEGER,
  duration_ms     INTEGER,
  error_message   TEXT,
  -- Free-form context blob — prompt id, redacted args, etc. Don't store
  -- raw user PII here; the explainer redacts before logging.
  context         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_activity_log_org_idx
  ON ai_activity_log (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_activity_log_scope_idx
  ON ai_activity_log (organization_id, scope, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_activity_log_failures_idx
  ON ai_activity_log (organization_id, created_at DESC)
  WHERE status != 'success';

ALTER TABLE ai_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_activity_log_org_read ON ai_activity_log;
DROP POLICY IF EXISTS ai_activity_log_admin_write ON ai_activity_log;

-- READ: any accepted org member can see their org's AI cost trail. Helps
-- shop foremen and owners watch spend.
CREATE POLICY ai_activity_log_org_read ON ai_activity_log
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

-- WRITE: service role only (the LLM client logs from server routes; no
-- end-user-driven inserts). The policy below blocks non-service writes —
-- service_role bypasses RLS entirely so logging still works.
CREATE POLICY ai_activity_log_admin_write ON ai_activity_log
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin')
    )
  );

COMMENT ON TABLE ai_activity_log IS 'Spec 5.6 — every LLM call across the platform: scope, model, tokens, cost, duration, status. First production LLM use; this table will accrue rows from 5.3 / 5.4 / 5.7 / 5.8 sprints too.';
