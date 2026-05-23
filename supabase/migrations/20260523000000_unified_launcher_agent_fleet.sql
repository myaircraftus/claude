-- Unified launcher + agent fleet — DB foundation.
-- Applied to production 2026-05-22.
--
-- Reuses + extends the existing support_tickets table that was created
-- in an earlier migration (has a richer schema than this migration
-- originally proposed). Adds three things:
--   1. portal_threads.work_order_id  — per-WO chat binding
--   2. portal_messages.status_pill   — structured status update on each msg
--   3. support_tickets extensions    — messages[], persona, cited_kb_ids, ai_confidence
--   4. support_kb_entry              — curated KB powering the support AI
--   5. agent_runs                    — audit log of every AI agent invocation

-- 1. Per-WO chat binding
ALTER TABLE public.portal_threads
  ADD COLUMN IF NOT EXISTS work_order_id uuid
    REFERENCES public.work_orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS portal_threads_wo_idx
  ON public.portal_threads (work_order_id)
  WHERE work_order_id IS NOT NULL;

-- 2. Structured status pill on each message
ALTER TABLE public.portal_messages
  ADD COLUMN IF NOT EXISTS status_pill jsonb;
COMMENT ON COLUMN public.portal_messages.status_pill IS
  'Optional structured status update: { hours_done, hours_total, parts_received, parts_total, blockers, eta_date }.';

-- 3. Extend the EXISTING support_tickets table (don't clobber)
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS messages jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS persona text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS cited_kb_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS ai_confidence text;

-- 4. Support KB
CREATE TABLE IF NOT EXISTS public.support_kb_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body_md text NOT NULL,
  category text NOT NULL DEFAULT 'how-to',
  keywords text[] NOT NULL DEFAULT '{}',
  sop_reference text,
  persona_scope text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  proposed_by_agent_run uuid,
  source_ticket_ids uuid[] NOT NULL DEFAULT '{}',
  use_count int NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  search_tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body_md, '')), 'B')
  ) STORED
);
CREATE INDEX IF NOT EXISTS support_kb_status_idx ON public.support_kb_entry (status);
CREATE INDEX IF NOT EXISTS support_kb_category_idx ON public.support_kb_entry (category);
CREATE INDEX IF NOT EXISTS support_kb_keywords_idx ON public.support_kb_entry USING gin (keywords);
CREATE INDEX IF NOT EXISTS support_kb_search_idx ON public.support_kb_entry USING gin (search_tsv);
ALTER TABLE public.support_kb_entry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS support_kb_read_published ON public.support_kb_entry;
CREATE POLICY support_kb_read_published ON public.support_kb_entry FOR SELECT USING (
  status = 'published' OR EXISTS (SELECT 1 FROM public.user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.is_platform_admin = true)
);
DROP POLICY IF EXISTS support_kb_write_admin ON public.support_kb_entry;
CREATE POLICY support_kb_write_admin ON public.support_kb_entry FOR ALL
USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.is_platform_admin = true))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.is_platform_admin = true));

-- 5. Agent run audit log
CREATE TABLE IF NOT EXISTS public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  purpose text NOT NULL,
  trigger text NOT NULL DEFAULT 'api_request',
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_kind text,
  target_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','succeeded','failed','skipped','needs_human')),
  input jsonb, output jsonb,
  provider text, model text,
  latency_ms int, tokens_in int, tokens_out int,
  error_message text,
  recommendation jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS agent_runs_agent_created_idx ON public.agent_runs (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_runs_status_idx ON public.agent_runs (status) WHERE status IN ('pending','running','needs_human','failed');
CREATE INDEX IF NOT EXISTS agent_runs_target_idx ON public.agent_runs (target_kind, target_id) WHERE target_id IS NOT NULL;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_runs_admin_read ON public.agent_runs;
CREATE POLICY agent_runs_admin_read ON public.agent_runs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.is_platform_admin = true)
  OR triggered_by = auth.uid()
);
