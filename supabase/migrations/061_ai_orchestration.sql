-- Migration 061: AI Orchestration foundation (Spec 0.3)
--
-- Path B: spec defines an in-memory event bus + orchestrator. We persist
-- signals and ActionCards to Supabase so the orchestrator survives serverless
-- restarts and so multiple workers can coordinate without a shared process.
--
-- Two tables:
--   ai_signals       — append-only event log (every signal an entity emits).
--                      Older than ~30d gets pruned by a future cron.
--   ai_action_cards  — generated cards shown on the AI Inbox / home screen.
--                      Lifecycle: active → dismissed | resolved.
--
-- Both are org-scoped with the same RLS pattern as locations (any accepted
-- member reads; mechanic+ writes).

-- ─── 1. ai_signals ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_signals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Signal taxonomy from Spec 0.3. Open-ended TEXT so future signal types can
  -- be added without a migration; the application layer validates against an
  -- enum in lib/ai/types.ts.
  signal_type     TEXT NOT NULL,
  -- Free-form payload — typed at the application layer per signal_type.
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Tracking which user / system emitted this. NULL means system-generated.
  emitted_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source          TEXT NOT NULL DEFAULT 'system'
    CHECK (source IN ('user', 'system', 'integration', 'cron')),
  -- Whether the orchestrator has already drained this signal. Set true after
  -- the tick that processes it; the cron also uses this to avoid double-work.
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_signals_org_unprocessed
  ON ai_signals(organization_id, created_at DESC)
  WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_signals_org_type
  ON ai_signals(organization_id, signal_type, created_at DESC);

-- ─── 2. ai_action_cards ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_action_cards (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Persona this card is for. NULL = visible to every persona in the org.
  -- Matches PERSONA_CONFIG keys ('owner', 'mechanic', 'shop').
  persona            TEXT
    CHECK (persona IS NULL OR persona IN ('owner', 'mechanic', 'shop')),
  priority           TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  category           TEXT NOT NULL
    CHECK (category IN ('compliance', 'expiration', 'maintenance', 'approval', 'anomaly', 'insight')),
  title              TEXT NOT NULL,             -- 1-line headline, plain English
  body               TEXT NOT NULL,             -- 1-2 sentence explanation
  -- "why the AI thinks this matters" — array of human-readable strings.
  evidence           JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Array of { label, toolCall: { tool, args }, destructive? } entries.
  -- Typed at the application layer (lib/ai/types.ts SuggestedAction).
  suggested_actions  JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence         NUMERIC(3,2) NOT NULL DEFAULT 0.5
    CHECK (confidence >= 0 AND confidence <= 1),
  source             TEXT NOT NULL DEFAULT 'rule'
    CHECK (source IN ('rule', 'llm', 'ml')),
  -- Idempotency key — same (org, dedupe_key) replaces older active cards
  -- so signals firing repeatedly don't spam the inbox.
  dedupe_key         TEXT,
  -- The signal(s) that produced this card. Optional, for audit / debugging.
  source_signal_id   UUID REFERENCES ai_signals(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dismissed_at       TIMESTAMPTZ,
  resolved_at        TIMESTAMPTZ,
  -- Who acted on the card. Updated when dismissed_at / resolved_at flips.
  acted_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Active cards lookup: most common access pattern.
CREATE INDEX IF NOT EXISTS idx_ai_action_cards_active
  ON ai_action_cards(organization_id, priority, created_at DESC)
  WHERE dismissed_at IS NULL AND resolved_at IS NULL;

-- Persona-filtered active cards.
CREATE INDEX IF NOT EXISTS idx_ai_action_cards_persona
  ON ai_action_cards(organization_id, persona, created_at DESC)
  WHERE dismissed_at IS NULL AND resolved_at IS NULL;

-- Dedupe lookup (UPSERT pattern): replace any existing active card with the
-- same (org, dedupe_key) when a new one fires.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_action_cards_dedupe_active
  ON ai_action_cards(organization_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND dismissed_at IS NULL AND resolved_at IS NULL;

-- ─── 3. RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE ai_signals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_action_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_signals_org_member_read   ON ai_signals;
DROP POLICY IF EXISTS ai_signals_org_member_write  ON ai_signals;
DROP POLICY IF EXISTS ai_action_cards_org_read     ON ai_action_cards;
DROP POLICY IF EXISTS ai_action_cards_org_write    ON ai_action_cards;

CREATE POLICY ai_signals_org_member_read ON ai_signals
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

-- Signals are written by mechanic+ (matches the events they generate); the
-- orchestrator running with the service-role key bypasses RLS anyway.
CREATE POLICY ai_signals_org_member_write ON ai_signals
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

-- Cards: any accepted member reads; any accepted member can dismiss/resolve
-- their own cards (so a viewer can clear out alerts addressed to them).
-- The orchestrator (service role) handles inserts.
CREATE POLICY ai_action_cards_org_read ON ai_action_cards
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

CREATE POLICY ai_action_cards_org_write ON ai_action_cards
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

-- ─── 4. Comments ────────────────────────────────────────────────────────────

COMMENT ON TABLE ai_signals       IS 'Append-only event log feeding the AI orchestrator (Spec 0.3).';
COMMENT ON TABLE ai_action_cards  IS 'AI-generated cards shown on the home screen / AI Inbox (Spec 0.3).';
COMMENT ON COLUMN ai_action_cards.dedupe_key IS 'Idempotency key — newer card with same (org, dedupe_key) replaces older active one.';
COMMENT ON COLUMN ai_action_cards.suggested_actions IS 'Array of { label, toolCall: { tool, args }, destructive? }. Typed in lib/ai/types.ts.';
