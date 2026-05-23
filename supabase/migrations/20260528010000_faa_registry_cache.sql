-- Optional cache for FAA Civil Aviation Registry lookups. The helper
-- at apps/web/lib/faa/registry-lookup.ts is tolerant of this table
-- being missing, but having it cuts the median lookup from ~800ms
-- (HTTP fetch + parse) to ~5ms (SELECT by primary key).
--
-- FAA registry data is public — no per-tenant scoping. Service-role
-- writes only; authenticated reads.

CREATE TABLE IF NOT EXISTS public.faa_registry_cache (
  n_number text PRIMARY KEY,
  parsed jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS faa_registry_cache_fetched_idx
  ON public.faa_registry_cache (fetched_at);

ALTER TABLE public.faa_registry_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS faa_registry_cache_authenticated_read ON public.faa_registry_cache;
CREATE POLICY faa_registry_cache_authenticated_read ON public.faa_registry_cache
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
