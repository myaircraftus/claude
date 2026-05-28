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
  const targets = [
    {
      id: 'ecf59dab-a209-4652-bbcc-30f69d3d2a4a',
      label: 'John M. Craig signoff (Dec 3 1984)',
    },
    {
      id: 'de1359a3-0691-405c-b5b5-d24ad38419b2',
      label: 'Nov 24 1988 maintenance entry',
    },
  ]
  for (const t of targets) {
    const { data } = await s
      .from('canonical_document_chunks')
      .select('id, page_number, chunk_text, context_text, metadata_json')
      .eq('id', t.id)
      .maybeSingle()
    if (!data) {
      console.log('NOT FOUND', t.id)
      continue
    }
    const d = data as any
    console.log(`\n=== ${t.label} (${t.id.slice(0, 8)} p${d.page_number}) ===`)
    console.log('chunk_kind:', d.metadata_json?.chunk_kind)
    console.log('family_metadata:', JSON.stringify(d.metadata_json?.family_metadata, null, 2))
    console.log('chunk_text:')
    console.log('  ' + (d.chunk_text || '').slice(0, 500).replace(/\n/g, ' / '))
    console.log('context_text:')
    for (const line of (d.context_text || '').split('\n')) {
      console.log('  ' + line)
    }
  }
}
main().catch(console.error)
