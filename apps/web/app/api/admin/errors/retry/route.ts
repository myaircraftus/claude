/**
 * POST /api/admin/errors/retry — Phase 13.4 retry a failed ingestion.
 *
 * Re-enqueues the document into vision_index_jobs via the Phase 12
 * enqueueDocumentForVision helper (idempotent — if a queued job already
 * exists this no-ops with reason='already_dispatched').
 *
 * Auth: is_platform_admin only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { parseJsonBody, safeUuid } from '@/lib/validation/common'
import { enqueueDocumentForVision } from '@/lib/vision/auto-dispatch'

const Body = z.object({
  documentId: safeUuid,
})

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_platform_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = await parseJsonBody(req, Body)
  if (!parsed.ok) return parsed.response

  const service = createServiceSupabase()
  // Look up the doc to get org + page count
  const { data: doc } = await service
    .from('documents')
    .select('id, organization_id, page_count')
    .eq('id', parsed.data.documentId)
    .single()
  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  // Force the auto-dispatch flag to 'true' so retry works regardless of env
  const result = await enqueueDocumentForVision(
    service as any,
    {
      documentId: doc.id as string,
      organizationId: doc.organization_id as string,
      pageCount: (doc.page_count as number) ?? 0,
    },
    'true',
  )

  return NextResponse.json({
    enqueued: result.enqueued,
    reason: result.reason,
    jobId: result.jobId ?? null,
  })
}
