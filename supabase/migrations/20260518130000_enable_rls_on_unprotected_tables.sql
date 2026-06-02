-- 🚨 CRITICAL SECURITY FIX — 13 public tables had Row Level Security DISABLED
-- while granting full SELECT/INSERT/UPDATE/DELETE/TRUNCATE to the `anon` and
-- `authenticated` roles. The anon key ships in the browser bundle, so any
-- visitor could read, modify, or truncate every row of these tables across
-- every organization by calling the Supabase REST API directly.
--
-- Enabling RLS is fail-closed: with no policy, RLS denies all anon/authenticated
-- access. The service-role client used by the app's API routes bypasses RLS and
-- is unaffected (same pattern as app_settings / ingestion_failures /
-- contact_submissions, which already run RLS-on with no policy).
--
-- RLS does NOT gate TRUNCATE (a table-level, not row-level, operation), so the
-- TRUNCATE grant is revoked from the client roles separately.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'atlas_order_events', 'atlas_order_records', 'atlas_part_offers',
    'atlas_part_searches', 'chat_payments', 'digital_signatures',
    'legacy_migration_rows', 'part_orders', 'part_request_events',
    'part_requests', 'part_searches', 'parts_catalog', 'vendor_results'
  ] LOOP
    -- Clean-replay tolerance: several of these tables exist in prod but were
    -- created outside the migration chain (see the matching 150000 PK
    -- migration), so they're absent on a from-scratch local replay. Harden the
    -- ones that exist; skip the rest. Full effect is unchanged in prod.
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE TRUNCATE ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;
