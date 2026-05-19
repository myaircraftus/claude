/**
 * RAG query feedback loop.
 *
 * logQueryResult records the outcome of one RAG query into rag_query_log so the
 * retrieval stack can be measured (strategy mix, chunk/tree usage, latency,
 * zero-chunk failures). It stores only a SHA-256 hash of the query text — never
 * the raw query — so the log carries no PII.
 *
 * It is strictly fire-and-forget: the whole body is wrapped in try/catch, all
 * failures are swallowed with a console.warn, and it NEVER throws. Callers
 * invoke it as `void logQueryResult({ ... })` and must not await its result for
 * correctness.
 */
import { createHash } from 'crypto'
import { createServiceSupabase } from '@/lib/supabase/server'

export async function logQueryResult(params: {
  org_id: string
  aircraft_id?: string | null
  query: string
  strategy: string
  chunk_count: number
  tree_nodes_used: number
  answer_length: number
  duration_ms: number
  /** HyDE: true when a hypothetical document was generated and embedded. */
  hyde_used?: boolean
  /** HyDE: the generated hypothetical logbook entry (truncated ≤500 chars). */
  hyde_hypothetical?: string | null
  /** Doc-type pre-filter: comma-joined doc_type values, or null when unfiltered. */
  doc_type_filter_used?: string | null
  /** Doc-type pre-filter: true when a thin filtered result was retried unfiltered. */
  doc_type_fallback_triggered?: boolean
  /** Phase-1 shadow mode: the query router's would-be RouteDecision. Observation
   *  only — retrieval behavior is unchanged. Null when ROUTER_SHADOW is off. */
  router_shadow?: object | null
}): Promise<void> {
  try {
    const queryHash = createHash('sha256').update(params.query).digest('hex')

    const supabase = createServiceSupabase()
    // `as any` on the insert: the router_shadow jsonb column is newer than the
    // generated DB types — the column exists in the database (migration
    // 20260519000000_rag_query_log_router_shadow). The row shape is otherwise
    // unchanged.
    await (supabase as any).from('rag_query_log').insert({
      org_id: params.org_id,
      aircraft_id: params.aircraft_id ?? null,
      query_hash: queryHash,
      strategy: params.strategy,
      chunk_count: params.chunk_count,
      tree_nodes_used: params.tree_nodes_used,
      answer_length: params.answer_length,
      duration_ms: params.duration_ms,
      hyde_used: params.hyde_used ?? false,
      hyde_hypothetical: params.hyde_hypothetical
        ? params.hyde_hypothetical.slice(0, 500)
        : null,
      doc_type_filter_used: params.doc_type_filter_used ?? null,
      doc_type_fallback_triggered: params.doc_type_fallback_triggered ?? false,
      router_shadow: params.router_shadow ?? null,
    })
  } catch (err) {
    // Feedback logging is best-effort — never block or fail a query on it.
    console.warn('[rag/feedback] logQueryResult failed (ignored):', err)
  }
}
