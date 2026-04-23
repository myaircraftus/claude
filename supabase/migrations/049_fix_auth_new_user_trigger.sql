-- Hardens the auth.users -> public.user_profiles trigger used by email/password
-- and OAuth signups on the new Supabase project.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_full_name text;
  resolved_avatar_url text;
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

  INSERT INTO public.user_profiles (id, email, full_name, avatar_url)
  VALUES (NEW.id, NEW.email, resolved_full_name, resolved_avatar_url)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.user_profiles.full_name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.user_profiles.avatar_url),
        updated_at = now();

  RETURN NEW;
END;
$$;
