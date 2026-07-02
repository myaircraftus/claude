-- Fix: inbox addresses were mangled for camel-case handles.
--
-- allocate_inbox_email sanitized the handle with
--   lower(regexp_replace(v_handle, '[^a-z0-9.-]', '', 'g'))
-- i.e. it STRIPPED disallowed characters BEFORE lowercasing — so every
-- uppercase letter in the handle was deleted instead of lowercased
-- ("JeetAdeshara" -> "eetdeshara@myaircraft.us"). Lowercase first, then
-- strip.
--
-- Also repairs existing rows whose stored address no longer matches the
-- correctly-sanitized handle (suffixing on collision, same rule as the
-- allocator).

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
  -- Lowercase FIRST so uppercase letters survive as their lowercase forms
  -- instead of being stripped by the character whitelist.
  v_handle := regexp_replace(lower(v_handle), '[^a-z0-9.-]', '', 'g');
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

-- ── Same bug in the signup trigger ─────────────────────────────────────
-- handle_new_user() derived the default handle with the identical
-- strip-before-lower sanitization, so the mangled value was baked into
-- user_profiles.handle itself ("Jeet Adeshara" -> handle "eetdeshara",
-- "Mike Mechanic" -> "ikeechanic"). Redefine with lowercase-first.
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
    NEW.raw_user_meta_data->>'name'
  );
  resolved_avatar_url := COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture'
  );

  -- 1) Derive a default handle from full_name OR email-local-part.
  --    Lowercase FIRST so capitals survive instead of being stripped.
  v_handle := regexp_replace(
    lower(
      COALESCE(
        resolved_full_name,
        split_part(NEW.email, '@', 1),
        ''
      )
    ),
    '[^a-z0-9]+', '', 'g'
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

-- ── Repair mangled HANDLES ──────────────────────────────────────────────
-- Only touches handles that exactly match the buggy derivation of the
-- user's own full_name/email (i.e. provably auto-generated + mangled) —
-- user-chosen handles are left alone. Uniqueness is preserved by
-- suffixing, mirroring the generator.
DO $$
DECLARE
  r record;
  v_buggy text;
  v_fixed text;
  v_candidate text;
  v_suffix int;
BEGIN
  FOR r IN
    SELECT p.id, p.handle, p.full_name, p.email
      FROM public.user_profiles p
     WHERE p.handle IS NOT NULL
  LOOP
    -- What the OLD buggy generator would have produced:
    v_buggy := left(lower(regexp_replace(COALESCE(r.full_name, split_part(r.email, '@', 1), ''), '[^a-z0-9]+', '', 'g')), 28);
    -- What the FIXED generator produces:
    v_fixed := left(regexp_replace(lower(COALESCE(r.full_name, split_part(r.email, '@', 1), '')), '[^a-z0-9]+', '', 'g'), 28);
    CONTINUE WHEN v_buggy = v_fixed;              -- name had no capitals — nothing was lost
    CONTINUE WHEN r.handle IS DISTINCT FROM v_buggy; -- user-chosen handle — leave it
    CONTINUE WHEN length(v_fixed) < 3;

    v_suffix := 0;
    v_candidate := v_fixed;
    WHILE EXISTS(
      SELECT 1 FROM public.user_profiles
       WHERE handle = v_candidate AND id <> r.id
    ) LOOP
      v_suffix := v_suffix + 1;
      v_candidate := v_fixed || v_suffix::text;
    END LOOP;
    UPDATE public.user_profiles SET handle = v_candidate WHERE id = r.id;
  END LOOP;
END;
$$;

-- ── Data repair ────────────────────────────────────────────────────────
-- Re-derive the address for every profile whose stored inbox_email base
-- (local part minus any collision suffix digits) doesn't match the
-- correctly-sanitized handle. Runs outside auth context, so the repair is
-- inlined rather than calling the (caller-gated) function.
DO $$
DECLARE
  r record;
  v_base text;
  v_candidate text;
  v_suffix int;
BEGIN
  FOR r IN
    SELECT id, handle, inbox_email
      FROM public.user_profiles
     WHERE handle IS NOT NULL
       AND length(handle) > 0
       AND inbox_email IS NOT NULL
  LOOP
    v_base := regexp_replace(lower(r.handle), '[^a-z0-9.-]', '', 'g');
    IF length(v_base) < 3 THEN
      v_base := v_base || replace(left(r.id::text, 4), '-', '');
    END IF;
    -- Already correct (allowing for a collision suffix)? Skip.
    CONTINUE WHEN regexp_replace(split_part(lower(r.inbox_email), '@', 1), '[0-9]+$', '') = v_base;

    v_suffix := 0;
    v_candidate := v_base || '@myaircraft.us';
    WHILE EXISTS(
      SELECT 1 FROM public.user_profiles
       WHERE lower(inbox_email) = v_candidate AND id <> r.id
    ) LOOP
      v_suffix := v_suffix + 1;
      v_candidate := v_base || v_suffix::text || '@myaircraft.us';
    END LOOP;
    UPDATE public.user_profiles SET inbox_email = v_candidate WHERE id = r.id;
  END LOOP;
END;
$$;
