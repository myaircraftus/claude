/**
 * End-to-end verification that the positional-fallback citation fix actually
 * produces clickable citations from a real RAG flow.
 *
 * Pulls real document chunks for N8202L from the production Supabase instance,
 * runs them through generateAnswer, and asserts that the returned citations
 * array has entries with a populated documentId — i.e. the [N] markers in the
 * answer text will actually map to a clickable /documents/<id> URL in the UI.
 *
 * Run from apps/web with:
 *   npx tsx scripts/verify-citations.ts
 */

// Load .env.local manually (no dotenv dep needed)
import { readFileSync } from 'fs'
import { resolve } from 'path'
try {
  const env = readFileSync(resolve(__dirname, '../.env.local'), 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
} catch {}

import { createClient } from '@supabase/supabase-js'
import { generateAnswer } from '../lib/rag/generation'
import type { RetrievedChunk } from '../types'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const N8202L_AIRCRAFT_ID = '812434e2-7cc1-41f5-91f3-0601ba52ea35'
const HORIZON_ORG_ID = '82042eee-1d20-49a4-be12-12f73e335392'

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE)

  console.log('1. Pulling real document chunks for N8202L...')
  // Pull chunks first (we know they exist) then join doc metadata.
  const { data: chunks, error: chunkErr } = await supabase
    .from('document_chunks')
    .select('id, document_id, chunk_index, chunk_text, page_number, page_number_end, section_title')
    .eq('aircraft_id', N8202L_AIRCRAFT_ID)
    .ilike('chunk_text', '%inspection%')
    .limit(8)

  if (chunkErr) console.error('   chunk error:', chunkErr.message)
  console.log(`   Found ${chunks?.length ?? 0} chunks matching "inspection"`)
  if (!chunks || chunks.length === 0) {
    console.error('No matching chunks found')
    process.exit(1)
  }

  // Pull doc metadata for the chunks we found
  const docIds = Array.from(new Set(chunks.map((c) => c.document_id)))
  const { data: docs } = await supabase
    .from('documents')
    .select('id, title, doc_type')
    .in('id', docIds)
  console.log(`   Joined ${docs?.length ?? 0} parent documents`)

  // Build RetrievedChunk[] in the shape generateAnswer expects
  const docById = new Map((docs ?? []).map((d) => [d.id, d]))
  const retrievedChunks: RetrievedChunk[] = chunks.map((c) => {
    const doc = docById.get(c.document_id)
    return {
      chunk_id: c.id,
      document_id: c.document_id,
      document_title: doc?.title ?? 'Untitled',
      doc_type: (doc?.doc_type as RetrievedChunk['doc_type']) ?? 'other',
      chunk_index: c.chunk_index,
      chunk_text: c.chunk_text,
      page_number: c.page_number ?? 1,
      page_number_end: c.page_number_end ?? null,
      section_title: c.section_title ?? null,
      aircraft_id: N8202L_AIRCRAFT_ID,
      aircraft_tail: 'N8202L',
      embedding_score: 0.85,
      bm25_score: null,
      combined_score: 0.85,
      metadata_json: {},
    } as unknown as RetrievedChunk
  })

  console.log('\n2. Calling generateAnswer with real chunks...')
  const result = await generateAnswer(
    'What inspections have been performed on this aircraft? Cite specific entries.',
    retrievedChunks,
  )

  console.log('\n3. Result:')
  console.log('   confidence:', result.confidence)
  console.log('   answer (first 200 chars):', result.answer.slice(0, 200))
  console.log('   cited_chunk_ids returned by LLM:', result.citedChunkIds)
  console.log('   citations.length:', result.citations.length)

  // Extract [N] markers from answer text
  const markers = Array.from(result.answer.matchAll(/\[(\d+)\]/g)).map((m) => m[1])
  console.log('   [N] markers in answer text:', markers)

  console.log('\n4. Citation details:')
  result.citations.forEach((c, i) => {
    console.log(`   [${i + 1}] documentId=${c.documentId} page=${c.pageNumber} chunkId=${c.chunkId?.slice(0, 8)}`)
  })

  console.log('\n5. Verdict:')
  if (result.citations.length === 0 && markers.length > 0) {
    console.error('   FAIL: answer has [N] markers but citations array is empty')
    console.error('   This means clicking [1] in the UI will fall through to plain text.')
    process.exit(1)
  }
  if (result.citations.some((c) => !c.documentId)) {
    console.error('   FAIL: at least one citation has no documentId')
    console.error('   Clicking it will produce /documents/undefined in the URL.')
    process.exit(1)
  }
  if (markers.length > 0 && result.citations.length >= Math.max(...markers.map(Number))) {
    console.log('   PASS: every [N] marker resolves to a citation with a real documentId')
    console.log('   The UI will render real clickable /documents/<id> links.')
  } else if (markers.length === 0) {
    console.log('   No [N] markers in answer — model returned ungrounded answer.')
  } else {
    console.log('   PARTIAL: some markers may not resolve. Check results above.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
