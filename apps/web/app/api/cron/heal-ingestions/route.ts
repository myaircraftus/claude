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
import { isTransientIngestionFailure } from '@/lib/ingestion/failure-classifier'

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

// Transient vs permanent classification lives in the shared classifier
// (lib/ingestion/failure-classifier.ts) so the cron, the UI heal endpoint,
// and the ingestion-failures log all agree on what's recoverable.
//
// The retry CAP is now read from the app_settings table so the operator
// can change it from /admin/settings without a redeploy. Default = 1
// (smart_once) so we never burn double-credit on a bad doc by accident.
const DEFAULT_RETRY_LIMIT = 1

async function loadAutoRetrySettings(supabase: any) {
  // Env var ALWAYS wins as a hard kill switch (operator can flip without
  // touching the DB). Otherwise read the runtime setting.
  if ((process.env.INGESTION_AUTO_RETRY ?? '').toLowerCase() === 'off') {
    return { mode: 'off' as const, limit: 0 }
  }
  const { data } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['ingestion_auto_retry', 'ingestion_auto_retry_limit'])
  const byKey = new Map<string, any>(((data ?? []) as Array<{ key: string; value: any }>).map((r) => [r.key, r.value]))
  const rawMode = byKey.get('ingestion_auto_retry')
  const rawLimit = byKey.get('ingestion_auto_retry_limit')
  const mode = rawMode === 'on' || rawMode === 'smart_once' ? rawMode : 'off'
  const limit = typeof rawLimit === 'number' ? Math.max(0, Math.min(10, rawLimit)) : DEFAULT_RETRY_LIMIT
  return { mode, limit }
}

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

  // KILL SWITCH — read from app_settings (UI-toggleable) with env-var
  // override. When off, the cron becomes a no-op so we never burn
  // OpenAI / Document AI credit on a runaway loop.
  const autoRetry = await loadAutoRetrySettings(supabase)
  if (autoRetry.mode === 'off') {
    return NextResponse.json({
      ok: true,
      paused: true,
      reason: 'Auto-retry is OFF (set in /admin/settings or via INGESTION_AUTO_RETRY env var)',
      mode: autoRetry.mode,
      scanned: 0,
      healed: 0,
    })
  }
  const TRANSIENT_FAILURE_RETRY_LIMIT = autoRetry.limit
  const cutoffIso = new Date(Date.now() - HEAL_AFTER_MINUTES * 60 * 1000).toISOString()

  // Pull stuck (in-progress) docs older than the cutoff. Already-tried
  // docs (heal_attempt_count >= limit) are excluded at the SQL level so
  // we can't accidentally bounce a bad doc forever.
  const { data: stuckInProgress, error: stuckErr } = await supabase
    .from('documents')
    .select('id, file_name, parsing_status, organization_id, parse_started_at, updated_at, parse_error, processing_state, heal_attempt_count')
    .in('parsing_status', STUCK_STATES)
    .lt('updated_at', cutoffIso)
    .lt('heal_attempt_count', TRANSIENT_FAILURE_RETRY_LIMIT)
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
    .select('id, file_name, parsing_status, organization_id, parse_started_at, updated_at, parse_error, processing_state, heal_attempt_count')
    .eq('parsing_status', 'failed')
    .not('parse_error', 'is', null)
    .lt('updated_at', cutoffIso)
    .lt('heal_attempt_count', TRANSIENT_FAILURE_RETRY_LIMIT)
    .order('updated_at', { ascending: true })
    .limit(MAX_DOCS_PER_RUN * 2)

  if (failedErr) {
    console.error('[cron/heal-ingestions] list error (failed)', failedErr)
  }

  type StuckDocPlus = StuckDoc & {
    parse_error?: string | null
    processing_state?: any
    heal_attempt_count?: number | null
  }
  const stuck: StuckDocPlus[] = [...((stuckInProgress as StuckDocPlus[] | null) ?? [])]

  for (const doc of (failedTransient as StuckDocPlus[] | null) ?? []) {
    if (!isTransientIngestionFailure(doc.parse_error)) continue
    // SQL filter already excluded heal_attempt_count >= limit, so we
    // don't need a second check here.
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
    try {
      // BUMP heal_attempt_count via dedicated column (NOT processing_state JSON,
      // which gets rebuilt by markDocumentProcessingFailed and was wiping our
      // counter). This column is service-role only and ingestion code never
      // touches it.
      await supabase
        .from('documents')
        .update({
          parsing_status: 'queued',
          parse_started_at: null,
          parse_completed_at: null,
          parse_error: null,
          heal_attempt_count: (doc.heal_attempt_count ?? 0) + 1,
          heal_last_attempt_at: new Date().toISOString(),
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
