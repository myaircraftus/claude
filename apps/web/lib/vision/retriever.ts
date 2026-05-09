/**
 * Phase 8 Vision RAG — hybrid retriever (Sprint 8.5).
 *
 * Single entry point that combines:
 *   1. Existing text-based RAG (read-only call into /lib/rag) for
 *      a top-50 candidate set of (document_id, page_number) tuples.
 *   2. ColQwen2/ColPali summary-vector ANN over vision_embeddings,
 *      restricted to the candidate set so we don't blow ANN budget
 *      on irrelevant pages.
 *   3. Late-interaction MaxSim re-rank using each candidate's
 *      patch_vectors matrix.
 *   4. Combined score = α·text + (1−α)·vision, where α is read
 *      from VISION_TEXT_WEIGHT (default 0.6).
 *
 * Modes:
 *   'hybrid' (default) — all four steps.
 *   'text'  — only step 1, no vision involvement.
 *   'vision' — skip step 1; ANN against ALL pages in the org +
 *      MaxSim re-rank. Useful for "I want to see the visual matches
 *      regardless of whether OCR found the keyword".
 *
 * The text retriever's queryEmbedding contract is an OpenAI
 * text-embedding-3-large vector (length 1536 in production).
 * In stub mode (no OpenAI calls during tests / foundation), the
 * caller passes a deterministic hash-derived stub of the right
 * length. The vision-side stub query tokens come from
 * stubQueryVectorTokens() in this file — same hash trick keyed off
 * the query string + a token index.
 *
 * Sacred boundary: this module READS from /lib/rag/retrieval.ts but
 * never modifies it. The import below is the only touch point.
 */
import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { retrieveChunks } from '@/lib/rag/retrieval'
import type { RetrievedChunk } from '@/types'
import { searchVisionIndex, getPatchVectors } from './index-query'
import { normalizedMaxSim } from './maxsim'

export type HybridMode = 'hybrid' | 'text' | 'vision'

export interface HybridResult {
  source_document_id: string
  page_number: number
  /** Score from the text retriever (combined_score field), 0 if mode='vision'. */
  score_text: number
  /** Normalized MaxSim (0-1), 0 if mode='text'. */
  score_vision: number
  /** Weighted combination using VISION_TEXT_WEIGHT. */
  score_combined: number
  /** First ~200 chars of chunk_text from the text retriever, '' if mode='vision'. */
  snippet: string
}

export interface HybridRetrieveOptions {
  k?: number
  mode?: HybridMode
  /** Override env-var weight (test ergonomics). */
  textWeight?: number
  /**
   * Pre-computed text query embedding (1536-dim from OpenAI in prod;
   * stub-equivalent for foundation). Required for mode='hybrid'/'text';
   * ignored for mode='vision'.
   */
  queryEmbedding?: number[]
  /**
   * Pre-computed vision query token vectors. Required for
   * mode='hybrid'/'vision'; ignored for mode='text'.
   * If absent, generated via stubQueryVectorTokens.
   */
  queryVectorTokens?: number[][]
  /**
   * Pre-computed vision query summary vector (128-dim) for the ANN
   * pre-filter. If absent, generated via stubQuerySummary.
   */
  querySummaryVector?: number[]
  /**
   * Hard cap on the candidate set passed to MaxSim. Default 50 —
   * above this we burn CPU on tail matches. Tunable for benchmarks.
   */
  candidateCap?: number
}

/** Default weight for the text component of the combined score. */
const DEFAULT_TEXT_WEIGHT = 0.6

function readTextWeight(override?: number): number {
  if (typeof override === 'number') return override
  const env = process.env.VISION_TEXT_WEIGHT
  if (env) {
    const n = Number(env)
    if (Number.isFinite(n) && n >= 0 && n <= 1) return n
  }
  return DEFAULT_TEXT_WEIGHT
}

// ─── Stub query embeddings ───────────────────────────────────────────
//
// Real production: OpenAI text-embedding-3-large for the text
// queryEmbedding, ColQwen2 query head for the vision token vectors.
// These stubs let us exercise the foundation without GPU spend.

/**
 * Deterministic 128-dim summary vector from query string. Uses the
 * same sha256-projection trick as stubVectorsForPage in index-query.ts
 * so dim conventions stay identical.
 */
export function stubQuerySummary(query: string): number[] {
  const h = createHash('sha256').update(`vision-query-summary:${query}`).digest()
  const v: number[] = []
  for (let i = 0; i < 128; i++) v.push((h[i % h.length] - 128) / 128)
  return v
}

/**
 * Stub query token vectors. Produces 16 token vectors × 128-dim,
 * each seeded by query+token-index. Real ColQwen2 produces ~16-32
 * tokens depending on prompt length; 16 is the typical short-query
 * count.
 */
export function stubQueryVectorTokens(query: string, count = 16): number[][] {
  const out: number[][] = []
  for (let t = 0; t < count; t++) {
    const h = createHash('sha256').update(`vision-query-token:${query}:${t}`).digest()
    const v: number[] = []
    for (let i = 0; i < 128; i++) v.push((h[i % h.length] - 128) / 128)
    out.push(v)
  }
  return out
}

/**
 * Stub 1536-dim text query embedding (matches OpenAI
 * text-embedding-3-large dim). Foundation-only — production uses a
 * real OpenAI call and passes the result via queryEmbedding option.
 */
export function stubTextQueryEmbedding(query: string): number[] {
  const h1 = createHash('sha256').update(`vision-text-q-1:${query}`).digest()
  const h2 = createHash('sha256').update(`vision-text-q-2:${query}`).digest()
  const v: number[] = []
  while (v.length < 1536) {
    const h = v.length < 768 ? h1 : h2
    v.push((h[v.length % h.length] - 128) / 128)
  }
  return v.slice(0, 1536)
}

// ─── Hybrid retrieve ─────────────────────────────────────────────────

/**
 * Run the hybrid retrieval pipeline. Pure orchestration — all I/O
 * goes through retrieveChunks (text), searchVisionIndex (ANN) and
 * getPatchVectors (per-page MaxSim input).
 */
export async function hybridRetrieve(
  supabase: SupabaseClient,
  orgId: string,
  query: string,
  opts: HybridRetrieveOptions = {},
): Promise<HybridResult[]> {
  const k = opts.k ?? 10
  const mode = opts.mode ?? 'hybrid'
  const textWeight = readTextWeight(opts.textWeight)
  const candidateCap = opts.candidateCap ?? 50

  const queryTokens = opts.queryVectorTokens ?? stubQueryVectorTokens(query)
  const querySummary = opts.querySummaryVector ?? stubQuerySummary(query)

  // ─── Step 1: text retrieval ────────────────────────────────────────
  let textChunks: RetrievedChunk[] = []
  if (mode !== 'vision') {
    const queryEmbedding = opts.queryEmbedding ?? stubTextQueryEmbedding(query)
    textChunks = await retrieveChunks({
      organizationId: orgId,
      queryEmbedding,
      queryText: query,
      limit: candidateCap,
    })
  }

  // ─── Step 2: vision ANN ───────────────────────────────────────────
  let visionHits: Array<{ vision_page_id: string; summary_score: number; model_used: string }> = []
  if (mode !== 'text') {
    const hits = await searchVisionIndex(supabase, {
      organization_id: orgId,
      query_vector: querySummary,
      k: candidateCap,
    })
    visionHits = hits.map((h) => ({
      vision_page_id: h.vision_page_id,
      summary_score: h.summary_score,
      model_used: h.model_used,
    }))
  }

  // ─── Step 3: assemble candidate set ────────────────────────────────
  // Identity = (source_document_id, page_number). The text retriever
  // gives us document_id + page_number directly; the vision side gives
  // a vision_page_id which we resolve via a single lookup table fetch.
  type Candidate = {
    source_document_id: string
    page_number: number
    vision_page_id?: string
    text_score: number
    vision_summary_score: number
    snippet: string
    model_used?: string
  }
  const byKey = new Map<string, Candidate>()
  const keyOf = (doc: string, pg: number) => `${doc}:${pg}`

  for (const c of textChunks) {
    const k = keyOf(c.document_id, c.page_number)
    byKey.set(k, {
      source_document_id: c.document_id,
      page_number: c.page_number,
      text_score: c.combined_score ?? 0,
      vision_summary_score: 0,
      snippet: (c.chunk_text ?? '').slice(0, 200),
    })
  }

  // For vision hits, we need source_document_id + page_number from
  // vision_pages. Avoid an N+1 by batching the lookup.
  if (visionHits.length > 0) {
    const ids = visionHits.map((h) => h.vision_page_id)
    const { data: pageRows, error } = await supabase
      .from('vision_pages')
      .select('id, source_document_id, page_number')
      .eq('organization_id', orgId)
      .in('id', ids)
    if (error) throw new Error(`hybridRetrieve: vision_pages lookup: ${error.message}`)
    const byVisionId = new Map<string, { source_document_id: string; page_number: number }>(
      ((pageRows ?? []) as Array<{ id: string; source_document_id: string; page_number: number }>)
        .map((r) => [r.id, { source_document_id: r.source_document_id, page_number: r.page_number }]),
    )

    for (const v of visionHits) {
      const meta = byVisionId.get(v.vision_page_id)
      if (!meta) continue
      const k = keyOf(meta.source_document_id, meta.page_number)
      const existing = byKey.get(k)
      if (existing) {
        existing.vision_page_id = v.vision_page_id
        existing.vision_summary_score = v.summary_score
        existing.model_used = v.model_used
      } else {
        byKey.set(k, {
          source_document_id: meta.source_document_id,
          page_number: meta.page_number,
          vision_page_id: v.vision_page_id,
          text_score: 0,
          vision_summary_score: v.summary_score,
          snippet: '',
          model_used: v.model_used,
        })
      }
    }
  }

  // ─── Step 4: MaxSim re-rank for candidates that have a vision page ─
  const candidates = Array.from(byKey.values())
  const visionPageIds = candidates.map((c) => c.vision_page_id).filter((x): x is string => !!x)
  const patchByVisionId = new Map<string, number[][]>()
  // Sequential to keep the supabase client uncrowded. ~50 round-trips
  // worst case at candidateCap default; tunable via candidateCap.
  for (const vpId of visionPageIds) {
    const r = await getPatchVectors(supabase, vpId, orgId)
    if (r) patchByVisionId.set(vpId, r.patches)
  }

  // ─── Step 5: combined scoring ──────────────────────────────────────
  const visionWeight = 1 - textWeight

  const results: HybridResult[] = candidates.map((c) => {
    let visionScore = 0
    if (c.vision_page_id) {
      const patches = patchByVisionId.get(c.vision_page_id)
      if (patches && patches.length > 0) {
        // normalizedMaxSim returns ~ -1..1; clamp to [0, 1] for scoring.
        const raw = normalizedMaxSim(queryTokens, patches)
        visionScore = Math.max(0, Math.min(1, raw))
      } else {
        // No patches available (page hasn't been embedded yet, or the
        // embeddings row exists with patch_count=0) — fall back to the
        // ANN summary score so the candidate isn't silently scored 0.
        visionScore = c.vision_summary_score
      }
    }

    const combined =
      mode === 'text'   ? c.text_score :
      mode === 'vision' ? visionScore :
      textWeight * c.text_score + visionWeight * visionScore

    return {
      source_document_id: c.source_document_id,
      page_number: c.page_number,
      score_text: c.text_score,
      score_vision: visionScore,
      score_combined: combined,
      snippet: c.snippet,
    }
  })

  results.sort((a, b) => b.score_combined - a.score_combined)
  return results.slice(0, k)
}
