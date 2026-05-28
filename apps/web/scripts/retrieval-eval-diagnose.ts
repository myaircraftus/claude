/**
 * Why did retrieval miss every target chunk? Check:
 *   1. Do the target chunks have canonical embeddings at all?
 *   2. What docs are the OTHER retrieved chunks coming from?
 *   3. What's the embeddings state for our target doc vs the rest?
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const TARGET_DOC = '03e526e8-7c9b-4bba-873a-c7ac4c606f4c'

const targetChunkIds = [
  'bc19fddb-7448-49f7-9429-6e5103ac54e8',
  'ecf59dab-a209-4652-bbcc-30f69d3d2a4a',
  'de1359a3-0691-405c-b5b5-d24ad38419b2',
  '974fecf8-a82b-42e2-8a95-44ebeea4b74b',
  'd422d949-4f7c-49fa-b6e4-d37157090f2e',
]

const retrievedChunkIds = [
  '4b1082dd-4a39-4b5e-81f0-ea1cf5acf668',
  'db90d1fd-a3aa-429c-9619-1971ff15e775',
  'd536856c-13c4-4731-8887-be6f854df2a4',
]

async function main() {
  // 1. Do target chunks have embeddings?
  console.log('─── 1. Target chunk embeddings ───')
  const { data: targetEmb } = await supabase
    .from('canonical_document_embeddings')
    .select('chunk_id')
    .in('chunk_id', targetChunkIds)
  console.log(`  target chunks with embeddings: ${targetEmb?.length ?? 0} / ${targetChunkIds.length}`)

  // Same check via canonical_document_chunks join
  const { data: targetChunks } = await supabase
    .from('canonical_document_chunks')
    .select('id, document_id, organization_id, aircraft_id, page_number, chunk_text, context_text')
    .in('id', targetChunkIds)
  console.log(`  target chunks found: ${targetChunks?.length ?? 0}`)
  for (const c of targetChunks ?? []) {
    const hasCtx = c.context_text ? 'YES' : 'NO'
    console.log(
      `    ${c.id.slice(0, 8)} | doc=${c.document_id.slice(0, 8)} | org=${(c.organization_id as string)?.slice(0, 8) ?? '?'} | ` +
        `ac=${(c.aircraft_id as string)?.slice(0, 8) ?? 'NULL'} | p${c.page_number} | ctx=${hasCtx}`,
    )
  }

  // 2. Where are the retrieved chunks from?
  console.log('\n─── 2. Retrieved (top-3) chunk origins ───')
  const { data: retr } = await supabase
    .from('canonical_document_chunks')
    .select('id, document_id, organization_id, aircraft_id, page_number, chunk_text, documents:document_id(title, doc_type)')
    .in('id', retrievedChunkIds)
  for (const c of retr ?? []) {
    const doc = Array.isArray(c.documents) ? c.documents[0] : c.documents
    console.log(
      `  ${c.id.slice(0, 8)} | doc=${c.document_id.slice(0, 8)} (${(doc as any)?.title ?? '?'}) | ` +
        `ac=${(c.aircraft_id as string)?.slice(0, 8) ?? 'NULL'} | p${c.page_number} | "${(c.chunk_text as string)?.slice(0, 80)}..."`,
    )
  }

  // 3. Doc-level overview
  console.log('\n─── 3. Doc 03e526e8 in documents table ───')
  const { data: doc } = await supabase
    .from('documents')
    .select('id, title, doc_type, organization_id, aircraft_id, parsing_status, created_at')
    .eq('id', TARGET_DOC)
    .maybeSingle()
  console.log(' ', doc ?? '(not found)')

  // 4. All canonical chunks for the target doc — how many have embeddings vs context_text
  const { data: allChunks } = await supabase
    .from('canonical_document_chunks')
    .select('id')
    .eq('document_id', TARGET_DOC)
  const ids = (allChunks ?? []).map((c) => c.id)
  const { data: embRows } = await supabase
    .from('canonical_document_embeddings')
    .select('chunk_id')
    .in('chunk_id', ids)
  const { data: ctxRows } = await supabase
    .from('canonical_document_chunks')
    .select('id, context_text')
    .eq('document_id', TARGET_DOC)
  const withCtx = (ctxRows ?? []).filter((c) => c.context_text != null).length
  console.log(`\n─── 4. Doc-wide coverage ───`)
  console.log(`  canonical_document_chunks: ${ids.length}`)
  console.log(`  canonical_document_embeddings: ${embRows?.length ?? 0}`)
  console.log(`  context_text populated: ${withCtx}`)

  // 5. Try the search_canonical_documents RPC directly with a known query
  console.log(`\n─── 5. Test RPC search_canonical_documents directly ───`)
  // Use the org's own embedding space — manually craft a small embedding and call.
  // Easier: just count how many of the doc's chunks the RPC would consider candidate
  // (i.e. how many embeddings exist scoped to the doc's org).
  if (doc?.organization_id) {
    const { count } = await supabase
      .from('canonical_document_embeddings')
      .select('chunk_id', { count: 'exact', head: true })
      .eq('organization_id', doc.organization_id)
    console.log(`  total canonical_document_embeddings for org ${(doc.organization_id as string).slice(0, 8)}: ${count}`)
  }
}

main().catch(console.error)
