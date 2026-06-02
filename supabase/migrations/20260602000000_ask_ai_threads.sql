-- Migration: dedicated Ask AI conversation storage.
--
-- The Ask AI feature (apps/web/lib/ask/threads.ts) persists conversations so a
-- user can reopen past chats. Phase 1 originally reused the work-order chat
-- tables (conversation_threads / thread_messages, migration 016), but those are
-- not reliably present across environments (prod drift) and thread_messages
-- lacks a created_by column in the canonical schema — which silently dropped
-- every persisted message. Ask AI now owns its own self-contained tables so it
-- no longer depends on the work-order chat schema.
--
-- Idempotent + re-runnable: safe on a clean from-scratch replay and on an
-- environment where it has already been applied.

-- ── ask_threads — one Ask AI conversation, owned by a single user ──
CREATE TABLE IF NOT EXISTS public.ask_threads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           text NOT NULL DEFAULT 'New conversation',
  aircraft_id     uuid REFERENCES public.aircraft(id) ON DELETE SET NULL,
  persona         text,
  archived        boolean NOT NULL DEFAULT false,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ask_threads_user
  ON public.ask_threads(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ask_threads_org
  ON public.ask_threads(organization_id);

-- ── ask_thread_messages — turns within a conversation ──
CREATE TABLE IF NOT EXISTS public.ask_thread_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       uuid NOT NULL REFERENCES public.ask_threads(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  content         text NOT NULL DEFAULT '',
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ask_thread_messages_thread
  ON public.ask_thread_messages(thread_id, created_at);

-- ── RLS — a user sees and manages only their own Ask AI conversations ──
-- Reads/writes go through the user-context Supabase client, so auth.uid() is
-- the owner. Message rows are reachable only via a thread the user owns.
ALTER TABLE public.ask_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ask_thread_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ask_threads_select ON public.ask_threads;
CREATE POLICY ask_threads_select ON public.ask_threads
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS ask_threads_insert ON public.ask_threads;
CREATE POLICY ask_threads_insert ON public.ask_threads
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND organization_id = ANY (get_my_org_ids())
  );

DROP POLICY IF EXISTS ask_threads_update ON public.ask_threads;
CREATE POLICY ask_threads_update ON public.ask_threads
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS ask_threads_delete ON public.ask_threads;
CREATE POLICY ask_threads_delete ON public.ask_threads
  FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS ask_thread_messages_select ON public.ask_thread_messages;
CREATE POLICY ask_thread_messages_select ON public.ask_thread_messages
  FOR SELECT USING (
    thread_id IN (SELECT id FROM public.ask_threads WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS ask_thread_messages_insert ON public.ask_thread_messages;
CREATE POLICY ask_thread_messages_insert ON public.ask_thread_messages
  FOR INSERT WITH CHECK (
    organization_id = ANY (get_my_org_ids())
    AND thread_id IN (SELECT id FROM public.ask_threads WHERE user_id = auth.uid())
  );
