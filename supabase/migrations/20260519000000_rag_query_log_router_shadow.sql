-- Phase 1 (shadow mode) — wiring the query router into /api/query.
--
-- /api/query computes the router's would-be retrieval strategy and records it
-- in this column WITHOUT changing retrieval behavior (the four-retriever
-- hybrid pass still runs). This lets the routing be measured on real traffic
-- before any active routing is enabled.
--
-- Additive + nullable: no backfill, no behavior change, instantly reversible.

ALTER TABLE rag_query_log ADD COLUMN IF NOT EXISTS router_shadow jsonb;

COMMENT ON COLUMN rag_query_log.router_shadow IS
  'Shadow-mode query-router decision: { strategy, source, intent?, confidence?, failOpen? }. Observation only — retrieval behavior is unchanged. See lib/rag/query-router.ts routeQueryVerbose.';
