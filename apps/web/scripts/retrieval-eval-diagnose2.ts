/**
 * Round 4 diagnose: is Craig in the rerank candidate pool at all?
 * The eval's pool = retrieveChunks(limit=20) + BM25 hits, deduped.
 * Cohere can only re-order what's there.
 */
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { parseStructuredQuery } from '../lib/rag/query-parser'
import { generateHypotheticalDocument } from '../lib/rag/hyde'
import { generateEmbeddings } from '../lib/openai/embeddings'
import { retrieveChunks } from '../lib/rag/retrieval'
import { searchBm25, searchReferenceBm25 } from '../lib/rag/bm25-index'

config({ path: resolve(process.cwd(), '.env.local') })

const ORG_ID = '82042eee-1d20-49a4-be12-12f73e335392'
const AIRCRAFT_ID = '1ee40686-666c-4fd8-9bbd-b1ba44be4732'
const CRAIG_CHUNK = 'ecf59dab-a209-4652-bbcc-30f69d3d2a4a'

async function main() {
  const question = 'Who performed the 100 hour inspection on December 3, 1984?'
  const parsedQuery = await parseStructuredQuery({
    organizationId: ORG_ID,
    aircraftId: AIRCRAFT_ID,
    docTypeFilter: undefined,
    queryText: question,
  })
  const cleaned = parsedQuery.cleanedQuery || question

  const hyde = await generateHypotheticalDocument(cleaned, 'owner')
  const [realEmb] = await generateEmbeddings([{ id: 'q', text: cleaned }])
  let vectorEmb = realEmb.embedding
  if (hyde !== cleaned) {
    const [hEmb] = await generateEmbeddings([{ id: 'h', text: hyde }])
    vectorEmb = hEmb.embedding
  }

  // 1. retrieveChunks output
  const vec = await retrieveChunks({
    organizationId: ORG_ID,
    aircraftId: AIRCRAFT_ID,
    queryEmbedding: vectorEmb,
    queryText: cleaned,
    docTypeFilter: undefined,
    limit: 20,
    parsedQuery,
  })
  const craigInVec = vec.findIndex((c) => c.chunk_id === CRAIG_CHUNK)
  console.log(`[1] retrieveChunks returned ${vec.length} chunks. Craig at rank: ${craigInVec >= 0 ? craigInVec + 1 : 'NOT FOUND'}`)

  // 2. BM25 — aircraft + reference
  const [acHits, refHits] = await Promise.all([
    searchBm25(AIRCRAFT_ID, cleaned, 15).catch(() => []),
    searchReferenceBm25(ORG_ID, cleaned, 15).catch(() => []),
  ])
  const craigInAc = acHits.findIndex((h) => h.chunk_id === CRAIG_CHUNK)
  const craigInRef = refHits.findIndex((h) => h.chunk_id === CRAIG_CHUNK)
  console.log(`[2] BM25 aircraft (${acHits.length} hits): Craig at rank ${craigInAc >= 0 ? craigInAc + 1 : 'NOT FOUND'}`)
  console.log(`[2] BM25 reference (${refHits.length} hits): Craig at rank ${craigInRef >= 0 ? craigInRef + 1 : 'NOT FOUND'}`)

  // 3. What's the total pool size?
  const allIds = new Set<string>()
  for (const c of vec) allIds.add(c.chunk_id)
  for (const h of acHits) allIds.add(h.chunk_id)
  for (const h of refHits) allIds.add(h.chunk_id)
  console.log(`[3] Combined pool size: ${allIds.size} unique chunks`)
  console.log(`[3] Craig in combined pool: ${allIds.has(CRAIG_CHUNK)}`)

  // 4. What's preventing retrieveChunks from including Craig? Try increasing the limit.
  console.log('\n[4] Increasing retrieveChunks limit to 50:')
  const vec50 = await retrieveChunks({
    organizationId: ORG_ID,
    aircraftId: AIRCRAFT_ID,
    queryEmbedding: vectorEmb,
    queryText: cleaned,
    docTypeFilter: undefined,
    limit: 50,
    parsedQuery,
  })
  const craigIn50 = vec50.findIndex((c) => c.chunk_id === CRAIG_CHUNK)
  console.log(`  retrieveChunks(50) returned ${vec50.length} chunks. Craig rank: ${craigIn50 >= 0 ? craigIn50 + 1 : 'NOT FOUND'}`)
}
main().catch(console.error)
