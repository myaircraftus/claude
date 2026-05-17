/**
 * runIntelligenceQuery — the single RAG entry point for the Aircraft
 * Intelligence Suite. Wraps the live retrieval stack (vector + BM25 + the
 * PageIndex tree) behind one call so each module can fire many targeted
 * questions without re-implementing routing or merge logic.
 *
 * It mirrors what /api/query does — vector ALWAYS runs as the default; the
 * BM25 keyword index and the PageIndex tree are layered on best-effort per
 * the query router. The existing pipeline is not modified.
 */
import { createServiceSupabase } from '@/lib/supabase/server'
import { generateEmbeddings } from '@/lib/openai/embeddings'
import { retrieveChunks } from '@/lib/rag/retrieval'
import { generateAnswer } from '@/lib/rag/generation'
import { parseStructuredQuery } from '@/lib/rag/query-parser'
import { routeQuery, indexesForStrategy, type QueryStrategy } from '@/lib/rag/query-router'
import { searchBm25 } from '@/lib/rag/bm25-index'
import type { RetrievedChunk, DocType } from '@/types'
import type { IntelligenceCitation, IntelligenceQueryResult } from '@/lib/intelligence/types'

/** Pull chunk ids from PageIndex tree nodes whose label/summary match the query. */
async function treeChunkIds(
  supabase: any,
  aircraftId: string,
  question: string,
): Promise<string[]> {
  const { data: nodes } = await supabase
    .from('page_tree_nodes')
    .select('label, summary, chunk_ids')
    .eq('aircraft_id', aircraftId)
    .limit(2000)
  if (!nodes || nodes.length === 0) return []
  const terms = question.toLowerCase().split(/[^a-z0-9]+/).filter((t: string) => t.length >= 3)
  const ranked = (nodes as Array<Record<string, any>>)
    .map((node) => {
      const hay = `${node.label ?? ''} ${node.summary ?? ''}`.toLowerCase()
      let score = 0
      for (const term of terms) if (hay.includes(term)) score += 1
      return { node, score }
    })
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
  const ids: string[] = []
  for (const { node } of ranked) {
    if (Array.isArray(node.chunk_ids)) {
      for (const id of node.chunk_ids) if (typeof id === 'string') ids.push(id)
    }
  }
  return ids
}

/**
 * Run one routed RAG query for an intelligence module. Never throws — on any
 * failure it returns an empty (insufficient_evidence) result so a module can
 * mark that section "Insufficient records to analyze".
 */
export async function runIntelligenceQuery(args: {
  organizationId: string
  aircraftId: string
  question: string
  /** Override the auto-routed strategy (the modules specify one per query). */
  strategy?: QueryStrategy
}): Promise<IntelligenceQueryResult> {
  const { organizationId, aircraftId, question, strategy } = args
  const empty: IntelligenceQueryResult = {
    answer: '',
    confidence: 'insufficient_evidence',
    citations: [],
    chunkCount: 0,
  }

  try {
    const supabase = createServiceSupabase()

    // 1. Parse + embed the question.
    const parsed = await parseStructuredQuery({
      organizationId,
      aircraftId,
      queryText: question,
    })
    const embeddingText = parsed.cleanedQuery || question
    const [embedding] = await generateEmbeddings([{ id: 'q', text: embeddingText }])

    // 2. Vector retrieval — ALWAYS runs (default + fallback).
    let chunks = await retrieveChunks({
      organizationId,
      aircraftId,
      queryEmbedding: embedding.embedding,
      queryText: embeddingText,
      docTypeFilter: parsed.docTypeFilter,
      limit: 20,
      parsedQuery: parsed,
    })

    // 3. PageIndex layer — BM25 + tree, best-effort, additive.
    const idx = indexesForStrategy(strategy ?? routeQuery(question))
    const have = new Set(chunks.map((c) => c.chunk_id))
    const extraIds = new Set<string>()
    if (idx.bm25) {
      try {
        for (const hit of await searchBm25(aircraftId, question, 15)) {
          if (!have.has(hit.chunk_id)) extraIds.add(hit.chunk_id)
        }
      } catch (err) {
        console.error('[intelligence-query] BM25 failed (vector unaffected):', err)
      }
    }
    if (idx.tree) {
      try {
        for (const id of await treeChunkIds(supabase, aircraftId, question)) {
          if (!have.has(id)) extraIds.add(id)
        }
      } catch (err) {
        console.error('[intelligence-query] tree lookup failed (vector unaffected):', err)
      }
    }
    if (extraIds.size > 0) {
      try {
        const { data: rows } = await supabase
          .from('document_chunks')
          .select(
            'id, document_id, aircraft_id, page_number, page_number_end, section_title, chunk_text, metadata_json, documents:document_id(title, doc_type, document_date)',
          )
          .in('id', Array.from(extraIds))
        for (const row of (rows ?? []) as Array<Record<string, any>>) {
          const doc = Array.isArray(row.documents) ? row.documents[0] : row.documents
          chunks.push({
            chunk_id: row.id,
            document_id: row.document_id,
            document_title: doc?.title ?? 'Document',
            doc_type: (doc?.doc_type ?? 'miscellaneous') as DocType,
            document_date: doc?.document_date ?? undefined,
            aircraft_id: row.aircraft_id ?? undefined,
            page_number: typeof row.page_number === 'number' ? row.page_number : 0,
            page_number_end: row.page_number_end ?? undefined,
            section_title: row.section_title ?? undefined,
            chunk_text: row.chunk_text ?? '',
            metadata_json: (row.metadata_json as Record<string, unknown>) ?? {},
            vector_score: 0,
            keyword_score: 0.7,
            combined_score: 0.7,
          })
        }
      } catch (err) {
        console.error('[intelligence-query] chunk hydration failed:', err)
      }
    }

    if (chunks.length === 0) return empty

    // 4. Generate the answer.
    const answer = await generateAnswer(question, chunks)
    const dateByChunk = new Map<string, string | null>(
      chunks.map((c: RetrievedChunk) => [c.chunk_id, c.document_date ?? null]),
    )
    const citations: IntelligenceCitation[] = (answer.citations ?? []).map((c) => ({
      doc_name: c.documentTitle ?? 'Document',
      page_number: typeof c.pageNumber === 'number' ? c.pageNumber : null,
      entry_date: dateByChunk.get(c.chunkId) ?? null,
      excerpt: (c.quotedText ?? c.snippet ?? '').slice(0, 400),
    }))

    return {
      answer: answer.answer,
      confidence: answer.confidence,
      citations,
      chunkCount: chunks.length,
    }
  } catch (err) {
    console.error('[intelligence-query] failed:', err)
    return empty
  }
}
