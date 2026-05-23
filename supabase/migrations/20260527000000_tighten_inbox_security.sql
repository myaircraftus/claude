-- Security follow-up to 20260526_unified_inbox_foundation.sql.
-- Two findings from the parallel security review of 2026-05-23:

-- Fix HIGH: inbox_messages_own_select previously let any org member read
-- every OTHER member's personal @myaircraft.us inbox via PostgREST. Each
-- user's inbox is per-user (not a shared org mailbox), so this is a
-- privacy boundary break. Restrict SELECT to user_id = auth.uid() only.
DROP POLICY IF EXISTS inbox_messages_own_select ON public.inbox_messages;
CREATE POLICY inbox_messages_own_select ON public.inbox_messages
  FOR SELECT USING (user_id = auth.uid());

-- Fix MEDIUM: allocate_inbox_email was SECURITY DEFINER + granted to
-- authenticated with no caller check, so any logged-in user could
-- mutate any other user's inbox_email and enumerate handles. Gate to
-- (self) OR (platform admin).
CREATE OR REPLACE FUNCTION public.allocate_inbox_email(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_handle text;
  v_candidate text;
  v_suffix int := 0;
  v_caller uuid := auth.uid();
  v_is_admin boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'allocate_inbox_email: unauthenticated';
  END IF;
  IF p_user_id <> v_caller THEN
    SELECT COALESCE(is_platform_admin, false) INTO v_is_admin
      FROM public.user_profiles WHERE id = v_caller;
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'allocate_inbox_email: forbidden (non-self, non-admin)';
    END IF;
  END IF;

  SELECT handle INTO v_handle FROM public.user_profiles WHERE id = p_user_id;
  IF v_handle IS NULL OR length(v_handle) = 0 THEN
    v_handle := replace(left(p_user_id::text, 8), '-', '');
  END IF;
  v_handle := lower(regexp_replace(v_handle, '[^a-z0-9.-]', '', 'g'));
  IF length(v_handle) < 3 THEN
    v_handle := v_handle || replace(left(p_user_id::text, 4), '-', '');
  END IF;
  v_candidate := v_handle || '@myaircraft.us';
  WHILE EXISTS(
    SELECT 1 FROM public.user_profiles
     WHERE lower(inbox_email) = v_candidate AND id <> p_user_id
  ) LOOP
    v_suffix := v_suffix + 1;
    v_candidate := v_handle || v_suffix::text || '@myaircraft.us';
  END LOOP;
  UPDATE public.user_profiles SET inbox_email = v_candidate WHERE id = p_user_id;
  RETURN v_candidate;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.allocate_inbox_email(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_inbox_email(uuid) TO authenticated;
