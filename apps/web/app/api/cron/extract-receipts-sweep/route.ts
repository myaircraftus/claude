/**
 * GET /api/cron/extract-receipts-sweep — backstop for stuck receipt extractions.
 *
 * The receipt-extraction pipeline is event-driven: `/api/costs/upload` and
 * `/api/costs/email-webhook` both fire `waitUntil(runExtraction(...))` to
 * kick off Claude Vision extraction in the background after creating an
 * `intake_documents` row with status='received'. Vercel keeps the function
 * alive until that promise settles, so under normal conditions the row
 * flips to 'extracting' → 'extracted' / 'review' within a minute.
 *
 * But waitUntil isn't a hard guarantee — a Vercel restart, a cold-start
 * timeout while the extractor is loading, an upstream Anthropic 5xx, or a
 * crash in the orchestrator can all leave a row wedged at status='received'
 * forever. The user-side surface (/costs/intake/[id]) shows it as still
 * processing and the operator has no recovery path.
 *
 * This sweep cron is the safety net: every 10 minutes (per vercel.json),
 * find any intake_documents row with status='received' that's older than
 * 5 minutes (well past the normal extraction window) and re-fire the same
 * waitUntil(runExtraction) the upload route uses. runExtraction is the
 * single source of truth for the extraction pipeline, so re-firing it is
 * the simplest "do exactly what the upload would have done" backstop.
 *
 * Auth: Vercel cron sends `Authorization: Bearer ${CRON_SECRET}` with a
 * `vercel-cron/1.0` user-agent. We accept either signal — same pattern as
 * /api/cron/airbly-sync, /api/cron/fsp-sync, /api/cron/telemetry-inference.
 *
 * Idempotency: runExtraction's first action is to flip the row status to
 * 'extracting'; concurrent ticks that observe a different status (because
 * another process moved it) become no-ops. A live legit waitUntil from
 * /api/costs/upload still racing won't be double-fired because by the
 * time we observe status='received' AND created_at < now()-5min, the
 * upload's waitUntil is well past its expected completion window.
 */
import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createServiceSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Each runExtraction call is itself bounded by its own per-call timeout
// (Claude Vision; ~30s typical, up to a few minutes for multi-page PDFs).
// The cron only needs to live long enough to enqueue the waitUntils and
// for each background extraction to complete — 300s is the headroom for a
// burst of stuck rows after a Vercel restart.
export const maxDuration = 300

// "Stuck" cutoff. The upload route's waitUntil is normally done within a
// minute; 5 minutes is well past that, and short enough that operators
// don't see receipts stuck in the UI for too long before the safety net
// kicks in.
const STUCK_AFTER_MS = 5 * 60 * 1000

// Cap per tick so a single sweep can't enqueue dozens of extractions in
// parallel and exhaust Anthropic rate limits / Vercel function memory.
// Anything beyond this gets picked up by the next 10-minute tick.
const MAX_PER_RUN = 20

function isVercelCron(req: NextRequest): boolean {
  const ua = req.headers.get('user-agent') ?? ''
  if (ua.startsWith('vercel-cron')) return true
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true
  return false
}

export async function GET(req: NextRequest) {
  if (!isVercelCron(req)) return NextResponse.json({ error: 'Cron only' }, { status: 401 })

  const service = createServiceSupabase()
  const cutoff = new Date(Date.now() - STUCK_AFTER_MS).toISOString()

  const { data: rows, error } = await service
    .from('intake_documents')
    .select('id, organization_id, filename, created_at')
    .eq('status', 'received')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(MAX_PER_RUN)

  if (error) {
    console.error('[cron/extract-receipts-sweep] list error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const stuck = (rows ?? []) as Array<{
    id: string
    organization_id: string
    filename: string | null
    created_at: string
  }>

  if (stuck.length === 0) {
    return NextResponse.json({ ok: true, swept: 0 })
  }

  // Re-enqueue extraction for each — same waitUntil pattern as the upload
  // route. We DON'T await the runExtraction calls inline because each can
  // take 30s+ and 20 of them serialized would blow past maxDuration; we
  // hand them to Vercel's waitUntil so the platform keeps the function
  // alive until each settles, and the cron returns immediately with the
  // queued count.
  for (const row of stuck) {
    waitUntil((async () => {
      try {
        const { runExtraction } = await import('@/lib/ai/extractors/run')
        await runExtraction({ intake_document_id: row.id })
      } catch (e) {
        console.warn(
          `[cron/extract-receipts-sweep] extraction failed for ${row.id} (${row.filename ?? 'unknown'}):`,
          e,
        )
      }
    })())
  }

  return NextResponse.json({
    ok: true,
    swept: stuck.length,
    ids: stuck.map((r) => r.id),
  })
}
