/**
 * What does retrieveChunks() return vs raw RPC?
 * retrieveChunks runs multiple strategies (RPC + keyword/phrase/raw/annual
 * supplemental) and re-ranks. We want to see the difference between the raw
 * vector-only result (rank-3 Craig) and what retrieveChunks actually surfaces.
 */
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { parseStructuredQuery } from '../lib/rag/query-parser'
import { generateHypotheticalDocument } from '../lib/rag/hyde'
import { generateEmbeddings } from '../lib/openai/embeddings'
import { retrieveChunks } from '../lib/rag/retrieval'

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
  console.log('cleanedQuery:', cleaned)
  console.log('HyDE:', hyde.slice(0, 200))
  console.log()

  const [realEmb] = await generateEmbeddings([{ id: 'q', text: cleaned }])
  let vectorEmb = realEmb.embedding
  if (hyde !== cleaned) {
    const [hydeEmb] = await generateEmbeddings([{ id: 'h', text: hyde }])
    vectorEmb = hydeEmb.embedding
  }

  const result = await retrieveChunks({
    organizationId: ORG_ID,
    aircraftId: AIRCRAFT_ID,
    queryEmbedding: vectorEmb,
    queryText: cleaned,
    docTypeFilter: undefined,
    limit: 20,
    parsedQuery,
  })

  console.log(`retrieveChunks returned ${result.length} chunks`)
  const craigRank = result.findIndex((c) => c.chunk_id === CRAIG_CHUNK) + 1
  console.log(`Craig chunk rank in retrieveChunks output: ${craigRank || 'NOT IN RESULTS'}`)
  console.log()
  console.log('Top 20 from retrieveChunks (combined_score):')
  for (let i = 0; i < result.length; i++) {
    const c = result[i]
    const isTarget = c.chunk_id === CRAIG_CHUNK ? ' <-- TARGET' : ''
    const txt = (c.chunk_text || '').slice(0, 80).replace(/\n/g, ' ')
    console.log(
      `  ${String(i + 1).padStart(2)}. combined=${(c.combined_score ?? 0).toFixed(3)} vec=${(c.vector_score ?? 0).toFixed(3)} kw=${(c.keyword_score ?? 0).toFixed(3)} p${c.page_number} "${txt}..."${isTarget}`,
    )
  }
}
main().catch(console.error)
