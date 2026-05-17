/**
 * Query router — decides which RAG index(es) to consult per query.
 *
 * The existing vector search ALWAYS runs (it is the default and the
 * fallback). This router decides whether to ALSO consult:
 *   - the BM25 keyword index  (lib/rag/bm25-index.ts)   — exact strings
 *   - the PageIndex tree      (page_tree_nodes table)   — location reasoning
 *
 * Strategy → indexes:
 *   vector      → vector only
 *   bm25        → vector + BM25
 *   tree        → vector + tree
 *   hybrid_vb   → vector + BM25
 *   hybrid_all  → vector + BM25 + tree
 */

export type QueryStrategy = 'vector' | 'bm25' | 'tree' | 'hybrid_vb' | 'hybrid_all'

// AD number — "AD 2020-26-16", "AD2020-26-16", "ad 2020-26-16".
const AD_NUMBER = /\bad\s*\d{4}-\d{1,2}-\d{1,2}\b/i
// Part number — "P/N ABC-123", "PN: 0550021-7", "part number 12345A".
const PART_NUMBER = /\b(?:p\/?n|part\s*(?:number|no\.?|#))\s*:?\s*[a-z0-9][a-z0-9-]{2,}/i
// Serial number — "S/N 1234", "serial no 5678A".
const SERIAL_NUMBER = /\b(?:s\/?n|serial\s*(?:number|no\.?|#)?)\s*:?\s*[a-z0-9][a-z0-9-]{2,}/i
// Explicit dates — 2023-04-15, 04/15/2023, "April 2019".
const DATE_LIKE =
  /\b(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4})\b/i

// Whole-history / prebuy questions — consult every index.
const HYBRID_ALL =
  /\b(history|prebuy|pre-buy|pre buy|all entries|all logbook|summary of|complete record|full record)\b/i
// Compliance-status questions — tree reasoning answers "is it current".
const COMPLIANCE =
  /\b(annual|100[\s-]?hour|is current|currently compliant|compliant|overdue|airworthy|out of compliance)\b/i
// Structural / location questions — tree reasoning answers "where".
const TREE_SIGNALS =
  /\b(where|which section|which chapter|chapter\s*\d|\bsection\b|when was the last|last time|show all|history of|is current on|missing|not been done|ever been)\b/i

/**
 * Keyword-only routing pass. Pure + deterministic + fast.
 *
 * Returns a concrete strategy when SOME keyword pattern (or doc-type
 * context) matches, or `null` when nothing matches — letting the caller
 * decide what to do with an un-routed query (fall back to 'vector', or
 * hand off to the embedding classifier).
 */
export function keywordRoute(
  query: string,
  context?: { docTypes?: string[] },
): QueryStrategy | null {
  const q = (query ?? '').toLowerCase().trim()
  if (!q) return null

  // AD numbers need an exact keyword match AND location reasoning.
  if (AD_NUMBER.test(q)) return 'hybrid_all'

  // Prebuy / "summarize everything" — pull every index.
  if (HYBRID_ALL.test(q)) return 'hybrid_all'

  // Compliance / prebuy document context also warrants the full hybrid.
  if (
    context?.docTypes?.some(
      (d) => d === 'form_337' || d === 'stc' || d === 'airworthiness_directive',
    )
  ) {
    return 'hybrid_all'
  }

  // Compliance-status + structural/location questions → tree + vector.
  if (COMPLIANCE.test(q) || TREE_SIGNALS.test(q)) return 'tree'

  // Exact-string lookups (part #, serial #, dates) → BM25 + vector.
  if (PART_NUMBER.test(q) || SERIAL_NUMBER.test(q) || DATE_LIKE.test(q)) return 'bm25'

  // Nothing matched — let the caller decide.
  return null
}

/**
 * Pick the retrieval strategy for a query. Pure + deterministic + sync.
 *
 * Behaviour-identical to the original keyword router: an un-matched query
 * falls back to plain 'vector' search.
 */
export function routeQuery(query: string, context?: { docTypes?: string[] }): QueryStrategy {
  return keywordRoute(query, context) ?? 'vector'
}

/**
 * Async router — keyword pre-check, then an embedding-based intent
 * classifier as the fallback.
 *
 * The keyword pass runs first because it is free and high-precision: a
 * non-null result is returned immediately. Only when NO keyword pattern
 * matches do we pay for an embedding round-trip. A low-confidence
 * classification (below ROUTER_CONFIDENCE_THRESHOLD) degrades to plain
 * 'vector' search rather than guessing a specialised index.
 */
export async function routeQueryAsync(
  query: string,
  context?: { docTypes?: string[] },
): Promise<QueryStrategy> {
  const keyword = keywordRoute(query, context)
  if (keyword) return keyword

  // Imported lazily so the sync `routeQuery` path stays dependency-free.
  const { classifyQueryIntent, INTENT_STRATEGY, ROUTER_CONFIDENCE_THRESHOLD } = await import(
    './router-classifier'
  )

  const { intent, confidence } = await classifyQueryIntent(query)
  if (confidence < ROUTER_CONFIDENCE_THRESHOLD) return 'vector'
  return INTENT_STRATEGY[intent]
}

/** Expand a strategy into the concrete set of indexes to query. */
export function indexesForStrategy(strategy: QueryStrategy): {
  vector: boolean
  bm25: boolean
  tree: boolean
} {
  return {
    vector: true, // always — the default + fallback
    bm25: strategy === 'bm25' || strategy === 'hybrid_vb' || strategy === 'hybrid_all',
    tree: strategy === 'tree' || strategy === 'hybrid_all',
  }
}
