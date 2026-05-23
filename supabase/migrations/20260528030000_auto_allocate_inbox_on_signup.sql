-- Auto-allocate @myaircraft.us inbox_email on every signup.
--
-- Before this migration, the trigger only created the user_profiles
-- row — users had to manually visit /settings/inbox and click
-- "Allocate". Owners + mechanics now get their address provisioned
-- the moment auth.users gets the new row, so the in-software
-- communication ecosystem works for them on day one.
--
-- The trigger runs as SECURITY DEFINER under the supabase_auth_admin
-- role and inlines allocate_inbox_email's logic (we can't call the
-- caller-gated function from a trigger context where auth.uid() is
-- NULL).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_full_name text;
  resolved_avatar_url text;
  v_handle text;
  v_candidate text;
  v_suffix int := 0;
BEGIN
  resolved_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NULLIF(
      trim(
        concat_ws(
          ' ',
          NEW.raw_user_meta_data->>'first_name',
          NEW.raw_user_meta_data->>'last_name'
        )
      ),
      ''
    )
  );

  resolved_avatar_url := COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture'
  );

  -- 1) Derive a default handle from full_name OR email-local-part.
  v_handle := lower(
    regexp_replace(
      COALESCE(
        resolved_full_name,
        split_part(NEW.email, '@', 1),
        replace(left(NEW.id::text, 8), '-', '')
      ),
      '[^a-z0-9]+', '', 'g'
    )
  );
  IF length(v_handle) < 3 THEN
    v_handle := v_handle || replace(left(NEW.id::text, 4), '-', '');
  END IF;
  v_handle := left(v_handle, 28);

  -- 2) Insert / update user_profiles with the derived handle.
  INSERT INTO public.user_profiles (id, email, full_name, avatar_url, handle)
  VALUES (NEW.id, NEW.email, resolved_full_name, resolved_avatar_url, v_handle)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.user_profiles.full_name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.user_profiles.avatar_url),
        handle = COALESCE(public.user_profiles.handle, EXCLUDED.handle),
        updated_at = now();

  -- 3) Inline allocate_inbox_email — we can't call the function here
  -- because it requires auth.uid() which is null in trigger context.
  -- Same uniqueness logic.
  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles WHERE id = NEW.id AND inbox_email IS NOT NULL
  ) THEN
    v_candidate := v_handle || '@myaircraft.us';
    WHILE EXISTS(
      SELECT 1 FROM public.user_profiles
       WHERE lower(inbox_email) = v_candidate AND id <> NEW.id
    ) LOOP
      v_suffix := v_suffix + 1;
      v_candidate := v_handle || v_suffix::text || '@myaircraft.us';
    END LOOP;
    UPDATE public.user_profiles
       SET inbox_email = v_candidate
     WHERE id = NEW.id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never fail auth.users INSERT because of inbox provisioning. The
  -- self-service POST /api/me/inbox is the safety net.
  RAISE WARNING 'handle_new_user: inbox provisioning failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
