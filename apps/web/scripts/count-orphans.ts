import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '.env.local') })

async function main() {
  const s = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // Supabase has a default 1000-row cap — page through to get them all.
  const allDocIds: string[] = []
  let offset = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await s
      .from('canonical_document_chunks')
      .select('document_id')
      .range(offset, offset + PAGE - 1)
    if (error) {
      console.error('page error', error)
      break
    }
    if (!data || data.length === 0) break
    for (const r of data) allDocIds.push(r.document_id as string)
    offset += PAGE
    if (data.length < PAGE) break
  }
  console.log('total chunk rows scanned:', allDocIds.length)
  const chunks = allDocIds.map((id) => ({ document_id: id }))

  const uniq = [...new Set((chunks ?? []).map((c) => c.document_id))]
  const { data: docs } = await s.from('documents').select('id').in('id', uniq)
  const docIds = new Set((docs ?? []).map((d) => d.id))
  const orphans = uniq.filter((id) => !docIds.has(id))
  const orphChunks = (chunks ?? []).filter(
    (c) => !docIds.has(c.document_id as string),
  )

  console.log('distinct doc_ids in canonical chunks:', uniq.length)
  console.log('found in documents:', docIds.size)
  console.log('orphan document_ids:', orphans.length)
  console.log('total orphan canonical chunks:', orphChunks.length)
  if (orphans.length > 0) {
    console.log('orphan examples:')
    for (const id of orphans.slice(0, 10)) console.log(' ', id)
  }
}
main().catch(console.error)
