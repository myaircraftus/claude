/**
 * One-time BM25 index backfill.
 *
 * The per-aircraft and per-org reference BM25 keyword indexes
 * (lib/rag/bm25-index.ts) were never built for the existing corpus —
 * `searchBm25` logs "[bm25] index missing for aircraft …" and returns [], so
 * one of the four retrievers is silently dead and keyword matching (part
 * numbers, AD numbers, tail numbers) does not contribute for those aircraft.
 *
 * This rebuilds every index from document_chunks using the real build
 * functions. Idempotent — safe to re-run; each rebuild is a full snapshot.
 *
 *   cd apps/web && npx tsx scripts/backfill-bm25.ts
 */
import * as dotenv from 'dotenv'
import { createServiceSupabase } from '@/lib/supabase/server'
import { buildBm25Index, buildReferenceBm25Index } from '@/lib/rag/bm25-index'

dotenv.config({ path: '.env.local' })

async function main() {
  const supabase = createServiceSupabase()

  const { data: aircraft, error: acErr } = await supabase
    .from('aircraft')
    .select('id, tail_number, organization_id')
    .order('organization_id', { ascending: true })
  if (acErr) throw new Error(`aircraft query failed: ${acErr.message}`)

  const { data: orgs, error: orgErr } = await supabase.from('organizations').select('id, name')
  if (orgErr) throw new Error(`organizations query failed: ${orgErr.message}`)

  console.log(`[backfill-bm25] ${aircraft?.length ?? 0} aircraft, ${orgs?.length ?? 0} orgs`)

  let acOk = 0
  let acFail = 0
  for (const ac of aircraft ?? []) {
    try {
      const { chunkCount } = await buildBm25Index(ac.id)
      acOk += 1
      console.log(`  aircraft ${ac.tail_number ?? ac.id}: ${chunkCount} chunks indexed`)
    } catch (err) {
      acFail += 1
      console.error(`  aircraft ${ac.tail_number ?? ac.id}: FAILED — ${(err as Error).message}`)
    }
  }

  let refOk = 0
  let refFail = 0
  for (const org of orgs ?? []) {
    try {
      const { chunkCount } = await buildReferenceBm25Index(org.id)
      refOk += 1
      console.log(`  org reference "${org.name ?? org.id}": ${chunkCount} chunks indexed`)
    } catch (err) {
      refFail += 1
      console.error(`  org reference ${org.id}: FAILED — ${(err as Error).message}`)
    }
  }

  console.log(
    `[backfill-bm25] done — aircraft ${acOk} ok / ${acFail} failed; ` +
      `reference ${refOk} ok / ${refFail} failed`,
  )
  if (acFail > 0 || refFail > 0) process.exit(1)
}

main().catch((err) => {
  console.error('[backfill-bm25] FATAL:', err?.stack || err?.message || err)
  process.exit(1)
})
