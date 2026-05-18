/**
 * BM25 keyword index layer for the aircraft-maintenance RAG system.
 *
 * Layers on top of the vector-search pipeline (lib/rag/retrieval.ts). Two
 * index SCOPES are persisted as JSON to the private `rag-indexes` bucket:
 *
 *   - per-AIRCRAFT       chunks for one aircraft (logbooks, that tail's
 *                        records)        → rag-indexes/<aircraftId>/bm25.json
 *   - per-ORG REFERENCE  aircraft-LESS documents shared across the org
 *                        (maintenance manuals, ADs/SBs, parts catalogs,
 *                        wiring diagrams) → rag-indexes/org/<orgId>/reference-bm25.json
 *
 * The reference index (SOP audit — Wave 1.3) is what makes a mechanic-
 * uploaded manual keyword-searchable. Before it, a document with no
 * aircraft_id got NO BM25 index at all and was vector-only — so part
 * numbers, AD numbers and torque specs in manuals retrieved poorly.
 *
 * BM25 is implemented from scratch (no npm dependency): tokenize, per-chunk
 * term frequencies, IDF, and the standard BM25 score with k1=1.5, b=0.75.
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
 * to the raw term frequency for that term within that chunk. `aircraftId`
 * holds the scope id — an aircraft UUID, or `org:<orgId>` for a reference
 * index (the field is metadata only; search never reads it).
 */
interface Bm25IndexFile {
  version: 1
  aircraftId: string
  chunks: ChunkMeta[]
  docLengths: number[]
  avgDocLength: number
  postings: Record<string, Record<number, number>>
  docFreqs: Record<string, number>
}

// ---------------------------------------------------------------------------
// DB row shapes.
// ---------------------------------------------------------------------------

interface ChunkRow {
  id: string
  document_id: string
  aircraft_id: string | null
  page_number: number
  section_title: string | null
  chunk_text: string | null
}

interface DocumentRow {
  id: string
  title: string | null
  doc_type: string | null
}

interface AircraftRow {
  id: string
  tail_number: string | null
}

// ---------------------------------------------------------------------------
// Shared index construction + scoring (used by both scopes).
// ---------------------------------------------------------------------------

/** Build the in-memory BM25 index from a set of chunk rows. Pure function. */
function assembleIndex(
  chunkRows: ChunkRow[],
  documentsById: Map<string, DocumentRow>,
  scopeId: string,
  registration: string,
): Bm25IndexFile {
  const chunks: ChunkMeta[] = []
  const docLengths: number[] = []
  const postings: Record<string, Record<number, number>> = {}
  const docFreqs: Record<string, number> = {}

  chunkRows.forEach((row, chunkIndex) => {
    const doc = documentsById.get(row.document_id)
    // Combine all indexed fields into one token stream for this chunk.
    const combined = [
      row.chunk_text ?? '',
      row.section_title ?? '',
      doc?.title ?? '',
      registration,
      doc?.doc_type ?? '',
      String(row.page_number ?? ''),
    ].join(' ')

    const tokens = tokenize(combined)
    docLengths.push(tokens.length)

    const termFreq: Record<string, number> = {}
    for (const token of tokens) termFreq[token] = (termFreq[token] ?? 0) + 1

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
  return {
    version: 1,
    aircraftId: scopeId,
    chunks,
    docLengths,
    avgDocLength: chunks.length > 0 ? totalLength / chunks.length : 0,
    postings,
    docFreqs,
  }
}

/** Fetch the parent documents (title + doc_type) for a set of chunk rows. */
async function loadDocuments(
  supabase: ReturnType<typeof createServiceSupabase>,
  chunkRows: ChunkRow[],
): Promise<Map<string, DocumentRow>> {
  const documentsById = new Map<string, DocumentRow>()
  const documentIds = Array.from(new Set(chunkRows.map((c) => c.document_id)))
  if (documentIds.length === 0) return documentsById
  const { data, error } = await supabase
    .from('documents')
    .select('id, title, doc_type')
    .in('id', documentIds)
  if (error) throw new Error(`bm25: failed to read documents: ${error.message}`)
  for (const row of (data ?? []) as DocumentRow[]) documentsById.set(row.id, row)
  return documentsById
}

/** Persist an index to Storage at the given key (upsert). */
async function persistIndex(
  supabase: ReturnType<typeof createServiceSupabase>,
  key: string,
  index: Bm25IndexFile,
): Promise<void> {
  const blob = new Blob([JSON.stringify(index)], { type: 'application/json' })
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(key, blob, { upsert: true, contentType: 'application/json' })
  if (error) throw new Error(`bm25: failed to upload index ${key}: ${error.message}`)
}

/** IDF with the standard BM25 smoothing; floored at 0 to avoid negative scores. */
function idf(docFreq: number, totalDocs: number): number {
  const value = Math.log(1 + (totalDocs - docFreq + 0.5) / (docFreq + 0.5))
  return value > 0 ? value : 0
}

/** Score a query against an in-memory index. Pure function. */
function scoreIndex(index: Bm25IndexFile, query: string, topK: number): Bm25Hit[] {
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

/** Download + parse a persisted index. Returns null if missing/corrupt. */
async function loadIndex(
  supabase: ReturnType<typeof createServiceSupabase>,
  key: string,
): Promise<Bm25IndexFile | null> {
  try {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(key)
    if (error || !data) return null
    return JSON.parse(await data.text()) as Bm25IndexFile
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Per-aircraft index — unchanged public behavior.
// ---------------------------------------------------------------------------

/**
 * Build (or rebuild) the BM25 index for one aircraft and persist it.
 * Returns the number of chunks indexed.
 */
export async function buildBm25Index(aircraftId: string): Promise<{ chunkCount: number }> {
  const supabase = createServiceSupabase()

  const { data: chunkData, error: chunkErr } = await supabase
    .from('document_chunks')
    .select('id, document_id, aircraft_id, page_number, section_title, chunk_text')
    .eq('aircraft_id', aircraftId)
    .limit(100000)
  if (chunkErr) throw new Error(`bm25: failed to read document_chunks: ${chunkErr.message}`)
  const chunkRows = (chunkData ?? []) as ChunkRow[]

  const documentsById = await loadDocuments(supabase, chunkRows)

  // Aircraft tail number — indexed so a query mentioning the tail matches.
  let registration = ''
  const { data: aircraftData, error: aircraftErr } = await supabase
    .from('aircraft')
    .select('id, tail_number')
    .eq('id', aircraftId)
    .maybeSingle()
  if (aircraftErr) throw new Error(`bm25: failed to read aircraft: ${aircraftErr.message}`)
  if (aircraftData) registration = ((aircraftData as AircraftRow).tail_number ?? '').toString()

  const index = assembleIndex(chunkRows, documentsById, aircraftId, registration)
  await persistIndex(supabase, `${aircraftId}/bm25.json`, index)
  return { chunkCount: index.chunks.length }
}

/**
 * Score a query against one aircraft's BM25 index. Missing index → [].
 * Never throws.
 */
export async function searchBm25(
  aircraftId: string,
  query: string,
  topK: number,
): Promise<Bm25Hit[]> {
  const supabase = createServiceSupabase()
  const index = await loadIndex(supabase, `${aircraftId}/bm25.json`)
  if (!index) {
    console.warn(
      `[bm25] index missing for aircraft ${aircraftId} — returning [] (vector search unaffected)`,
    )
    return []
  }
  return scoreIndex(index, query, topK)
}

// ---------------------------------------------------------------------------
// Per-org REFERENCE index — Wave 1.3. Aircraft-less shared documents.
// ---------------------------------------------------------------------------

/** Storage key for an org's reference index. */
function referenceKey(organizationId: string): string {
  return `org/${organizationId}/reference-bm25.json`
}

/**
 * Build (or rebuild) the org-scoped REFERENCE BM25 index — every chunk of
 * every aircraft-less document in the org (maintenance manuals, ADs/SBs,
 * parts catalogs, wiring diagrams). This is what makes a mechanic-uploaded
 * manual keyword-searchable. Returns the number of chunks indexed.
 */
export async function buildReferenceBm25Index(
  organizationId: string,
): Promise<{ chunkCount: number }> {
  const supabase = createServiceSupabase()

  const { data: chunkData, error: chunkErr } = await supabase
    .from('document_chunks')
    .select('id, document_id, aircraft_id, page_number, section_title, chunk_text')
    .eq('organization_id', organizationId)
    .is('aircraft_id', null)
    .limit(100000)
  if (chunkErr) {
    throw new Error(`bm25: failed to read reference document_chunks: ${chunkErr.message}`)
  }
  const chunkRows = (chunkData ?? []) as ChunkRow[]

  const documentsById = await loadDocuments(supabase, chunkRows)
  const index = assembleIndex(chunkRows, documentsById, `org:${organizationId}`, '')
  await persistIndex(supabase, referenceKey(organizationId), index)
  return { chunkCount: index.chunks.length }
}

/**
 * Score a query against the org's REFERENCE BM25 index. Missing index → [].
 * Never throws. Consult this alongside searchBm25 so reference manuals are
 * keyword-searchable regardless of which aircraft (if any) is selected.
 */
export async function searchReferenceBm25(
  organizationId: string,
  query: string,
  topK: number,
): Promise<Bm25Hit[]> {
  const supabase = createServiceSupabase()
  const index = await loadIndex(supabase, referenceKey(organizationId))
  if (!index) return []
  return scoreIndex(index, query, topK)
}
