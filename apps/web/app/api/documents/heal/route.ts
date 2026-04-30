/**
 * POST /api/documents/heal
 *
 * User-org-scoped auto-recovery for stuck document ingestion. Called from
 * the documents UI on page mount — every time the user opens a documents
 * surface, this endpoint:
 *
 *   1. Scans the user's org for documents stuck in any in-progress state
 *      (parsing, ocr_processing, chunking, embedding) for >= STALE_MINUTES.
 *   2. Fires force-retries against the existing /api/documents/[id]/retry
 *      endpoint using PARSER_SERVICE_SECRET — fire-and-forget, capped per
 *      run so the request returns quickly.
 *   3. Returns a summary so the UI can show "Recovering N stuck documents…"
 *      banners if it wants.
 *
 * This is the user-facing complement to the cron-based healer at
 * /api/cron/heal-ingestions. The cron is the safety net (every 5 min);
 * this endpoint makes recovery feel instant — by the time the user finishes
 * scanning the page, the retries are already running.
 *
 * Why a separate endpoint from the cron:
 *   - Cron sees ALL orgs (admin scope) — this is org-scoped.
 *   - User-triggered runs should fire MORE aggressively than the cron
 *     because the user is actively staring at the page.
 *   - Authentication path is different (session cookie vs CRON_SECRET).
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServiceSupabase } from '@/lib/supabase/server'
import { isTransientIngestionFailure } from '@/lib/ingestion/failure-classifier'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// A document is considered "stuck" if it's been in a non-terminal state
// for at least this long without an updated_at touch. Aggressive — UI calls
// this on every mount, so the threshold is low to catch real wedges fast
// without harassing healthy in-flight ingestions.
const STALE_MINUTES = 5

// Per-run cap so the user-triggered call doesn't try to OCR 50 stuck docs
// in one shot. Anything above this still gets picked up by the cron.
const MAX_DOCS_PER_RUN = 6

const STUCK_STATES = ['parsing', 'ocr_processing', 'chunking', 'embedding']

// Transient vs permanent decision lives in the shared classifier
// (lib/ingestion/failure-classifier.ts).

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // KILL SWITCH — same env-var gate as the cron. When INGESTION_AUTO_RETRY
  // is 'off', this endpoint becomes a no-op and the documents page stops
  // burning credits on background retries.
  if ((process.env.INGESTION_AUTO_RETRY ?? 'on').toLowerCase() === 'off') {
    return NextResponse.json({
      ok: true,
      paused: true,
      reason: 'Auto-retry disabled. Use the Retry button on each doc to retry manually.',
      scanned: 0,
      recovered: [],
    })
  }

  const orgId = ctx.organizationId
  const service = createServiceSupabase()
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString()

  // Find anything in this org that's been stuck.
  const { data: stuckInProgress, error } = await service
    .from('documents')
    .select('id, title, parsing_status, parse_started_at, updated_at, parse_error')
    .eq('organization_id', orgId)
    .in('parsing_status', STUCK_STATES)
    .lt('updated_at', cutoff)
    .order('updated_at', { ascending: true }) // oldest first
    .limit(MAX_DOCS_PER_RUN)

  if (error) {
    console.error('[documents/heal] list error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ALSO pick up docs that failed with a transient error pattern so the
  // user doesn't have to click Retry. We use a tighter staleness window
  // here (60s) since the user is actively staring at the page.
  const failedCutoff = new Date(Date.now() - 60 * 1000).toISOString()
  const { data: failedTransient } = await service
    .from('documents')
    .select('id, title, parsing_status, parse_started_at, updated_at, parse_error')
    .eq('organization_id', orgId)
    .eq('parsing_status', 'failed')
    .not('parse_error', 'is', null)
    .lt('updated_at', failedCutoff)
    .order('updated_at', { ascending: true })
    .limit(MAX_DOCS_PER_RUN)

  type DocRow = { id: string; title: string | null; parsing_status: string; parse_started_at: string | null; updated_at: string; parse_error?: string | null }
  const stuck: DocRow[] = [...(((stuckInProgress as DocRow[] | null) ?? []))]
  for (const doc of (failedTransient as DocRow[] | null) ?? []) {
    if (!isTransientIngestionFailure(doc.parse_error)) continue
    stuck.push(doc)
    if (stuck.length >= MAX_DOCS_PER_RUN) break
  }

  if (stuck.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0, recovered: [] })
  }

  // Fire force-retries via the existing internal retry path. We do this
  // through HTTP so the retry endpoint owns the full reset+inline-ingest
  // ceremony — no risk of the heal logic and the manual-retry logic
  // diverging over time.
  //
  // Fire-and-forget so this endpoint returns FAST (< 2s) — the user's UI
  // doesn't have to wait for OCR to finish; it just needs to know the
  // recovery has been kicked off so it can poll for fresh status.
  const internalSecret = process.env.PARSER_SERVICE_SECRET ?? process.env.INTERNAL_SECRET ?? ''
  const recovered: Array<{ id: string; title: string | null; previous_status: string }> = []

  if (!internalSecret) {
    console.warn('[documents/heal] PARSER_SERVICE_SECRET not set — cannot fire internal retries')
    return NextResponse.json(
      { ok: false, error: 'Heal endpoint not configured (missing PARSER_SERVICE_SECRET)' },
      { status: 501 },
    )
  }

  const origin = req.nextUrl.origin
  for (const doc of stuck) {
    // Fire the retry without awaiting it — the retry endpoint runs inline
    // ingestion which can take minutes.
    void fetch(`${origin}/api/documents/${doc.id}/retry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': internalSecret,
      },
      body: JSON.stringify({ force: true }),
    }).catch((err) => {
      console.warn(`[documents/heal] retry kickoff failed for ${doc.id}:`, err)
    })
    recovered.push({
      id: doc.id,
      title: doc.title,
      previous_status: doc.parsing_status,
    })
  }

  return NextResponse.json({
    ok: true,
    scanned: stuck.length,
    recovered,
    note:
      'Recoveries are running in the background. Refresh the documents list in 1-3 minutes to see progress.',
  })
}
