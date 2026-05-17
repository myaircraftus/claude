/**
 * BM25 keyword index layer for the aircraft-maintenance RAG system.
 *
 * This LAYERS ON TOP of the existing vector-search pipeline (lib/rag/retrieval.ts)
 * — it is self-contained and does not modify any existing module.
 *
 * BM25 is implemented from scratch (no npm dependency): tokenize, per-document
 * term frequencies, IDF, and the standard BM25 score with k1=1.5, b=0.75. The
 * built index is persisted as JSON to the private `rag-indexes` Storage bucket
 * so `searchBm25` can be cheap and stateless.
 *
 * Per-chunk indexed fields: chunk_text, document_name (documents.title),
 * aircraft_registration (aircraft.tail_number), doc_type, page_number.
 */
import { createServiceSupabase } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Public contract — other code depends on these signatures.
// ---------------------------------------------------------------------------

export interface Bm25Hit {
  chunk_id: string
  document_id: string
  score: number
  page_number: number
}

// ---------------------------------------------------------------------------
// BM25 parameters.
// ---------------------------------------------------------------------------

const K1 = 1.5
const B = 0.75
const STORAGE_BUCKET = 'rag-indexes'

/** Tokenize: lowercase, split on non-alphanumerics, keep tokens of length >= 2. */
function tokenize(text: string): string[] {
  if (!text) return []
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 2)
}

/** Per-chunk locator returned in search hits. */
interface ChunkMeta {
  chunk_id: string
  document_id: string
  page_number: number
}

/**
 * Persisted index shape. `postings[term]` maps a chunk index (into `chunks`)
 * to the raw term frequency for that term within that chunk.
 */
interface Bm25IndexFile {
  version: 1
  aircraftId: string
  chunks: ChunkMeta[]
  /** Token length of each chunk's combined indexed text, parallel to `chunks`. */
  docLengths: number[]
  /** Mean token length across all chunks. */
  avgDocLength: number
  /** term -> { chunkIndex -> termFrequency } */
  postings: Record<string, Record<number, number>>
  /** term -> number of chunks containing the term. */
  docFreqs: Record<string, number>
}

// ---------------------------------------------------------------------------
// DB row shapes.
// ---------------------------------------------------------------------------

interface ChunkRow {
  id: string
  document_id: string
  aircraft_id: string
  page_number: number
  section_title: string | null
  chunk_text: string | null
}

interface DocumentRow {
  id: string
  title: string | null
  doc_type: string | null
  aircraft_id: string
}

interface AircraftRow {
  id: string
  tail_number: string | null
}

// ---------------------------------------------------------------------------
// Build.
// ---------------------------------------------------------------------------

/**
 * Build (or rebuild) the BM25 index for one aircraft and persist it to Storage.
 * Returns the number of chunks indexed.
 */
export async function buildBm25Index(
  aircraftId: string
): Promise<{ chunkCount: number }> {
  const supabase = createServiceSupabase()

  const { data: chunkData, error: chunkErr } = await supabase
    .from('document_chunks')
    .select('id, document_id, aircraft_id, page_number, section_title, chunk_text')
    .eq('aircraft_id', aircraftId)
    .limit(100000)

  if (chunkErr) throw new Error(`bm25: failed to read document_chunks: ${chunkErr.message}`)

  const chunkRows = (chunkData ?? []) as ChunkRow[]

  // Parent documents — title + doc_type, keyed by document id.
  const documentIds = Array.from(new Set(chunkRows.map((c) => c.document_id)))
  const documentsById = new Map<string, DocumentRow>()
  if (documentIds.length > 0) {
    const { data: docData, error: docErr } = await supabase
      .from('documents')
      .select('id, title, doc_type, aircraft_id')
      .in('id', documentIds)
    if (docErr) throw new Error(`bm25: failed to read documents: ${docErr.message}`)
    for (const row of (docData ?? []) as DocumentRow[]) {
      documentsById.set(row.id, row)
    }
  }

  // Aircraft tail number.
  let aircraftRegistration = ''
  const { data: aircraftData, error: aircraftErr } = await supabase
    .from('aircraft')
    .select('id, tail_number')
    .eq('id', aircraftId)
    .maybeSingle()
  if (aircraftErr) throw new Error(`bm25: failed to read aircraft: ${aircraftErr.message}`)
  if (aircraftData) {
    aircraftRegistration = ((aircraftData as AircraftRow).tail_number ?? '').toString()
  }

  const chunks: ChunkMeta[] = []
  const docLengths: number[] = []
  const postings: Record<string, Record<number, number>> = {}
  const docFreqs: Record<string, number> = {}

  chunkRows.forEach((row, chunkIndex) => {
    const doc = documentsById.get(row.document_id)
    const documentName = doc?.title ?? ''
    const docType = doc?.doc_type ?? ''

    // Combine all indexed fields into one token stream for this chunk.
    const combined = [
      row.chunk_text ?? '',
      row.section_title ?? '',
      documentName,
      aircraftRegistration,
      docType,
      String(row.page_number ?? ''),
    ].join(' ')

    const tokens = tokenize(combined)
    docLengths.push(tokens.length)

    // Per-chunk term frequencies.
    const termFreq: Record<string, number> = {}
    for (const token of tokens) {
      termFreq[token] = (termFreq[token] ?? 0) + 1
    }

    for (const [term, tf] of Object.entries(termFreq)) {
      if (!postings[term]) postings[term] = {}
      postings[term][chunkIndex] = tf
      docFreqs[term] = (docFreqs[term] ?? 0) + 1
    }

    chunks.push({
      chunk_id: row.id,
      document_id: row.document_id,
      page_number: row.page_number,
    })
  })

  const totalLength = docLengths.reduce((sum, n) => sum + n, 0)
  const avgDocLength = chunks.length > 0 ? totalLength / chunks.length : 0

  const index: Bm25IndexFile = {
    version: 1,
    aircraftId,
    chunks,
    docLengths,
    avgDocLength,
    postings,
    docFreqs,
  }

  const blob = new Blob([JSON.stringify(index)], { type: 'application/json' })
  const { error: uploadErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(`${aircraftId}/bm25.json`, blob, {
      upsert: true,
      contentType: 'application/json',
    })
  if (uploadErr) throw new Error(`bm25: failed to upload index: ${uploadErr.message}`)

  return { chunkCount: chunks.length }
}

// ---------------------------------------------------------------------------
// Search.
// ---------------------------------------------------------------------------

/** IDF with the standard BM25 smoothing; floored at 0 to avoid negative scores. */
function idf(docFreq: number, totalDocs: number): number {
  const value = Math.log(1 + (totalDocs - docFreq + 0.5) / (docFreq + 0.5))
  return value > 0 ? value : 0
}

/**
 * Score a tokenized query against the persisted BM25 index for one aircraft.
 * Returns the top `topK` hits sorted by score descending. If the index file
 * does not exist (or fails to download), returns `[]` — never throws.
 */
export async function searchBm25(
  aircraftId: string,
  query: string,
  topK: number
): Promise<Bm25Hit[]> {
  const supabase = createServiceSupabase()

  let index: Bm25IndexFile
  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(`${aircraftId}/bm25.json`)
    if (error || !data) return []
    const text = await data.text()
    index = JSON.parse(text) as Bm25IndexFile
  } catch {
    return []
  }

  const totalDocs = index.chunks?.length ?? 0
  if (totalDocs === 0) return []

  const queryTerms = Array.from(new Set(tokenize(query)))
  if (queryTerms.length === 0) return []

  const scores = new Array<number>(totalDocs).fill(0)

  for (const term of queryTerms) {
    const posting = index.postings[term]
    if (!posting) continue
    const termIdf = idf(index.docFreqs[term] ?? 0, totalDocs)
    if (termIdf === 0) continue

    for (const [chunkIndexStr, tf] of Object.entries(posting)) {
      const chunkIndex = Number(chunkIndexStr)
      const docLen = index.docLengths[chunkIndex] ?? 0
      const denom =
        tf + K1 * (1 - B + B * (index.avgDocLength > 0 ? docLen / index.avgDocLength : 0))
      if (denom === 0) continue
      scores[chunkIndex] += termIdf * ((tf * (K1 + 1)) / denom)
    }
  }

  const hits: Bm25Hit[] = []
  for (let i = 0; i < totalDocs; i++) {
    if (scores[i] <= 0) continue
    const meta = index.chunks[i]
    hits.push({
      chunk_id: meta.chunk_id,
      document_id: meta.document_id,
      score: scores[i],
      page_number: meta.page_number,
    })
  }

  hits.sort((a, b) => b.score - a.score)
  return hits.slice(0, Math.max(0, topK))
}
