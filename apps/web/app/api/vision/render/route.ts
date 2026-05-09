/**
 * POST /api/vision/render  (Phase 8 Sprint 8.2)
 *
 * Body: { sourceDocumentId: uuid, force?: boolean }
 *
 * Kicks off page-rendering for a source document. Returns immediately
 * with { ok: true, queued: true, source_document_id }; the actual
 * renderDocumentToPages() runs via waitUntil so the HTTP response
 * isn't blocked by per-page processing.
 *
 * Auth:
 *   - existing session pattern (cookied supabase client)
 *   - owner OR admin role on the active org (vision indexing is admin work)
 *
 * Rate limit:
 *   - 5 req/min/IP — vision rendering is heavy and intentionally
 *     low-throughput per user (per audit §5.8 default for AI/heavy
 *     routes; tighter than the 10/min applied to text-LLM routes).
 *
 * Idempotency:
 *   - Without force=true, rows that already exist for the document are
 *     left alone. The renderer reports pagesSkipped in its result.
 *   - With force=true, every page is re-inserted (will fail at the
 *     vision_pages_doc_page_unique index unless the existing rows
 *     have been soft-deleted first; this is intentional — force is
 *     for the "I want a fresh start, I've cleaned up" path).
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { waitUntil } from '@vercel/functions'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { parseJsonBody, safeUuid } from '@/lib/validation/common'
import { renderDocumentToPages } from '@/lib/vision/renderer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const Body = z.object({
  sourceDocumentId: safeUuid,
  force: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  // Vision rendering is heavy — 5/min/IP (tighter than the 10/min
  // applied to text-LLM routes per audit §5.8).
  const rl = rateLimit(`vision-render:${getClientIp(req.headers)}`, { limit: 5, windowSeconds: 60 })
  if (!rl.success) return rateLimitResponse(rl)

  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })
  if (!['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Owner/admin only' }, { status: 403 })
  }

  const parsed = await parseJsonBody(req, Body)
  if (!parsed.ok) return parsed.response
  const { sourceDocumentId, force } = parsed.data

  // Look up the source document's storage_path. Read-only — the
  // documents table is owned by the OCR pipeline (sacred boundary).
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .select('id, storage_path, organization_id')
    .eq('id', sourceDocumentId)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()
  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 500 })
  if (!doc) return NextResponse.json({ error: 'Source document not found in this org' }, { status: 404 })

  const sourceFilePath = (doc as { storage_path: string | null }).storage_path
  if (!sourceFilePath) {
    return NextResponse.json({ error: 'Source document has no storage_path' }, { status: 400 })
  }

  // Run the renderer in the background. We use the SERVICE-ROLE client
  // for the renderer because it crosses both the documents bucket
  // (read) and the vision_pages table (write); the user's cookied
  // client would also work via RLS but service-role gives a clean
  // separation between the auth check (above) and the data work.
  const service = createServiceSupabase()
  waitUntil((async () => {
    try {
      await renderDocumentToPages(service, {
        organizationId: membership.organization_id,
        sourceDocumentId,
        sourceFilePath,
        force,
      })
    } catch (err) {
      console.warn(
        '[vision/render] background render failed for',
        sourceDocumentId,
        err,
      )
    }
  })())

  return NextResponse.json({
    ok: true,
    queued: true,
    source_document_id: sourceDocumentId,
  })
}
