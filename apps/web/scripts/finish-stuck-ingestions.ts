/**
 * Recover documents stuck mid-pipeline.
 *
 * Two recovery paths:
 *
 * (A) Stuck at "embedding" status — chunks exist, embeddings don't.
 *     We pull the chunk_text rows, batch-embed via OpenAI, insert into
 *     document_embeddings, and flip parsing_status to "completed".
 *
 * (B) Stuck at "ocr_processing" / "parsing" status — no chunks at all.
 *     We re-trigger the ingest-document Trigger.dev task so the parser
 *     service or inline OCR fallback gets a fresh attempt.
 *
 * Run from apps/web with:
 *   ../../node_modules/.bin/tsx scripts/finish-stuck-ingestions.ts
 *
 * Idempotent — safe to run multiple times.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
try {
  const env = readFileSync(resolve(__dirname, '../.env.local'), 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
} catch {}

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const OPENAI_KEY = process.env.OPENAI_API_KEY!
const EMBED_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large'
const HORIZON_ORG_ID = '82042eee-1d20-49a4-be12-12f73e335392'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE)
const openai = new OpenAI({ apiKey: OPENAI_KEY })

const BATCH_SIZE = 16

async function embedDocument(docId: string, fileName: string) {
  console.log(`\n[${fileName}] Embedding stuck doc...`)

  // Pull chunks needing embeddings
  const { data: chunks, error } = await supabase
    .from('document_chunks')
    .select('id, chunk_text, organization_id, aircraft_id')
    .eq('document_id', docId)
    .order('chunk_index', { ascending: true })

  if (error) {
    console.error(`  ERROR fetching chunks:`, error.message)
    return false
  }
  if (!chunks || chunks.length === 0) {
    console.log(`  no chunks — skipping`)
    return false
  }

  // Skip chunks that already have embeddings
  const { data: existing } = await supabase
    .from('document_embeddings')
    .select('chunk_id')
    .eq('document_id', docId)
  const haveEmbed = new Set((existing ?? []).map((r) => r.chunk_id as string))
  const todo = chunks.filter((c) => !haveEmbed.has(c.id))
  console.log(`  ${chunks.length} chunks total, ${todo.length} need embeddings`)

  if (todo.length === 0) {
    // Already complete — just flip the status
    await markCompleted(docId)
    return true
  }

  // Embed in batches
  let processed = 0
  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE)
    const inputs = batch.map((c) => (c.chunk_text ?? '').slice(0, 8000))

    let resp
    try {
      // Production stores 1536-dim vectors. text-embedding-3-large defaults to
      // 3072 — pass dimensions: 1536 to match the column shape.
      resp = await openai.embeddings.create({
        model: EMBED_MODEL,
        input: inputs,
        dimensions: 1536,
      })
    } catch (err: any) {
      console.error(`  OpenAI embed batch ${i} failed:`, err.message)
      continue
    }

    const rows = batch.map((c, idx) => ({
      chunk_id: c.id,
      document_id: docId,
      organization_id: c.organization_id,
      aircraft_id: c.aircraft_id,
      embedding_model: EMBED_MODEL,
      embedding: resp.data[idx].embedding as unknown as string,
    }))

    const { error: insErr } = await supabase
      .from('document_embeddings')
      .upsert(rows, { onConflict: 'chunk_id' })

    if (insErr) {
      console.error(`  insert error at batch ${i}:`, insErr.message)
      continue
    }
    processed += batch.length
    process.stdout.write(`  batch ${i / BATCH_SIZE + 1} ✓ (${processed}/${todo.length})\r`)
  }
  console.log(`\n  Inserted ${processed} embeddings`)

  if (processed === todo.length) {
    await markCompleted(docId)
    return true
  }
  console.log(`  partial — leaving status unchanged for retry`)
  return false
}

async function markCompleted(docId: string) {
  const { error } = await supabase
    .from('documents')
    .update({
      parsing_status: 'completed',
      parse_completed_at: new Date().toISOString(),
      parse_error: null,
    })
    .eq('id', docId)
  if (error) console.error(`  status update error:`, error.message)
  else console.log(`  → status: completed`)
}

/**
 * Run the production inline ingestion path locally for a single document.
 * Uses the same ingestDocumentInline function the /api/upload route calls,
 * so the chunking, OCR fallback, and embedding logic stays identical to the
 * production hot path — we just bypass Trigger.dev (which has a placeholder
 * key in this environment) and the broken parser service URL.
 */
async function runInlineIngestion(docId: string, fileName: string) {
  console.log(`\n[${fileName}] Running inline ingestion locally...`)
  // Reset state so the function sees a fresh start
  await supabase
    .from('documents')
    .update({
      parsing_status: 'queued',
      parse_started_at: null,
      parse_completed_at: null,
      parse_error: null,
    })
    .eq('id', docId)

  try {
    // Dynamic import so the script doesn't fail to load when the trigger.dev
    // SDK can't initialise (it tries to read TRIGGER_SECRET_KEY at import time
    // in some envs). We've already set up env above.
    const mod = await import('../lib/ingestion/server')
    const result = await mod.ingestDocumentInline(docId)
    console.log(`  → ${result.status}${result.warning ? ` (${result.warning})` : ''}`)
    return result.status === 'completed'
  } catch (err: any) {
    console.error(`  inline ingestion threw:`, err.message ?? err)
    await supabase
      .from('documents')
      .update({
        parsing_status: 'failed',
        parse_error: String(err.message ?? err).slice(0, 500),
      })
      .eq('id', docId)
    return false
  }
}

async function main() {
  console.log('=== Finishing stuck ingestions ===')

  // Limit can be set via CLI: --limit=3 to process the smallest-first batch
  const onlyDocId = process.argv.find((a) => a.startsWith('--id='))?.slice(5)
  const limit = parseInt(process.argv.find((a) => a.startsWith('--limit='))?.slice(8) ?? '50', 10)

  let query = supabase
    .from('documents')
    .select('id, file_name, parsing_status, page_count')
    .eq('organization_id', HORIZON_ORG_ID)
    .not('parsing_status', 'in', '("completed","failed")')
  if (onlyDocId) query = query.eq('id', onlyDocId)
  // Smallest first so we get quick feedback before tackling 300+ page docs
  const { data: stuckDocs, error } = await query
    .order('page_count', { ascending: true, nullsFirst: false })
    .limit(limit)

  if (error) {
    console.error('list error:', error.message)
    return
  }
  if (!stuckDocs || stuckDocs.length === 0) {
    console.log('No stuck docs found')
    return
  }

  console.log(`Found ${stuckDocs.length} stuck documents`)

  for (const doc of stuckDocs) {
    if (doc.parsing_status === 'embedding') {
      await embedDocument(doc.id, doc.file_name)
    } else if (
      doc.parsing_status === 'ocr_processing' ||
      doc.parsing_status === 'parsing' ||
      doc.parsing_status === 'queued' ||
      doc.parsing_status === 'chunking' ||
      doc.parsing_status === 'needs_ocr'
    ) {
      // Also try to embed — the chunks may already exist if a previous run
      // got that far. embedDocument no-ops if there are no chunks.
      const { count } = await supabase
        .from('document_chunks')
        .select('id', { count: 'exact', head: true })
        .eq('document_id', doc.id)
      if (count && count > 0) {
        console.log(`\n[${doc.file_name}] Has ${count} chunks despite ${doc.parsing_status} state — embedding now`)
        await embedDocument(doc.id, doc.file_name)
      } else {
        await runInlineIngestion(doc.id, doc.file_name)
      }
    }
  }

  console.log('\n=== Done ===')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
