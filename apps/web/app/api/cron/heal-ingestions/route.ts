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
// 800s is the Pro-plan ceiling on Vercel Fluid Compute. We need this for the
// occasional 200+ page handwritten binder that goes through 25-30 OCR batches
// — anything less and the cron repeatedly times out and the doc stays stuck.
export const maxDuration = 800

// Aggressive: a doc that hasn't moved in 6 minutes is almost certainly
// wedged. The user-side /api/documents/heal endpoint catches stuck docs
// at the 5-minute mark when the user is actively looking; this cron is the
// safety net for everyone else (e.g. uploaded right before a tab close).
const HEAL_AFTER_MINUTES = 6
// Limit per run so a single cron tick doesn't try to OCR a 400-page logbook +
// 10 other docs and timeout. The next tick picks up whatever's still stuck.
// Bumped from 3 → 5 because retries run reasonably fast (1-3 min each on
// digital-text PDFs; the slow-OCR cases get re-stuck and picked up next tick).
const MAX_DOCS_PER_RUN = 5

// Active in-progress states. Anything in these states for >= HEAL_AFTER_MINUTES
// is genuinely wedged and should be retried.
//
// NOTE: 'needs_ocr' is intentionally EXCLUDED. needs_ocr means the OCR run
// completed but produced low-confidence content awaiting human review — the
// chunks + embeddings are already in place. Re-running it would delete real
// work and start over from scratch, which we did once by accident on N89114.
// Users decide what to do with needs_ocr docs via the UI.
const STUCK_STATES = ['queued', 'parsing', 'chunking', 'ocr_processing', 'embedding']

// Transient failure patterns the user shouldn't have to click "Retry" for.
// We auto-recover any 'failed' row whose parse_error matches one of these,
// up to TRANSIENT_FAILURE_RETRY_LIMIT total attempts. Hard-config errors
// (invalid file, missing OCR keys, oversized PDF) deliberately don't match
// here so we don't loop forever on a doc that genuinely can't be ingested.
const TRANSIENT_ERROR_PATTERNS: RegExp[] = [
  /429/i, // OpenAI rate limit / quota exhausted
  /quota/i,
  /rate[- ]?limit/i,
  /timed out/i,
  /timeout/i,
  /canceling statement due to statement timeout/i,
  /duplicate key value/i, // ocr_page_jobs / document_pages unique-violation race
  /Failed to download PDF .* (?:400|5\d\d)/, // transient storage hiccup
  /Failed to clear OCR entry segments/i,
  /Failed to clear document chunks/i,
  /503/, // service unavailable
  /504/, // gateway timeout
  /ECONNRESET|ETIMEDOUT|EAI_AGAIN/, // node fetch transient errors
]
// Cap attempts via processing_state.heal_attempts so we don't bounce a
// genuinely unfixable doc forever.
const TRANSIENT_FAILURE_RETRY_LIMIT = 4

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

  // Pull stuck (in-progress) docs older than the cutoff.
  const { data: stuckInProgress, error: stuckErr } = await supabase
    .from('documents')
    .select('id, file_name, parsing_status, organization_id, parse_started_at, updated_at, parse_error, processing_state')
    .in('parsing_status', STUCK_STATES)
    .lt('updated_at', cutoffIso)
    .order('page_count', { ascending: true, nullsFirst: false })
    .limit(MAX_DOCS_PER_RUN)

  if (stuckErr) {
    console.error('[cron/heal-ingestions] list error (in-progress)', stuckErr)
    return NextResponse.json({ error: stuckErr.message }, { status: 500 })
  }

  // ALSO pull failed docs whose error text matches a transient pattern,
  // so the user never has to click Retry on a 429 / timeout / duplicate-key
  // / cleanup-timeout — the cron just retries them automatically.
  // We cap how many times we'll do this via processing_state.heal_attempts
  // so a genuinely unfixable doc doesn't loop forever.
  const { data: failedTransient, error: failedErr } = await supabase
    .from('documents')
    .select('id, file_name, parsing_status, organization_id, parse_started_at, updated_at, parse_error, processing_state')
    .eq('parsing_status', 'failed')
    .not('parse_error', 'is', null)
    .lt('updated_at', cutoffIso)
    .order('updated_at', { ascending: true })
    .limit(MAX_DOCS_PER_RUN * 2)

  if (failedErr) {
    console.error('[cron/heal-ingestions] list error (failed)', failedErr)
  }

  type StuckDocPlus = StuckDoc & { parse_error?: string | null; processing_state?: any }
  const stuck: StuckDocPlus[] = [...((stuckInProgress as StuckDocPlus[] | null) ?? [])]

  for (const doc of (failedTransient as StuckDocPlus[] | null) ?? []) {
    const err = doc.parse_error ?? ''
    if (!TRANSIENT_ERROR_PATTERNS.some((rx) => rx.test(err))) continue
    const attempts =
      (doc.processing_state &&
        typeof doc.processing_state === 'object' &&
        typeof (doc.processing_state as any).heal_attempts === 'number')
        ? (doc.processing_state as any).heal_attempts
        : 0
    if (attempts >= TRANSIENT_FAILURE_RETRY_LIMIT) continue
    stuck.push(doc)
    if (stuck.length >= MAX_DOCS_PER_RUN) break
  }

  if (stuck.length === 0) {
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

  for (const doc of stuck) {
    const previousState =
      doc.processing_state && typeof doc.processing_state === 'object'
        ? (doc.processing_state as Record<string, any>)
        : {}
    const previousAttempts =
      typeof previousState.heal_attempts === 'number' ? previousState.heal_attempts : 0

    try {
      // Reset row to fresh-start state but track heal_attempts in
      // processing_state so we can give up after TRANSIENT_FAILURE_RETRY_LIMIT
      // tries on a genuinely-broken doc.
      await supabase
        .from('documents')
        .update({
          parsing_status: 'queued',
          parse_started_at: null,
          parse_completed_at: null,
          parse_error: null,
          processing_state: {
            ...previousState,
            heal_attempts: previousAttempts + 1,
            last_heal_at: new Date().toISOString(),
          },
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
      // Mark failed — the next cron tick will pick it up again if the error
      // matches TRANSIENT_ERROR_PATTERNS and we haven't exceeded the retry
      // cap. Otherwise it stays failed and the user can decide.
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
