/**
 * Test search_canonical_documents RPC directly to see if our target chunks
 * are returned at all.
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

const TARGET_DOC = '03e526e8-7c9b-4bba-873a-c7ac4c606f4c'
const ORG_ID = '82042eee-1d20-49a4-be12-12f73e335392'
const AIRCRAFT_ID = '1ee40686-666c-4fd8-9bbd-b1ba44be4732'

async function main() {
  // Embed a query that should hit our target chunks
  const text = 'Charles A. Brown 100 hour inspection 1985 A&P certificate'
  const [emb] = await generateEmbeddings([{ id: 'q', text }])

  console.log('─── RPC test ───')
  console.log('  query:', text)
  console.log('  org:', ORG_ID.slice(0, 8))
  console.log()

  // 1. Org-wide, no aircraft filter
  console.log('1. Org-wide (no aircraft filter):')
  let { data, error } = await s.rpc('search_canonical_documents', {
    p_organization_id: ORG_ID,
    p_aircraft_id: null,
    p_query_embedding: emb.embedding,
    p_query_text: text,
    p_doc_type_filter: null,
    p_limit: 50,
  })
  if (error) {
    console.log('  RPC error:', error.message)
  } else {
    const rows = (data ?? []) as Array<any>
    console.log(`  returned: ${rows.length} chunks`)
    const fromTarget = rows.filter((r) => r.document_id === TARGET_DOC)
    console.log(`  from target doc 03e526e8: ${fromTarget.length}`)
    console.log('  top 10 doc_ids:')
    for (const r of rows.slice(0, 10)) {
      console.log(
        `    doc=${(r.document_id as string)?.slice(0, 8)} chunk=${(r.chunk_id as string)?.slice(0, 8)} page=${r.page_number} score=${r.vector_score?.toFixed?.(3) ?? r.combined_score?.toFixed?.(3) ?? '?'}`,
      )
    }
  }

  console.log()
  console.log(`2. Aircraft-scoped (${AIRCRAFT_ID.slice(0, 8)}):`)
  const r2 = await s.rpc('search_canonical_documents', {
    p_organization_id: ORG_ID,
    p_aircraft_id: AIRCRAFT_ID,
    p_query_embedding: emb.embedding,
    p_query_text: text,
    p_doc_type_filter: null,
    p_limit: 50,
  })
  if (r2.error) {
    console.log('  RPC error:', r2.error.message)
  } else {
    const rows = (r2.data ?? []) as Array<any>
    console.log(`  returned: ${rows.length} chunks`)
    const fromTarget = rows.filter((r) => r.document_id === TARGET_DOC)
    console.log(`  from target doc: ${fromTarget.length}`)
    console.log('  top 10:')
    for (const r of rows.slice(0, 10)) {
      console.log(
        `    doc=${(r.document_id as string)?.slice(0, 8)} chunk=${(r.chunk_id as string)?.slice(0, 8)} page=${r.page_number} score=${r.vector_score?.toFixed?.(3) ?? r.combined_score?.toFixed?.(3) ?? '?'}`,
      )
    }
  }
}
main().catch(console.error)
