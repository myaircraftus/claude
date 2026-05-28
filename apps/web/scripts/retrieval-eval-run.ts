/**
 * retrieval-eval-run.ts
 *
 * Phase 2: end-to-end retrieval + generation eval against the direct-chunking
 * doc(s) found by retrieval-eval-discover.ts. Mirrors what /api/query does
 * but skips the auth + DB-write tail so it's runnable from the CLI.
 *
 * Per question:
 *   parseStructuredQuery → HyDE → embed real + hyde → vector retrieve →
 *   BM25 (reference index, org-scoped) → merge with /api/query weights →
 *   Cohere rerank (no-op locally) → generateAnswer → score.
 *
 * Score: retrieval recall (target chunk in top-K) + answer-correctness
 * (expected string present, lowercased) + citation correctness (target chunk
 * in answer's citations). Each is a binary signal; aggregate is the recall %.
 *
 * Cost: roughly 1 embed + 1 HyDE + 1 gpt-4o answer per question
 *       (Cohere skipped — no key locally). ~$0.05 per question.
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseStructuredQuery, inferRelevantDocTypes } from '../lib/rag/query-parser'
import { generateHypotheticalDocument } from '../lib/rag/hyde'
import { generateEmbeddings } from '../lib/openai/embeddings'
import { retrieveChunks } from '../lib/rag/retrieval'
import { searchBm25, searchReferenceBm25 } from '../lib/rag/bm25-index'
import { rerankChunks } from '../lib/rag/rerank'
import { generateAnswer } from '../lib/rag/generation'
import type { DocType, RetrievedChunk } from '../types'

config({ path: resolve(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE env')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

// Cases are loaded from retrieval-eval-cases.json so adding/removing tests
// is a JSON edit, not a code edit. Default file in the same dir; override with
// EVAL_CASES env var.
const CASES_PATH = resolve(
  process.cwd(),
  process.env.EVAL_CASES || 'scripts/retrieval-eval-cases.json',
)

interface TestCase {
  id: string
  category: string
  question: string
  expected_substrings?: string[]
  /** Optional — if provided, retrieval recall is scored by whether one of
   *  these chunks appears in the top-K. If absent, retrieval recall is
   *  skipped (e.g. for off-topic / negative cases where no target chunk). */
  target_chunk_ids?: string[]
  /** For negative / off-topic cases. When true, the case passes if the system
   *  honestly declined (confidence === 'insufficient_evidence' OR answer
   *  matches a refusal pattern from expected_substrings). */
  expect_insufficient?: boolean
  /** For aggregation cases where any of several phrasings is OK. The case
   *  passes if at least one group fully matches (all substrings in the group
   *  appear in the answer). Used in addition to expected_substrings. */
  expect_one_of_substrings_groups?: string[][]
  notes?: string
}

interface CaseFile {
  target_doc: string
  target_aircraft: string
  cases: TestCase[]
}

const rawCases = JSON.parse(readFileSync(CASES_PATH, 'utf8')) as CaseFile
const TARGET_DOC = rawCases.target_doc
const TARGET_AIRCRAFT = rawCases.target_aircraft

// Cases loaded from JSON above — see scripts/retrieval-eval-cases.json
const CASES: TestCase[] = rawCases.cases

interface CaseResult {
  case_id: string
  category: string
  question: string
  /** null when the case doesn't have target_chunk_ids (e.g. negative cases). */
  retrieval_recall: boolean | null
  retrieval_rank: number | null
  /** null when there are no target_chunk_ids to check citations against. */
  citation_correct: boolean | null
  answer_contains_expected: boolean
  expected_substrings: string[]
  matched_substrings: string[]
  retrieved_chunk_ids: string[]
  retrieved_chunk_count: number
  cited_chunk_ids: string[]
  answer_confidence: string
  answer_confidence_score: number
  answer_excerpt: string
  hyde_used: boolean
  strategies: string[]
  latency_ms: number
  pass: boolean
  fail_reasons: string[]
}

async function getOrgIdForDoc(docId: string): Promise<string | null> {
  const { data } = await supabase
    .from('canonical_document_chunks')
    .select('organization_id')
    .eq('document_id', docId)
    .limit(1)
    .maybeSingle()
  return (data?.organization_id as string | null) ?? null
}

interface MergedSlot {
  chunk: RetrievedChunk | null
  vec: number
  bm: number
  sectionHint?: string
}

/**
 * Page expansion — when a direct-chunking chunk lands in the candidate pool,
 * also fetch sibling chunks from the same (document_id, page_number). The
 * vision model emits multiple semantic chunks per page (entry / signoff /
 * parts_line) and answers often require evidence from MORE THAN ONE chunk on
 * the page (e.g. entry has the date+work, signoff has the mechanic). Without
 * expansion, retrieval picks the best-scoring chunk on the page and drops the
 * siblings — losing the data needed to answer.
 *
 * Siblings are added at a baseline score so they're in the rerank pool but
 * don't displace the original top hits. Cohere reranker then re-orders the
 * full set by true query relevance.
 */
async function expandWithPageSiblings(
  chunks: RetrievedChunk[],
  organizationId: string,
): Promise<RetrievedChunk[]> {
  const directChunks = chunks.filter(
    (c) => (c.metadata_json as { source?: unknown } | null)?.source === 'direct_chunking',
  )
  if (directChunks.length === 0) return chunks

  // Build (doc, page) keys already represented; sibling fetch will skip these.
  const pageKeys = new Set<string>()
  const existingIds = new Set<string>()
  for (const c of chunks) existingIds.add(c.chunk_id)
  for (const c of directChunks) {
    if (c.document_id && c.page_number != null) {
      pageKeys.add(`${c.document_id}:${c.page_number}`)
    }
  }
  if (pageKeys.size === 0) return chunks

  const docIds = [...new Set(directChunks.map((c) => c.document_id))]
  const pageNums = [
    ...new Set(directChunks.map((c) => c.page_number).filter((p): p is number => p != null)),
  ]

  const { data: rows } = await supabase
    .from('canonical_document_chunks')
    .select(
      'id, document_id, aircraft_id, page_number, page_number_end, section_title, chunk_text, context_text, metadata_json, documents:document_id!inner(title, doc_type)',
    )
    .eq('organization_id', organizationId)
    .in('document_id', docIds)
    .in('page_number', pageNums)
    .eq('metadata_json->>source', 'direct_chunking')

  // Use the parent's score as the sibling baseline so siblings ride into the
  // rerank pool at a similar rank — Cohere will then judge true relevance.
  const parentScoreByPage = new Map<string, number>()
  for (const c of directChunks) {
    const k = `${c.document_id}:${c.page_number}`
    const prev = parentScoreByPage.get(k) ?? 0
    if ((c.combined_score ?? 0) > prev) parentScoreByPage.set(k, c.combined_score ?? 0)
  }

  const siblings: RetrievedChunk[] = []
  for (const row of (rows ?? []) as Array<Record<string, any>>) {
    const id = row.id as string
    if (existingIds.has(id)) continue
    const key = `${row.document_id}:${row.page_number}`
    if (!pageKeys.has(key)) continue
    const doc = Array.isArray(row.documents) ? row.documents[0] : row.documents
    const baseScore = parentScoreByPage.get(key) ?? 0
    siblings.push({
      chunk_id: id,
      document_id: row.document_id as string,
      document_title: doc?.title ?? 'Document',
      doc_type: (doc?.doc_type ?? 'miscellaneous') as DocType,
      aircraft_id: (row.aircraft_id as string | null) ?? undefined,
      page_number: typeof row.page_number === 'number' ? row.page_number : 0,
      page_number_end: (row.page_number_end as number | null) ?? undefined,
      section_title: (row.section_title as string | null) ?? undefined,
      chunk_text: (row.chunk_text as string) ?? '',
      context_text:
        typeof row.context_text === 'string' && row.context_text.length > 0
          ? (row.context_text as string)
          : undefined,
      metadata_json: (row.metadata_json as Record<string, unknown>) ?? {},
      vector_score: 0,
      keyword_score: 0,
      // 0.95× of the parent's score — close enough to be in the rerank pool
      // but slightly lower so retrievals stay above expansions when there's
      // no clear cross-chunk benefit (Cohere can re-elevate if it matters).
      combined_score: baseScore * 0.95,
    })
  }

  if (siblings.length === 0) return chunks
  return [...chunks, ...siblings]
}

async function hydrateMissing(
  ids: string[],
  organizationId: string,
  slots: Map<string, MergedSlot>,
): Promise<void> {
  if (ids.length === 0) return
  for (const table of ['canonical_document_chunks', 'document_chunks'] as const) {
    const stillMissing = ids.filter((id) => !slots.get(id)?.chunk)
    if (stillMissing.length === 0) return
    // canonical_document_chunks has context_text (Wave 2). document_chunks
    // does not (it's the raw layer). Conditionally include the column.
    const select =
      table === 'canonical_document_chunks'
        ? 'id, document_id, aircraft_id, page_number, page_number_end, section_title, chunk_text, context_text, metadata_json, documents:document_id(title, doc_type)'
        : 'id, document_id, aircraft_id, page_number, page_number_end, section_title, chunk_text, metadata_json, documents:document_id(title, doc_type)'
    const { data: rows } = await supabase
      .from(table)
      .select(select)
      .in('id', stillMissing)
      .eq('organization_id', organizationId)
    for (const row of (rows ?? []) as Array<Record<string, any>>) {
      const slot = slots.get(row.id as string)
      if (!slot || slot.chunk) continue
      const doc = Array.isArray(row.documents) ? row.documents[0] : row.documents
      slot.chunk = {
        chunk_id: row.id as string,
        document_id: row.document_id as string,
        document_title: doc?.title ?? 'Document',
        doc_type: (doc?.doc_type ?? 'miscellaneous') as DocType,
        aircraft_id: (row.aircraft_id as string | null) ?? undefined,
        page_number: typeof row.page_number === 'number' ? row.page_number : 0,
        page_number_end: (row.page_number_end as number | null) ?? undefined,
        section_title: slot.sectionHint ?? (row.section_title as string | null) ?? undefined,
        chunk_text: (row.chunk_text as string) ?? '',
        context_text:
          typeof row.context_text === 'string' && row.context_text.length > 0
            ? (row.context_text as string)
            : undefined,
        metadata_json: (row.metadata_json as Record<string, unknown>) ?? {},
        vector_score: 0,
        keyword_score: 0,
        combined_score: 0,
      }
    }
  }
}

/** Final pass: ensure every chunk going to generation has context_text. The
 *  RPC may not return it, fallback paths may have skipped it. One batched
 *  SELECT to fill in any missing values. */
async function ensureContextText(chunks: RetrievedChunk[]): Promise<RetrievedChunk[]> {
  const needsCtx = chunks.filter((c) => c.context_text === undefined).map((c) => c.chunk_id)
  if (needsCtx.length === 0) return chunks
  const { data: rows } = await supabase
    .from('canonical_document_chunks')
    .select('id, context_text')
    .in('id', needsCtx)
  const byId = new Map<string, string>()
  for (const row of (rows ?? []) as Array<{ id: string; context_text: string | null }>) {
    if (row.context_text) byId.set(row.id, row.context_text)
  }
  return chunks.map((c) =>
    c.context_text === undefined && byId.has(c.chunk_id)
      ? { ...c, context_text: byId.get(c.chunk_id) }
      : c,
  )
}

async function runOneCase(
  testCase: TestCase,
  organizationId: string,
): Promise<CaseResult> {
  const t0 = Date.now()
  const strategies: string[] = []

  // 1. Parse query
  const parsedQuery = await parseStructuredQuery({
    organizationId,
    aircraftId: TARGET_AIRCRAFT,
    docTypeFilter: undefined,
    queryText: testCase.question,
  })
  const cleanedQuery = parsedQuery.cleanedQuery || testCase.question

  // 2. HyDE
  const hypothetical = await generateHypotheticalDocument(cleanedQuery, 'owner')
  const hydeUsed = hypothetical.trim() !== cleanedQuery.trim()

  // 3. Embed
  const [realEmb] = await generateEmbeddings([{ id: 'q', text: cleanedQuery }])
  let vectorEmb = realEmb.embedding
  if (hydeUsed) {
    try {
      const [hydeEmb] = await generateEmbeddings([{ id: 'h', text: hypothetical }])
      vectorEmb = hydeEmb.embedding
    } catch {
      vectorEmb = realEmb.embedding
    }
  }

  // 4a. Vector retrieve (aircraft-scoped — matches live owner flow)
  const vectorChunks = await retrieveChunks({
    organizationId,
    aircraftId: TARGET_AIRCRAFT,
    queryEmbedding: vectorEmb,
    queryText: cleanedQuery,
    docTypeFilter: undefined,
    limit: 20,
    parsedQuery,
  })
  if (vectorChunks.length > 0) strategies.push('vector')

  // 4b. BM25 — aircraft index + org-wide reference index
  const [acHits, refHits] = await Promise.all([
    searchBm25(TARGET_AIRCRAFT, cleanedQuery, 15).catch(() => []),
    searchReferenceBm25(organizationId, cleanedQuery, 15).catch(() => []),
  ])
  const byChunk = new Map<string, { chunk_id: string; score: number }>()
  for (const h of [...acHits, ...refHits]) {
    const prev = byChunk.get(h.chunk_id)
    if (!prev || h.score > prev.score) byChunk.set(h.chunk_id, h)
  }
  const bm25Hits = [...byChunk.values()].sort((a, b) => b.score - a.score).slice(0, 15)
  if (bm25Hits.length > 0) strategies.push('bm25')

  // 5. Merge — port of /api/query hybridRetrieve weighting (vec 0.45, bm 0.35,
  //    tree skipped, vision skipped — both N/A for this doc).
  const slots = new Map<string, MergedSlot>()
  const vMax = Math.max(1e-9, ...vectorChunks.map((c) => c.combined_score ?? c.vector_score ?? 0))
  for (const c of vectorChunks) {
    slots.set(c.chunk_id, {
      chunk: c,
      vec: (c.combined_score ?? c.vector_score ?? 0) / vMax,
      bm: 0,
    })
  }
  const bMax = Math.max(1e-9, ...bm25Hits.map((h) => h.score))
  for (const h of bm25Hits) {
    const s = slots.get(h.chunk_id)
    if (s) s.bm = h.score / bMax
    else slots.set(h.chunk_id, { chunk: null, vec: 0, bm: h.score / bMax })
  }
  await hydrateMissing([...slots.keys()], organizationId, slots)
  const merged = [...slots.values()]
    .filter((s): s is MergedSlot & { chunk: RetrievedChunk } => s.chunk != null)
    .map((s) => ({
      ...s.chunk,
      vector_score: s.vec,
      keyword_score: s.bm,
      combined_score: s.vec * 0.45 + s.bm * 0.35,
    }))
    .sort((a, b) => b.combined_score - a.combined_score)

  // 5b. Page expansion — for direct-chunking chunks in the pool, also pull
  // sibling chunks from the same (doc, page). Answers often need MULTIPLE
  // chunks per page (entry + signoff). Let Cohere rerank pick the best.
  const expanded = await expandWithPageSiblings(merged, organizationId)
  if (expanded.length > merged.length) strategies.push('page-expand')
  expanded.sort((a, b) => b.combined_score - a.combined_score)

  // 6. Rerank (no-op without Cohere)
  const rerankPool = expanded.slice(0, Math.max(16 * 4, 30))
  const { chunks: ranked, reranked } = await rerankChunks(cleanedQuery, rerankPool, 16)
  if (reranked) strategies.push('rerank')

  // 6b. Ensure every chunk going to generation has its Wave 2 context_text.
  // Without this, the model sees only chunk_text and can't reason across
  // sibling chunks on the same page (e.g. signoff chunk's text alone has no
  // date — the date+mechanic linkage lives in context_text).
  const rankedWithContext = await ensureContextText(ranked)

  // 7. Generate
  const answerResult = await generateAnswer(testCase.question, rankedWithContext, [])

  // 8. Score — scoring rules depend on the case category.
  //
  // Standard cases (target_chunk_ids present, not expect_insufficient):
  //   PASS = retrieval_recall AND citation_correct AND answer_contains_expected
  //
  // Negative / off-topic (expect_insufficient: true):
  //   PASS = system honestly declined — confidence === 'insufficient_evidence'
  //          OR answer contains a refusal pattern (any expected_substring)
  //   The model MUST NOT confidently produce a fabricated answer.
  //
  // Aggregation with expect_one_of_substrings_groups:
  //   PASS = at least one substrings group fully matches (all in group present).
  const retrieved_chunk_ids = ranked.map((c) => c.chunk_id)
  const targetIds = testCase.target_chunk_ids ?? []
  const expectedSubs = testCase.expected_substrings ?? []

  const retrieval_rank = (() => {
    if (targetIds.length === 0) return null
    for (let i = 0; i < retrieved_chunk_ids.length; i++) {
      if (targetIds.includes(retrieved_chunk_ids[i])) return i + 1
    }
    return null
  })()
  const retrieval_recall = targetIds.length === 0 ? null : retrieval_rank !== null
  const cited_chunk_ids = answerResult.citations.map((c) => c.chunkId)
  const citation_correct =
    targetIds.length === 0 ? null : targetIds.some((id) => cited_chunk_ids.includes(id))
  const answerLc = (answerResult.answer ?? '').toLowerCase()
  const matched_substrings = expectedSubs.filter((s) => answerLc.includes(s.toLowerCase()))
  const answer_contains_expected = matched_substrings.length > 0

  // expect_one_of_substrings_groups — any group whose substrings ALL appear
  const matchedGroup =
    testCase.expect_one_of_substrings_groups?.find((group) =>
      group.every((s) => answerLc.includes(s.toLowerCase())),
    ) ?? null

  let pass: boolean
  const fail_reasons: string[] = []

  if (testCase.expect_insufficient) {
    // PASS if the system honestly declined.
    const declined =
      answerResult.confidence === 'insufficient_evidence' ||
      answer_contains_expected ||
      matchedGroup !== null
    pass = declined
    if (!declined) {
      fail_reasons.push(
        `negative case: expected refusal (insufficient_evidence or refusal phrase) but got confidence=${answerResult.confidence}`,
      )
    }
  } else {
    // Standard case: combine signals
    const retrievalOk = retrieval_recall === null || retrieval_recall === true
    const citationOk = citation_correct === null || citation_correct === true
    const answerOk = answer_contains_expected || matchedGroup !== null
    pass = retrievalOk && citationOk && answerOk
    if (retrieval_recall === false)
      fail_reasons.push('retrieval: target chunk not in top-16')
    if (citation_correct === false)
      fail_reasons.push('citation: answer did not cite target chunk')
    if (!answerOk) {
      const groupsNote = testCase.expect_one_of_substrings_groups
        ? ` OR any group of ${testCase.expect_one_of_substrings_groups.length}`
        : ''
      fail_reasons.push(
        `answer: contains none of [${expectedSubs.join(', ')}]${groupsNote}`,
      )
    }
  }

  return {
    case_id: testCase.id,
    category: testCase.category,
    question: testCase.question,
    retrieval_recall: retrieval_recall ?? null,
    retrieval_rank,
    citation_correct: citation_correct ?? null,
    answer_contains_expected,
    expected_substrings: expectedSubs,
    matched_substrings,
    retrieved_chunk_ids,
    retrieved_chunk_count: ranked.length,
    cited_chunk_ids,
    answer_confidence: answerResult.confidence,
    answer_confidence_score: answerResult.confidenceScore,
    answer_excerpt: (answerResult.answer ?? '').slice(0, 500),
    hyde_used: hydeUsed,
    strategies,
    latency_ms: Date.now() - t0,
    pass,
    fail_reasons,
  }
}

async function main() {
  console.log(`[eval] target doc: ${TARGET_DOC}`)
  const organizationId = await getOrgIdForDoc(TARGET_DOC)
  if (!organizationId) {
    console.error('[eval] no organization_id found for target doc — aborting')
    process.exit(1)
  }
  console.log(`[eval] organization_id: ${organizationId}`)
  console.log(`[eval] cohere reranker: ${process.env.COHERE_API_KEY ? 'enabled' : 'NO-OP (no key)'}`)
  console.log(`[eval] running ${CASES.length} cases...\n`)

  const results: CaseResult[] = []
  for (const tc of CASES) {
    process.stdout.write(`[eval] ${tc.id}... `)
    try {
      const r = await runOneCase(tc, organizationId)
      results.push(r)
      const tag = r.pass ? 'PASS' : 'FAIL'
      const stage =
        r.retrieval_recall && r.citation_correct && r.answer_contains_expected
          ? ''
          : ` (${r.fail_reasons.join(' · ')})`
      console.log(`${tag} — rank=${r.retrieval_rank ?? '?'} conf=${r.answer_confidence}${stage} (${r.latency_ms}ms)`)
    } catch (err) {
      console.log('ERROR:', err instanceof Error ? err.message : err)
      results.push({
        case_id: tc.id,
        category: tc.category,
        question: tc.question,
        retrieval_recall: false,
        retrieval_rank: null,
        citation_correct: false,
        answer_contains_expected: false,
        expected_substrings: tc.expected_substrings ?? [],
        matched_substrings: [],
        retrieved_chunk_ids: [],
        retrieved_chunk_count: 0,
        cited_chunk_ids: [],
        answer_confidence: 'error',
        answer_confidence_score: 0,
        answer_excerpt: String(err instanceof Error ? err.message : err),
        hyde_used: false,
        strategies: [],
        latency_ms: 0,
        pass: false,
        fail_reasons: ['exception thrown'],
      })
    }
  }

  const passed = results.filter((r) => r.pass).length
  // Per-category breakdown
  const categories = [...new Set(results.map((r) => r.category))]
  const byCategory = categories.map((cat) => {
    const subset = results.filter((r) => r.category === cat)
    const pass = subset.filter((r) => r.pass).length
    return {
      category: cat,
      total: subset.length,
      passed: pass,
      failed: subset.length - pass,
      pass_rate: pass / subset.length,
      failed_ids: subset.filter((r) => !r.pass).map((r) => r.case_id),
    }
  }).sort((a, b) => a.category.localeCompare(b.category))

  // For headline metrics, scope each rate to the cases where it's meaningful.
  const scoredForRecall = results.filter((r) => r.retrieval_recall !== null)
  const scoredForCitation = results.filter((r) => r.citation_correct !== null)
  const summary = {
    target_doc: TARGET_DOC,
    organization_id: organizationId,
    cohere_enabled: Boolean(process.env.COHERE_API_KEY),
    total_cases: results.length,
    passed,
    failed: results.length - passed,
    pass_rate: passed / results.length,
    retrieval_recall_rate:
      scoredForRecall.length === 0
        ? null
        : scoredForRecall.filter((r) => r.retrieval_recall).length / scoredForRecall.length,
    citation_correct_rate:
      scoredForCitation.length === 0
        ? null
        : scoredForCitation.filter((r) => r.citation_correct).length / scoredForCitation.length,
    answer_correct_rate:
      results.filter((r) => r.answer_contains_expected).length / results.length,
    avg_latency_ms:
      results.reduce((a, r) => a + r.latency_ms, 0) / results.length,
    by_category: byCategory,
    results,
  }

  try {
    mkdirSync('.tmp', { recursive: true })
  } catch {}
  const outPath = '.tmp/retrieval-eval-results.json'
  writeFileSync(outPath, JSON.stringify(summary, null, 2))

  console.log(`\n─── Overall ───`)
  console.log(`  passed:           ${passed} / ${results.length} (${(summary.pass_rate * 100).toFixed(0)}%)`)
  if (summary.retrieval_recall_rate !== null) {
    console.log(`  retrieval recall: ${(summary.retrieval_recall_rate * 100).toFixed(0)}% (${scoredForRecall.length} cases scored)`)
  }
  if (summary.citation_correct_rate !== null) {
    console.log(`  citation correct: ${(summary.citation_correct_rate * 100).toFixed(0)}% (${scoredForCitation.length} cases scored)`)
  }
  console.log(`  answer correct:   ${(summary.answer_correct_rate * 100).toFixed(0)}%`)
  console.log(`  avg latency:      ${summary.avg_latency_ms.toFixed(0)}ms`)

  console.log(`\n─── By category ───`)
  for (const c of byCategory) {
    const tag = c.pass_rate === 1 ? '✅' : c.pass_rate >= 0.5 ? '⚠️ ' : '❌'
    const fails = c.failed_ids.length > 0 ? ` (failed: ${c.failed_ids.join(', ')})` : ''
    console.log(
      `  ${tag} ${c.category.padEnd(15)} ${c.passed}/${c.total} (${(c.pass_rate * 100).toFixed(0)}%)${fails}`,
    )
  }

  console.log(`\nFull results: ${outPath}`)
}

main().catch((err) => {
  console.error('[eval] fatal:', err)
  process.exit(1)
})
