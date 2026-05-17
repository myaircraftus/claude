-- Extend the intelligence_cache.module CHECK constraint to cover the 6 new
-- Aircraft Intelligence modules (squawk-patterns, maintenance-forecast,
-- market-value, lender-summary, component-search, time-comparison) alongside
-- the original 4.

ALTER TABLE intelligence_cache DROP CONSTRAINT IF EXISTS intelligence_cache_module_check;

ALTER TABLE intelligence_cache
  ADD CONSTRAINT intelligence_cache_module_check CHECK (module IN (
    'history',
    'prebuy',
    'ad-traceability',
    'missing-records',
    'squawk-patterns',
    'maintenance-forecast',
    'market-value',
    'lender-summary',
    'component-search',
    'time-comparison'
  ));
