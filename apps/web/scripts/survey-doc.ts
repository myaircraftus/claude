/**
 * Dump every chunk in doc 03e526e8 with text + chunk_kind + family_metadata
 * so I can build a realistic extended test set.
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const TARGET_DOC = '03e526e8-7c9b-4bba-873a-c7ac4c606f4c'

async function main() {
  const { data: chunks } = await supabase
    .from('canonical_document_chunks')
    .select('id, page_number, chunk_index, chunk_text, context_text, metadata_json')
    .eq('document_id', TARGET_DOC)
    .order('page_number', { ascending: true })
    .order('chunk_index', { ascending: true })

  if (!chunks) {
    console.error('no chunks')
    return
  }
  console.log(`[survey] ${chunks.length} chunks in doc ${TARGET_DOC.slice(0, 8)}`)

  const out: any[] = []
  let lastPage = -1
  for (const c of chunks as any[]) {
    if (c.page_number !== lastPage) {
      console.log(`\n=== Page ${c.page_number} ===`)
      lastPage = c.page_number
    }
    const fm = c.metadata_json?.family_metadata ?? {}
    const summary = {
      id: c.id,
      page: c.page_number,
      kind: c.metadata_json?.chunk_kind,
      date: fm.entry_date_iso,
      mechanic: fm.mechanic_name,
      cert: fm.mechanic_cert,
      tach: fm.tach_time_text,
      ad: fm.ad_references?.length ? fm.ad_references : null,
      parts: fm.part_numbers?.length ? fm.part_numbers : null,
      text: (c.chunk_text ?? '').replace(/\s+/g, ' ').slice(0, 250),
    }
    out.push(summary)
    console.log(
      `  [${(c.id as string).slice(0, 8)}] kind=${summary.kind ?? '?'} date=${summary.date ?? '?'} ` +
        `mech="${summary.mechanic ?? ''}" cert="${summary.cert ?? ''}" tach=${summary.tach ?? '?'}` +
        (summary.ad ? ` AD=[${summary.ad.join(',')}]` : ''),
    )
    console.log(`    text: ${summary.text}`)
  }

  writeFileSync('.tmp/doc-survey-03e526e8.json', JSON.stringify(out, null, 2))
  console.log(`\n[survey] wrote .tmp/doc-survey-03e526e8.json`)
}
main().catch(console.error)
