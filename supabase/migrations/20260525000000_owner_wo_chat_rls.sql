-- Single-source-of-truth WO chat — owner ↔ mechanic.
--
-- Until now, the per-WO chat (conversation_threads + thread_messages) was
-- shop-only via the existing RLS:
--   organization_id = ANY (get_my_org_ids())
-- The owner side lived in a separate portal_threads/portal_messages table
-- not tied to any specific work order. Two physical threads, no shared
-- conversation — the bug Andy reported.
--
-- This migration makes conversation_threads + thread_messages the single
-- chat surface and adds owner-side RLS so the aircraft owner can read +
-- post on threads attached to their own work orders. Storage bucket
-- work-order-chat gets a matching read policy so owners can fetch
-- attachments.
--
-- It also drops the two columns my earlier migration
-- (20260523_unified_launcher_agent_fleet.sql) added speculatively that
-- never wired up:
--   portal_threads.work_order_id        — replaced by work_orders.thread_id
--   portal_messages.status_pill jsonb   — moves into thread_messages.metadata

-- 1. Helper: is this user the portal-customer-owner of this aircraft?
--    SECURITY DEFINER so it can traverse the customers + aircraft tables
--    even when RLS would otherwise hide them from the calling user.
CREATE OR REPLACE FUNCTION public.is_aircraft_owner(
  p_aircraft_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.aircraft a
      JOIN public.customers c ON c.id = a.owner_customer_id
     WHERE a.id = p_aircraft_id
       AND c.portal_user_id = p_user_id
       AND c.portal_access = true
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_aircraft_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_aircraft_owner(uuid, uuid) TO authenticated;

-- 2. Same shape but keyed on a thread id — used in the RLS policy below.
CREATE OR REPLACE FUNCTION public.is_thread_aircraft_owner(
  p_thread_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.work_orders wo
      JOIN public.aircraft a ON a.id = wo.aircraft_id
      JOIN public.customers c ON c.id = a.owner_customer_id
     WHERE wo.thread_id = p_thread_id
       AND c.portal_user_id = p_user_id
       AND c.portal_access = true
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_thread_aircraft_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_thread_aircraft_owner(uuid, uuid) TO authenticated;

-- 3. Owner SELECT + INSERT on conversation_threads. Existing shop policies
--    keep working (PostgreSQL OR-merges multiple policies on the same
--    command); these add the owner branch.
DROP POLICY IF EXISTS conversation_threads_owner_select ON public.conversation_threads;
CREATE POLICY conversation_threads_owner_select ON public.conversation_threads
  FOR SELECT
  USING (public.is_thread_aircraft_owner(id, auth.uid()));

-- Owners do NOT insert conversation_threads directly — the API does that
-- on first message via service role. INSERT policy stays shop-only.

-- 4. Owner SELECT + INSERT on thread_messages.
DROP POLICY IF EXISTS thread_messages_owner_select ON public.thread_messages;
CREATE POLICY thread_messages_owner_select ON public.thread_messages
  FOR SELECT
  USING (public.is_thread_aircraft_owner(thread_id, auth.uid()));

DROP POLICY IF EXISTS thread_messages_owner_insert ON public.thread_messages;
CREATE POLICY thread_messages_owner_insert ON public.thread_messages
  FOR INSERT
  WITH CHECK (public.is_thread_aircraft_owner(thread_id, auth.uid()));

-- 5. Storage policy on work-order-chat bucket. Storage path is
--    "<orgId>/<woId>/<fileId>.<ext>" — owner needs read access when the
--    middle segment is a WO whose aircraft they own.
DROP POLICY IF EXISTS work_order_chat_owner_read ON storage.objects;
CREATE POLICY work_order_chat_owner_read ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'work-order-chat'
    AND EXISTS (
      SELECT 1
        FROM public.work_orders wo
        JOIN public.aircraft a ON a.id = wo.aircraft_id
        JOIN public.customers c ON c.id = a.owner_customer_id
       WHERE wo.id::text = split_part(name, '/', 2)
         AND c.portal_user_id = auth.uid()
         AND c.portal_access = true
    )
  );

-- Owner can INSERT (upload) into the same paths so they can attach photos
-- of receipts / damage / video walkthroughs to their messages.
DROP POLICY IF EXISTS work_order_chat_owner_write ON storage.objects;
CREATE POLICY work_order_chat_owner_write ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'work-order-chat'
    AND EXISTS (
      SELECT 1
        FROM public.work_orders wo
        JOIN public.aircraft a ON a.id = wo.aircraft_id
        JOIN public.customers c ON c.id = a.owner_customer_id
       WHERE wo.id::text = split_part(name, '/', 2)
         AND c.portal_user_id = auth.uid()
         AND c.portal_access = true
    )
  );

-- 6. Cleanup: drop the never-wired columns from my earlier migration.
--    The owner ↔ shop chat now uses thread_messages (with metadata jsonb
--    already in place for any structured side-data we want later, e.g.
--    status pills). portal_threads + portal_messages remain for the
--    legacy /customers customer-comms surface; only the unused columns
--    go away.
ALTER TABLE public.portal_threads  DROP COLUMN IF EXISTS work_order_id;
ALTER TABLE public.portal_messages DROP COLUMN IF EXISTS status_pill;

-- Sanity index — make the owner RLS function fast. The aircraft +
-- customers tables already have PKs; the new query path filters on
-- aircraft.owner_customer_id which already has an index from the
-- aircraft FK.
