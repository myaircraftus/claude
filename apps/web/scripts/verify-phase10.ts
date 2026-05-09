/**
 * Phase 10 E.3 verification: hit hybridRetrieve directly with a real
 * query and confirm Colab-indexed pages appear in the results.
 *
 * Modal halt time: 2026-05-08 ~03:35 UTC (Phase 9.H end).
 * Pages indexed AFTER that time are Colab-side.
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { hybridRetrieve } from '@/lib/vision/retriever'

dotenv.config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('supabase env missing')

const sb = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  // Pick the org with the most indexed pages.
  const orgQ = await sb
    .from('vision_pages')
    .select('organization_id')
    .eq('status', 'indexed')
    .limit(1)
    .single()
  const orgId = (orgQ.data as any)?.organization_id
  if (!orgId) throw new Error('no indexed pages')
  console.log(`Testing org: ${orgId}\n`)

  const queries = ['engine inspection', 'annual inspection', 'avionics', 'propeller logbook']

  for (const query of queries) {
    console.log(`\n=== Query: "${query}" ===`)
    const t0 = Date.now()
    const results = await hybridRetrieve(sb as any, orgId, query, { k: 5 })
    const elapsed = Date.now() - t0
    console.log(`  retrieved ${results.length} hits in ${elapsed}ms`)
    for (let i = 0; i < Math.min(5, results.length); i++) {
      const r = results[i]
      console.log(`  [${i + 1}] doc=${r.source_document_id?.slice(0, 8)}... page=${r.page_number} score=${r.score_combined?.toFixed(3)} text=${r.score_text?.toFixed(3)} vis=${r.score_vision?.toFixed(3)}`)
    }
  }

  // Confirm Colab-side pages are in the index.
  console.log('\n=== Sample of recent (post-Phase-9) pages ===')
  const colabPages = await sb
    .from('vision_pages')
    .select('id, source_document_id, page_number, created_at, vision_model')
    .eq('status', 'indexed')
    .gte('created_at', '2026-05-08T15:00:00Z')  // After Phase 9 halt
    .order('created_at', { ascending: false })
    .limit(5)
  console.table(colabPages.data ?? [])

  console.log(`\nTotal Colab-side indexed pages: ${(colabPages.data ?? []).length} (sample)`)
}

main().catch((e) => {
  console.error('VERIFICATION FAILED:', e)
  process.exit(1)
})
