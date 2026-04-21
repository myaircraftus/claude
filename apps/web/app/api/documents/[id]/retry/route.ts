import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { queueDocumentIngestion } from '@/lib/ingestion/server'
import { hasConfiguredOcrEngine } from '@/lib/ingestion/native-pdf'
import {
  buildInitialDocumentProcessingState,
  markDocumentProcessingFailed,
} from '@/lib/documents/processing-state'
import { reconcileDocumentProcessingStates } from '@/lib/documents/processing-health'
import type { DocType } from '@/types'

// ─── Route context type ────────────────────────────────────────────────────────

interface RouteContext {
  params: { id: string }
}

// ─── POST /api/documents/[id]/retry ───────────────────────────────────────────

export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { id } = params
  let force = false
  try {
    const body = await _req.json()
    force = body?.force === true
  } catch {
    // no body is fine
  }

  // ── 1. Auth check ──────────────────────────────────────────────────────────
  const supabase = createServerSupabase()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Role check (mechanic+, or platform admin) ──────────────────────────
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single()
  const isPlatformAdmin = profile?.is_platform_admin === true

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .maybeSingle()

  if (!membership && !isPlatformAdmin) {
    return NextResponse.json({ error: 'No organization membership found' }, { status: 403 })
  }

  const ALLOWED_ROLES = ['owner', 'admin', 'mechanic']
  if (!isPlatformAdmin && membership && !ALLOWED_ROLES.includes(membership.role)) {
    return NextResponse.json(
      { error: 'Insufficient permissions. Mechanic role or higher required.' },
      { status: 403 }
    )
  }

  // Platform admins can retry across any org; regular users are scoped to their own.
  const orgId = membership?.organization_id ?? null

  // ── 3. Verify document can be reprocessed ──────────────────────────────────
  const serviceClient = createServiceSupabase()

  const docQuery = serviceClient
    .from('documents')
    .select('id, parsing_status, title, parse_started_at, updated_at, file_size_bytes, doc_type, ocr_required, organization_id')
    .eq('id', id)

  // Scope to membership org unless the caller is a platform admin.
  const { data: rawDoc, error: fetchError } = isPlatformAdmin
    ? await docQuery.single()
    : await docQuery.eq('organization_id', orgId!).single()

  if (fetchError || !rawDoc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const [doc] = await reconcileDocumentProcessingStates(serviceClient, [rawDoc])

  const RETRYABLE_STATUSES = ['failed', 'queued', 'needs_ocr']
  const IN_PROGRESS_STATUSES = ['parsing', 'ocr_processing', 'chunking', 'embedding']
  const retryableAsStale = IN_PROGRESS_STATUSES.includes(doc.parsing_status)
  const parseStartedAt = doc.parse_started_at ?? doc.updated_at ?? null
  const staleThresholdMs = 15 * 60 * 1000
  const isStale =
    Boolean(parseStartedAt) &&
    Date.now() - new Date(parseStartedAt).getTime() >= staleThresholdMs

  if (!RETRYABLE_STATUSES.includes(doc.parsing_status) && !(force && retryableAsStale && isStale)) {
    return NextResponse.json(
      {
        error: `Cannot retry document with status "${doc.parsing_status}". Only queued, failed, OCR-required, or stale in-progress documents can be retried.`,
      },
      { status: 409 }
    )
  }

  if (doc.ocr_required && !hasConfiguredOcrEngine()) {
    return NextResponse.json(
      {
        error:
          'OCR engine is not configured. Add OPENAI_API_KEY, Document AI credentials, or AWS Textract keys before retrying.',
      },
      { status: 409 }
    )
  }

  const targetOrgId = (doc as any).organization_id ?? orgId

  // ── 4. Reset status to 'queued', clear parse state ────────────────────────
  const { error: updateError } = await serviceClient
    .from('documents')
    .update({
      parsing_status: 'queued',
      processing_state: buildInitialDocumentProcessingState(),
      parse_error: null,
      parse_started_at: null,
      parse_completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateError) {
    console.error('[retry] DB update error:', updateError)
    return NextResponse.json({ error: 'Failed to re-queue document' }, { status: 500 })
  }

  const ingestionResult = await queueDocumentIngestion(id, {
    // Manual retries should stay inline-first so the operator gets a reliable
    // retry instead of being pushed back into the stalled background path.
    preferBackground: false,
    allowInlineFallback: true,
  })

  if (ingestionResult.status === 'failed') {
    await serviceClient
      .from('documents')
      .update({
        parsing_status: 'failed',
        processing_state: markDocumentProcessingFailed(
          buildInitialDocumentProcessingState(),
          ingestionResult.warning ?? 'Failed to hand document off for OCR/indexing.',
          'uploaded'
        ),
        parse_error:
          ingestionResult.warning ?? 'Failed to hand document off for OCR/indexing.',
        parse_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
  }

  // ── Write audit log ────────────────────────────────────────────────────────
  await serviceClient.from('audit_logs').insert({
    organization_id: targetOrgId,
    user_id: user.id,
    action: 'document.retry',
    resource_type: 'document',
    resource_id: id,
    metadata_json: {
      title: doc.title,
      force,
      stale_retry: force && retryableAsStale && isStale,
      platform_admin_retry: isPlatformAdmin && targetOrgId !== orgId,
    },
  })

  return NextResponse.json({
    status: ingestionResult.status,
    ingestion_mode: ingestionResult.mode,
    warning: ingestionResult.warning ?? null,
  })
}
