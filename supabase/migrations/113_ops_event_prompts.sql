-- Migration 113: Phase 16 Sprint 16.11 — Claude Code prompt audit trail
--
-- Every prompt the admin generates from an unresolved ops_event lands
-- here. Lets us audit (a) which events triggered a code-fix attempt,
-- (b) what context the AI packaged, and (c) whether the fix actually
-- shipped. Prompts are markdown; up to ~16K each.
--
-- Migration NOT applied automatically. Andy applies via tsx-pg.

CREATE TYPE prompt_outcome AS ENUM (
  'pending',
  'used',
  'fixed',
  'partial',
  'wont_fix',
  'duplicate'
);

CREATE TABLE ops_event_prompts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  /** Spine source — same enum the ops_inbox view uses. */
  ops_event_source_type   text NOT NULL CHECK (ops_event_source_type IN
    ('support_ticket', 'error_event', 'alert_event', 'feedback_item', 'churn_signal')),
  ops_event_source_id     uuid NOT NULL,
  /** The full markdown prompt body. */
  prompt_text             text NOT NULL,
  /** Files the generator gathered as context (paths + sizes). */
  context_files           jsonb NOT NULL DEFAULT '[]'::jsonb,
  /** AI summary used to seed the prompt. */
  ai_analysis             text,
  /** User who generated it. */
  generated_by_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at            timestamptz NOT NULL DEFAULT now(),
  /** Filled when admin confirms they pasted the prompt into Claude Code. */
  used_at                 timestamptz,
  /** Admin marks fix outcome after the change ships. */
  outcome                 prompt_outcome NOT NULL DEFAULT 'pending',
  /** Optional admin note explaining outcome. */
  outcome_note            text,
  outcome_recorded_at     timestamptz,
  /** Token + cost breakdown of the AI analysis call. */
  metadata                jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ops_event_prompts_event_idx
  ON ops_event_prompts(ops_event_source_type, ops_event_source_id, generated_at DESC);

CREATE INDEX ops_event_prompts_outcome_idx
  ON ops_event_prompts(outcome, generated_at DESC);

CREATE INDEX ops_event_prompts_user_idx
  ON ops_event_prompts(generated_by_user_id, generated_at DESC);

ALTER TABLE ops_event_prompts ENABLE ROW LEVEL SECURITY;

-- Admin-only — this is internal tooling.
CREATE POLICY ops_event_prompts_admin_select ON ops_event_prompts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_platform_admin = true)
  );

CREATE POLICY ops_event_prompts_admin_insert ON ops_event_prompts
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_platform_admin = true)
    AND generated_by_user_id = auth.uid()
  );

CREATE POLICY ops_event_prompts_admin_update ON ops_event_prompts
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_platform_admin = true)
  );

COMMENT ON TABLE ops_event_prompts IS
  'Phase 16 Sprint 16.11 — audit trail for Claude Code prompts generated from ops_events. See lib/ops/prompt-generator.ts.';
