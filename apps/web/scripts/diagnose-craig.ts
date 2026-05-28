/**
 * Why does retrieval still miss the John M. Craig chunk after Wave 2 v2?
 * Test the RPC directly with the exact eval query and see what beats it.
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { resolve } from 'node:path'
import { generateEmbeddings } from '../lib/openai/embeddings'

config({ path: resolve(process.cwd(), '.env.local') })

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const ORG_ID = '82042eee-1d20-49a4-be12-12f73e335392'
const AIRCRAFT_ID = '1ee40686-666c-4fd8-9bbd-b1ba44be4732'
const CRAIG_CHUNK = 'ecf59dab-a209-4652-bbcc-30f69d3d2a4a'
const NOV1988_CHUNK = 'de1359a3-0691-405c-b5b5-d24ad38419b2'

async function main() {
  // 1. Confirm the embedding for Craig actually reflects the new context_text
  console.log('─── 1. Sanity: Craig chunk current state ───')
  const { data: chunk } = await s
    .from('canonical_document_chunks')
    .select('id, context_text, chunk_text')
    .eq('id', CRAIG_CHUNK)
    .maybeSingle()
  const ctx = (chunk as any)?.context_text ?? ''
  console.log('  context_text contains "December":', ctx.includes('December'))
  console.log('  context_text contains "1984":', ctx.includes('1984'))
  console.log('  context_text contains "John M. Craig":', ctx.includes('John M. Craig'))

  // 2. Same query the eval used, via the RPC, aircraft-scoped
  const question = 'Who performed the 100 hour inspection on December 3, 1984?'
  console.log(`\n─── 2. RPC query (aircraft-scoped) ───`)
  console.log(`  query: ${question}`)
  const [emb] = await generateEmbeddings([{ id: 'q', text: question }])
  const { data, error } = await s.rpc('search_canonical_documents', {
    p_organization_id: ORG_ID,
    p_aircraft_id: AIRCRAFT_ID,
    p_query_embedding: emb.embedding,
    p_query_text: question,
    p_doc_type_filter: null,
    p_limit: 25,
  })
  if (error) {
    console.log('  RPC error:', error.message)
    return
  }
  const rows = (data ?? []) as Array<any>
  console.log(`  returned: ${rows.length} chunks`)
  const targetRank = rows.findIndex((r) => r.chunk_id === CRAIG_CHUNK) + 1
  console.log(`  Craig chunk rank: ${targetRank || 'NOT IN RESULTS'}`)
  console.log('\n  Top 16:')
  for (let i = 0; i < Math.min(16, rows.length); i++) {
    const r = rows[i]
    const isTarget = r.chunk_id === CRAIG_CHUNK ? ' <-- TARGET' : ''
    const vec = (r.vector_score ?? r.combined_score ?? 0).toFixed(3)
    const txt = (r.chunk_text ?? '').slice(0, 80).replace(/\n/g, ' ')
    console.log(`    ${String(i + 1).padStart(2)}. score=${vec} chunk=${(r.chunk_id as string).slice(0, 8)} p${r.page_number} "${txt}..."${isTarget}`)
  }

  // 3. Same for Nov 24 1988 query
  const q2 = 'On the November 24, 1988 inspection entry, what was the tach reading?'
  console.log(`\n─── 3. RPC query: Nov 24 1988 ───`)
  console.log(`  query: ${q2}`)
  const [emb2] = await generateEmbeddings([{ id: 'q', text: q2 }])
  const r2 = await s.rpc('search_canonical_documents', {
    p_organization_id: ORG_ID,
    p_aircraft_id: AIRCRAFT_ID,
    p_query_embedding: emb2.embedding,
    p_query_text: q2,
    p_doc_type_filter: null,
    p_limit: 25,
  })
  const rows2 = (r2.data ?? []) as Array<any>
  const novRank = rows2.findIndex((r) => r.chunk_id === NOV1988_CHUNK) + 1
  console.log(`  Nov 1988 chunk rank: ${novRank || 'NOT IN RESULTS'}`)
  console.log('\n  Top 16:')
  for (let i = 0; i < Math.min(16, rows2.length); i++) {
    const r = rows2[i]
    const isTarget = r.chunk_id === NOV1988_CHUNK ? ' <-- TARGET' : ''
    const vec = (r.vector_score ?? r.combined_score ?? 0).toFixed(3)
    const txt = (r.chunk_text ?? '').slice(0, 80).replace(/\n/g, ' ')
    console.log(`    ${String(i + 1).padStart(2)}. score=${vec} chunk=${(r.chunk_id as string).slice(0, 8)} p${r.page_number} "${txt}..."${isTarget}`)
  }
}
main().catch(console.error)
