-- Migration 112: Phase 16 Sprint 16.8 — AI ops assistant conversation history
--
-- The /admin/ops-assistant chat surface persists each user message + AI
-- reply. Tool invocations (database reads) get their inputs/outputs
-- logged so an admin can audit "what did the AI look at to give that
-- answer".
--
-- HARD RULE: every tool the assistant calls is read-only. There is
-- intentionally no "tool execution log" status field for mutations
-- because mutations aren't allowed.
--
-- Migration NOT applied automatically. Andy applies via tsx-pg.

CREATE TABLE ops_assistant_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  /** Admin user this conversation belongs to. RLS keys on this. */
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  /** Optional human-readable title. Auto-derived from first message. */
  title           text,
  /** Conversation-level metadata (model, total_tokens, etc). */
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ops_assistant_conversations_user_idx
  ON ops_assistant_conversations(user_id, created_at DESC);

ALTER TABLE ops_assistant_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY ops_assistant_conv_self_select ON ops_assistant_conversations
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY ops_assistant_conv_admin_select ON ops_assistant_conversations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_platform_admin = true)
  );

-- ──────────────────────────────────────────────────────────────────────
-- ops_assistant_messages
-- ──────────────────────────────────────────────────────────────────────

CREATE TYPE ops_assistant_role AS ENUM ('user', 'assistant', 'tool');

CREATE TABLE ops_assistant_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ops_assistant_conversations(id) ON DELETE CASCADE,
  role            ops_assistant_role NOT NULL,
  /** Plain text body for user/assistant; structured tool I/O in metadata. */
  content         text NOT NULL DEFAULT '',
  /** Tool name when role='tool'; null otherwise. */
  tool_name       text,
  /** Tool input JSON when role='tool'. */
  tool_input      jsonb,
  /** Tool output JSON when role='tool'. */
  tool_output     jsonb,
  /** Model token + cost breakdown when role='assistant'. */
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ops_assistant_messages_conv_idx
  ON ops_assistant_messages(conversation_id, created_at);

ALTER TABLE ops_assistant_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY ops_assistant_msg_via_conversation ON ops_assistant_messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT id FROM ops_assistant_conversations WHERE user_id = auth.uid()
    )
    OR
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_platform_admin = true)
  );

COMMENT ON TABLE ops_assistant_conversations IS
  'Phase 16 Sprint 16.8 — AI ops assistant chat history. See lib/ops/assistant.ts. Read-only tool agent.';
