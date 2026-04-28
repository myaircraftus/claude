/**
 * GET /api/cron/heal-ingestions
 *
 * Self-healing cron for the document ingestion pipeline.
 *
 * Uploads sometimes leave a document stuck mid-pipeline:
 *   - Vercel function timed out partway through OCR (parsing_status=ocr_processing, 0 chunks)
 *   - Trigger.dev / parser service was unreachable when /api/upload tried to enqueue
 *   - The embedding step failed after chunks were created (parsing_status=embedding,
 *     chunks > 0, embeddings = 0)
 *
 * This endpoint scans the docs table for any row in a non-terminal state older
 * than HEAL_AFTER_MINUTES, and re-runs ingestDocumentInline. The inline path
 * has a Document AI / Textract / Tesseract OCR fallback so it works without
 * the optional parser-service or Trigger.dev infrastructure.
 *
 * Wired in vercel.json crons to fire every 5 minutes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { ingestDocumentInline } from '@/lib/ingestion/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // Vercel default; ingestion is bounded per-doc

const HEAL_AFTER_MINUTES = 10
// Limit per run so a single cron tick doesn't try to OCR a 400-page logbook +
// 10 other docs and timeout. The next tick picks up whatever's still stuck.
const MAX_DOCS_PER_RUN = 3

const STUCK_STATES = ['parsing', 'ocr_processing', 'embedding', 'pending']

interface StuckDoc {
  id: string
  file_name: string | null
  parsing_status: string
  organization_id: string
  parse_started_at: string | null
  updated_at: string
}

function authorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  // No secret set = open (dev). In production CRON_SECRET should be set.
  if (!cronSecret) return true
  const auth = req.headers.get('authorization') ?? ''
  // Vercel cron sends `Authorization: Bearer <CRON_SECRET>`
  return auth === `Bearer ${cronSecret}`
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceSupabase()
  const cutoffIso = new Date(Date.now() - HEAL_AFTER_MINUTES * 60 * 1000).toISOString()

  const { data: stuck, error } = await supabase
    .from('documents')
    .select('id, file_name, parsing_status, organization_id, parse_started_at, updated_at')
    .in('parsing_status', STUCK_STATES)
    .lt('updated_at', cutoffIso)
    // Smallest first via page_count nulls last (a null page_count usually
    // means parsing never finished extracting metadata, not a huge file).
    .order('page_count', { ascending: true, nullsFirst: false })
    .limit(MAX_DOCS_PER_RUN)

  if (error) {
    console.error('[cron/heal-ingestions] list error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!stuck || stuck.length === 0) {
    return NextResponse.json({ ok: true, healed: 0, scanned: 0 })
  }

  const results: Array<{
    id: string
    file_name: string | null
    organization_id: string
    previous_status: string
    result_status: string
    warning?: string
    error?: string
  }> = []

  for (const doc of stuck as StuckDoc[]) {
    try {
      // Reset row to fresh-start state so the inline pipeline doesn't trip on
      // half-written progress artifacts from the previous failed attempt.
      await supabase
        .from('documents')
        .update({
          parsing_status: 'pending',
          parse_started_at: null,
          parse_completed_at: null,
          parse_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', doc.id)

      const ingestResult = await ingestDocumentInline(doc.id)
      results.push({
        id: doc.id,
        file_name: doc.file_name,
        organization_id: doc.organization_id,
        previous_status: doc.parsing_status,
        result_status: ingestResult.status,
        warning: ingestResult.warning,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[cron/heal-ingestions] failed ${doc.id}`, message)
      // Mark failed so it doesn't keep getting picked up forever; user can
      // still retry manually via /api/documents/[id]/retry.
      await supabase
        .from('documents')
        .update({
          parsing_status: 'failed',
          parse_error: message.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq('id', doc.id)
      results.push({
        id: doc.id,
        file_name: doc.file_name,
        organization_id: doc.organization_id,
        previous_status: doc.parsing_status,
        result_status: 'failed',
        error: message.slice(0, 200),
      })
    }
  }

  const healed = results.filter((r) => r.result_status === 'completed').length
  return NextResponse.json({
    ok: true,
    scanned: results.length,
    healed,
    results,
  })
}
