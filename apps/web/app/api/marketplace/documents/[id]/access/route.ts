import { NextRequest, NextResponse } from 'next/server'
import { requireMarketplaceContext } from '../../../_shared'
import { queueDocumentIngestion } from '@/lib/ingestion/server'
import { shouldPreferBackgroundIngestion } from '@/lib/ingestion/background-policy'
import {
  buildInitialDocumentProcessingState,
  markDocumentProcessingFailed,
} from '@/lib/documents/processing-state'
import type { DocType } from '@/types'

type AccessAction = 'view' | 'download' | 'inject' | 'download_and_inject'
type TargetScope = 'workspace' | 'aircraft'
function parseAction(raw: unknown): AccessAction | null {
  const value = String(raw)
  return ['view', 'download', 'inject', 'download_and_inject'].includes(value) ? (value as AccessAction) : null
}

function parseScope(raw: unknown): TargetScope {
  return String(raw) === 'aircraft' ? 'aircraft' : 'workspace'
}

async function loadDocument(service: any, id: string) {
  const { data, error } = await service
    .from('documents')
    .select(
      'id, organization_id, aircraft_id, title, description, file_path, file_name, file_size_bytes, mime_type, checksum_sha256, page_count, community_listing, listing_status, manual_access, allow_download, marketplace_downloadable, marketplace_injectable, marketplace_preview_available, uploaded_by, price_cents, download_count, doc_type, document_group_id, document_detail_id, document_subtype, record_family, truth_role, parser_strategy, document_date, revision'
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as Record<string, unknown> | null
}

async function incrementDownloadCount(service: any, documentId: string) {
  const rpc = await service.rpc('increment_download_count', { doc_id: documentId })
  if (!rpc.error) return

  const { data: current } = await service
    .from('documents')
    .select('download_count')
    .eq('id', documentId)
    .single()
  if (current) {
    await service
      .from('documents')
      .update({ download_count: Number(current.download_count ?? 0) + 1 })
      .eq('id', documentId)
  }
}

async function createSignedDownloadUrl(service: any, filePath: string) {
  const { data, error } = await service.storage.from('documents').createSignedUrl(filePath, 60 * 60)
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Failed to create download URL')
  }
  return data.signedUrl as string
}

async function cloneDocumentIntoWorkspace({
  service,
  sourceDocument,
  organizationId,
  userId,
  targetScope,
  targetAircraftId,
}: {
  service: any
  sourceDocument: Record<string, unknown>
  organizationId: string
  userId: string
  targetScope: TargetScope
  targetAircraftId: string | null
}) {
  const injectedDocumentId = crypto.randomUUID()
  const sourcePath = String(sourceDocument.file_path)
  const fileName = String(sourceDocument.file_name)
  const fileSizeBytes = Number(sourceDocument.file_size_bytes ?? 0)
  const storagePath = `${organizationId}/${targetScope === 'aircraft' ? targetAircraftId ?? 'general' : 'general'}/marketplace-inject/${injectedDocumentId}/${fileName}`

  const download = await service.storage.from('documents').download(sourcePath)
  if (download.error || !download.data) {
    throw new Error(download.error?.message || 'Failed to download source document for inject')
  }

  const buffer = await download.data.arrayBuffer()
  const upload = await service.storage.from('documents').upload(storagePath, buffer, {
    contentType: String(sourceDocument.mime_type ?? 'application/pdf'),
    upsert: false,
  })
  if (upload.error) {
    throw new Error(upload.error.message || 'Failed to store injected document')
  }

  const insertPayload = {
    id: injectedDocumentId,
    organization_id: organizationId,
    aircraft_id: targetScope === 'aircraft' ? targetAircraftId : null,
    title: String(sourceDocument.title ?? fileName.replace(/\.pdf$/i, '')),
    doc_type: String(sourceDocument.doc_type ?? 'miscellaneous') as DocType,
    document_group_id: sourceDocument.document_group_id ?? null,
    document_detail_id: sourceDocument.document_detail_id ?? null,
    document_subtype: sourceDocument.document_subtype ?? null,
    record_family: sourceDocument.record_family ?? null,
    truth_role: sourceDocument.truth_role ?? null,
    parser_strategy: sourceDocument.parser_strategy ?? null,
    description: sourceDocument.description ?? null,
    file_path: storagePath,
    file_name: fileName,
    file_size_bytes: fileSizeBytes || buffer.byteLength,
    mime_type: String(sourceDocument.mime_type ?? 'application/pdf'),
    checksum_sha256: sourceDocument.checksum_sha256 ?? null,
    page_count: null,
    parsing_status: 'queued',
    parse_error: null,
    parse_started_at: null,
    parse_completed_at: null,
    processing_state: buildInitialDocumentProcessingState(),
    is_text_native: null,
    ocr_required: false,
    source_provider: 'direct_upload',
    document_date: sourceDocument.document_date ?? null,
    revision: sourceDocument.revision ?? null,
    version_number: 1,
    uploaded_by: userId,
    uploader_role: 'pilot',
    uploader_name: null,
    allow_download: false,
    community_listing: false,
    manual_access: null,
    price_cents: null,
    attestation_accepted: false,
    listing_status: null,
    visibility: 'team',
    download_count: 0,
    uploaded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { error: insertError } = await service.from('documents').insert(insertPayload)
  if (insertError) {
    await service.storage.from('documents').remove([storagePath])
    throw new Error(insertError.message || 'Failed to create injected document')
  }

  const requiresBackgroundProcessing = shouldPreferBackgroundIngestion({
    fileSizeBytes,
    docType: sourceDocument.doc_type as DocType | null,
  })
  const ingestion = await queueDocumentIngestion(injectedDocumentId, {
    preferBackground: requiresBackgroundProcessing,
    allowInlineFallback: true,
  })

  if (ingestion.status === 'failed') {
    await (service as any)
      .from('documents')
      .update({
        parsing_status: 'failed',
        processing_state: markDocumentProcessingFailed(
          buildInitialDocumentProcessingState(),
          ingestion.warning ?? 'Failed to hand document off for OCR/indexing.',
          'uploaded'
        ),
        parse_error:
          ingestion.warning ?? 'Failed to hand document off for OCR/indexing.',
        parse_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', injectedDocumentId)
      .eq('organization_id', organizationId)
  }

  return {
    injectedDocumentId,
    ingestion,
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctxRes = await requireMarketplaceContext()
  if (!ctxRes.ok) return ctxRes.response

  const { service, organizationId, user } = ctxRes.ctx
  const doc = await loadDocument(service, params.id)
  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const isOwner = String(doc.uploaded_by ?? '') === user.id
  const isTeamMember = await service
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('organization_id', String(doc.organization_id))
    .not('accepted_at', 'is', null)
    .maybeSingle()

  const isFreePublished =
    doc.community_listing === true &&
    doc.listing_status === 'published' &&
    doc.manual_access === 'free'

  const isPaidPublished =
    doc.community_listing === true &&
    doc.listing_status === 'published' &&
    doc.manual_access === 'paid'

  const isTeamShared = !!isTeamMember.data && doc.allow_download === true
  const canAccess = isOwner || isTeamShared || isFreePublished || isPaidPublished

  const accessMode = doc.manual_access === 'paid' ? 'paid' : doc.manual_access === 'free' ? 'free' : 'private'
  const canDownload =
    isOwner ||
    isTeamShared ||
    (isFreePublished && doc.marketplace_downloadable !== false)
  const canInject =
    isOwner ||
    isTeamShared ||
    (isFreePublished && doc.marketplace_injectable !== false && accessMode !== 'private')
  const canPreview =
    doc.marketplace_preview_available !== false && Number(doc.page_count ?? 0) > 0

  return NextResponse.json({
    document: {
      id: doc.id,
      title: doc.title,
      file_name: doc.file_name,
      doc_type: doc.doc_type,
      access_mode: accessMode,
      can_download: canDownload,
      can_inject: canInject,
      can_preview: canPreview,
      requires_purchase: doc.manual_access === 'paid' && doc.community_listing === true && doc.listing_status === 'published' && !isOwner && !isTeamShared,
      organization_id: doc.organization_id,
      aircraft_id: doc.aircraft_id,
    },
    current_organization_id: organizationId,
    allowed_actions: canAccess
      ? [
          'view',
          ...(canDownload ? (['download'] as const) : []),
          ...(canInject ? (['inject'] as const) : []),
          ...(canDownload && canInject ? (['download_and_inject'] as const) : []),
        ]
      : [],
  })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctxRes = await requireMarketplaceContext()
  if (!ctxRes.ok) return ctxRes.response

  const { service, organizationId, user } = ctxRes.ctx
  const doc = await loadDocument(service, params.id)
  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const isOwner = String(doc.uploaded_by ?? '') === user.id
  const { data: teamMembership } = await service
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('organization_id', String(doc.organization_id))
    .not('accepted_at', 'is', null)
    .maybeSingle()

  const isTeamShared = !!teamMembership && doc.allow_download === true
  const isFreePublished =
    doc.community_listing === true &&
    doc.listing_status === 'published' &&
    doc.manual_access === 'free'

  const isPaidPublished =
    doc.community_listing === true &&
    doc.listing_status === 'published' &&
    doc.manual_access === 'paid'

  const canView = isOwner || isTeamShared || isFreePublished || isPaidPublished
  const canDownload =
    isOwner ||
    isTeamShared ||
    (isFreePublished && doc.marketplace_downloadable !== false)
  const canInject =
    isOwner ||
    isTeamShared ||
    (isFreePublished && doc.marketplace_injectable !== false && doc.manual_access !== 'private')

  let body: { action?: string; mode?: string; targetScope?: string; targetAircraftId?: string; aircraftId?: string; note?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const action = parseAction(body.action ?? body.mode)
  if (!action) {
    return NextResponse.json({ error: 'action must be one of view, download, inject, download_and_inject' }, { status: 400 })
  }

  if (action !== 'view' && isPaidPublished && !canDownload && !canInject) {
    return NextResponse.json(
      {
        error: 'Paid manual/catalog access requires the purchase flow',
        access_mode: 'paid',
      },
      { status: 402 }
    )
  }

  if (action === 'view' && !canView) {
    return NextResponse.json({ error: 'Document not authorized for this action' }, { status: 403 })
  }

  if (action === 'download' && !canDownload) {
    return NextResponse.json({ error: 'Document not authorized for download' }, { status: 403 })
  }

  if (action === 'inject' && !canInject) {
    return NextResponse.json({ error: 'Document not authorized for inject' }, { status: 403 })
  }

  if (action === 'download_and_inject' && (!canDownload || !canInject)) {
    return NextResponse.json(
      { error: 'Document must allow both download and inject for this action' },
      { status: 403 }
    )
  }

  const targetScope = parseScope(body.targetScope)
  let targetAircraftId: string | null = null
  if (targetScope === 'aircraft') {
    targetAircraftId = body.targetAircraftId?.trim() || body.aircraftId?.trim() || null
    if (!targetAircraftId) {
      return NextResponse.json({ error: 'targetAircraftId required for aircraft injects' }, { status: 400 })
    }

    const { data: aircraft } = await service
      .from('aircraft')
      .select('id, organization_id, tail_number, make, model')
      .eq('id', targetAircraftId)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (!aircraft) {
      return NextResponse.json({ error: 'Target aircraft not found' }, { status: 404 })
    }
  }

  const accessEvent = await service
    .from('marketplace_document_access_events')
    .insert({
      document_id: doc.id,
      organization_id: organizationId,
      user_id: user.id,
      action,
      target_scope: action === 'view' ? null : targetScope,
      target_aircraft_id: action === 'view' ? null : targetAircraftId,
      metadata_json: {
        note: body.note ?? null,
        source: 'marketplace_document_access_route',
      },
    })
    .select('id, action, created_at')
    .single()

  if (accessEvent.error) {
    return NextResponse.json({ error: accessEvent.error.message }, { status: 500 })
  }

  let downloadUrl: string | null = null
  if (action === 'download' || action === 'download_and_inject') {
    downloadUrl = await createSignedDownloadUrl(service, String(doc.file_path))
    await incrementDownloadCount(service, String(doc.id))
  }

  let injectEvent: Record<string, unknown> | null = null
  let injectedDocumentId: string | null = null
  if (action === 'inject' || action === 'download_and_inject') {
    const { data, error } = await service
      .from('marketplace_document_inject_events')
      .insert({
        document_id: doc.id,
        organization_id: organizationId,
        user_id: user.id,
        target_scope: targetScope,
        target_aircraft_id: targetAircraftId,
        status: 'queued',
        metadata_json: {
          note: body.note ?? null,
          source: 'marketplace_document_access_route',
          access_event_id: accessEvent.data.id,
        },
      })
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    injectEvent = data

    try {
      const injected = await cloneDocumentIntoWorkspace({
        service,
        sourceDocument: doc,
        organizationId,
        userId: user.id,
        targetScope,
        targetAircraftId,
      })
      injectedDocumentId = injected.injectedDocumentId

      await service
        .from('marketplace_document_inject_events')
        .update({
          status: 'completed',
          updated_at: new Date().toISOString(),
          metadata_json: {
            ...(data.metadata_json ?? {}),
            injected_document_id: injected.injectedDocumentId,
            ingestion_mode: injected.ingestion.mode,
            ingestion_status: injected.ingestion.status,
            ingestion_warning: injected.ingestion.warning ?? null,
          },
        })
        .eq('id', data.id)
    } catch (injectError) {
      await service
        .from('marketplace_document_inject_events')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString(),
          metadata_json: {
            ...(data.metadata_json ?? {}),
            error: injectError instanceof Error ? injectError.message : 'Inject failed',
          },
        })
        .eq('id', data.id)

      return NextResponse.json(
        {
          error: injectError instanceof Error ? injectError.message : 'Inject failed',
          inject_event: data,
        },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({
    ok: true,
    action,
    access_event: accessEvent.data,
    download_url: downloadUrl,
    downloadUrl,
    file_name: doc.file_name,
    inject_event: injectEvent,
    injectedDocumentId,
    injected_document_id: injectedDocumentId,
    inject_explanation:
      'Inject adds this document into your aircraft or workspace records inside myaircraft.us so it becomes searchable with AI and available for assistant answers.',
  })
}
