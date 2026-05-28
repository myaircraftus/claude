/**
 * retrieval-eval-discover.ts
 *
 * Phase 1: find direct-chunking docs in the DB + sample their canonical
 * chunks. Read-only. No LLM calls. Output → .tmp/retrieval-eval-discover.json
 *
 * Identifies docs where canonical_document_chunks.metadata_json.source =
 * 'direct_chunking' so we can target the new pipeline (vs legacy
 * OCR-segment-promoted chunks) for the accuracy eval.
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

interface DocSummary {
  document_id: string
  organization_id: string
  aircraft_id: string | null
  title: string | null
  doc_type: string | null
  total_chunks: number
  canonical_chunks: number
  family_distribution: Record<string, number>
  sample_chunks: Array<{
    id: string
    chunk_kind: string | null
    page_number: number | null
    section_title: string | null
    text_preview: string
    family_metadata: Record<string, unknown> | null
  }>
}

async function main() {
  console.log('[discover] finding direct-chunking canonical chunks...')

  // Page through canonical_document_chunks looking for source='direct_chunking'.
  // Postgrest JSON filter syntax: metadata_json->>source eq direct_chunking
  const { data: chunks, error } = await supabase
    .from('canonical_document_chunks')
    .select(
      'id, document_id, organization_id, aircraft_id, page_number, section_title, chunk_text, metadata_json',
    )
    .eq('metadata_json->>source', 'direct_chunking')
    .limit(5000)

  if (error) {
    console.error('[discover] query failed:', error)
    process.exit(1)
  }

  console.log(`[discover] found ${chunks?.length ?? 0} direct-chunking canonical chunks`)
  if (!chunks || chunks.length === 0) {
    console.log('[discover] no direct-chunking docs yet. Re-ingest something via the new pipeline first.')
    process.exit(0)
  }

  // Group by document_id
  const byDoc = new Map<string, typeof chunks>()
  for (const c of chunks) {
    const arr = byDoc.get(c.document_id) ?? []
    arr.push(c)
    byDoc.set(c.document_id, arr)
  }
  console.log(`[discover] across ${byDoc.size} documents`)

  // Fetch document metadata + chunk counts for each
  const docIds = [...byDoc.keys()]
  const { data: docRows } = await supabase
    .from('documents')
    .select('id, title, doc_type, organization_id, aircraft_id, created_at')
    .in('id', docIds)

  const docMeta = new Map<string, any>()
  for (const d of docRows ?? []) docMeta.set(d.id, d)

  // For each doc: sample 5 substantive canonical chunks
  const summaries: DocSummary[] = []
  for (const [docId, docChunks] of byDoc) {
    const meta = docMeta.get(docId) ?? {}
    // Filter to chunks with real text (>50 chars, not pure boilerplate)
    const substantive = docChunks
      .filter((c) => (c.chunk_text ?? '').length > 60)
      .filter((c) => {
        const kind = (c.metadata_json as any)?.chunk_kind
        return kind !== 'ignore_block' && kind !== 'header_template_block'
      })

    const family_distribution: Record<string, number> = {}
    for (const c of docChunks) {
      const fam = (c.metadata_json as any)?.family ?? 'unknown'
      family_distribution[fam] = (family_distribution[fam] ?? 0) + 1
    }

    // Pick samples — first, middle, last + 2 random substantive
    const samples: typeof substantive = []
    if (substantive.length > 0) {
      samples.push(substantive[0])
      if (substantive.length > 2) samples.push(substantive[Math.floor(substantive.length / 2)])
      if (substantive.length > 1) samples.push(substantive[substantive.length - 1])
      // Two random
      for (let i = 0; i < 2 && samples.length < 5; i++) {
        const idx = Math.floor(Math.random() * substantive.length)
        const candidate = substantive[idx]
        if (!samples.includes(candidate)) samples.push(candidate)
      }
    }

    summaries.push({
      document_id: docId,
      organization_id: meta.organization_id ?? null,
      aircraft_id: meta.aircraft_id ?? null,
      title: meta.title ?? null,
      doc_type: meta.doc_type ?? null,
      total_chunks: docChunks.length,
      canonical_chunks: docChunks.length, // all of these ARE canonical
      family_distribution,
      sample_chunks: samples.map((s) => ({
        id: s.id,
        chunk_kind: (s.metadata_json as any)?.chunk_kind ?? null,
        page_number: s.page_number,
        section_title: s.section_title,
        text_preview: (s.chunk_text ?? '').slice(0, 400),
        family_metadata: (s.metadata_json as any)?.family_metadata ?? null,
      })),
    })
  }

  // Sort largest doc first
  summaries.sort((a, b) => b.total_chunks - a.total_chunks)

  // Write output
  const out = {
    discovered_at: new Date().toISOString(),
    total_direct_chunking_chunks: chunks.length,
    total_docs: summaries.length,
    docs: summaries,
  }

  try {
    mkdirSync('.tmp', { recursive: true })
  } catch {}
  const outPath = '.tmp/retrieval-eval-discover.json'
  writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log(`[discover] wrote ${outPath}`)

  // Quick console summary
  console.log('\n─── Direct-chunking docs ───')
  for (const s of summaries) {
    const families = Object.entries(s.family_distribution)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')
    console.log(
      `  ${s.document_id.slice(0, 8)} | ${s.doc_type ?? '?'} | ` +
        `${s.total_chunks} chunks | ${families} | "${s.title ?? '?'}"`,
    )
  }
}

main().catch((err) => {
  console.error('[discover] fatal:', err)
  process.exit(1)
})
