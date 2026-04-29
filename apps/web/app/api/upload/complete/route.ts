import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { getRequestUser } from '@/lib/supabase/request-user'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import type { BookAssignment, DocType, ManualAccess, Visibility } from '@/types'
import { buildClassificationStorageFieldsBySelection } from '@/lib/documents/classification'
import { ensureBookRecord } from '@/lib/documents/books'
import { buildInitialDocumentProcessingState } from '@/lib/documents/processing-state'
import {
  deriveDocTypeFromClassification,
  isDocumentDetailId,
  isDocumentGroupId,
} from '@/lib/documents/taxonomy'
import { queueDocumentIngestion } from '@/lib/ingestion/server'

const VALID_DOC_TYPES: DocType[] = [
  'logbook',
  'poh',
  'afm',
  'afm_supplement',
  'maintenance_manual',
  'service_manual',
  'parts_catalog',
  'service_bulletin',
  'airworthiness_directive',
  'work_order',
  'inspection_report',
  'form_337',
  'form_8130',
  'lease_ownership',
  'insurance',
  'compliance',
  'miscellaneous',
]

async function writeAuditLog(
  serviceClient: ReturnType<typeof createServiceSupabase>,
  {
    orgId,
    userId,
    action,
    resourceType,
    resourceId,
    metadata,
  }: {
    orgId: string
    userId: string
    action: string
    resourceType: string
    resourceId: string
    metadata?: Record<string, unknown>
  }
) {
  await serviceClient.from('audit_logs').insert({
    organization_id: orgId,
    user_id: userId,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    metadata_json: metadata ?? {},
  })
}

function parseVisibility(value: unknown): Visibility {
  return value === 'private' ? 'private' : 'team'
}

function parseBookAssignment(value: unknown): BookAssignment | null {
  return value === 'present' ? 'present' : value === 'historical' ? 'historical' : null
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = createServiceSupabase()
  const requestContext = await resolveRequestOrgContext(req)
  if (!requestContext) {
    return NextResponse.json({ error: 'No organization membership found' }, { status: 403 })
  }

  const allowedRoles = ['owner', 'admin', 'mechanic', 'pilot']
  if (!allowedRoles.includes(requestContext.role)) {
    return NextResponse.json(
      { error: 'Insufficient permissions. Pilot, mechanic, or higher required.' },
      { status: 403 }
    )
  }

  let body: {
    documentId?: string
    storagePath?: string
    fileName?: string
    fileSize?: number
    mimeType?: string
    aircraftId?: string | null
    docType?: string
    title?: string
    visibility?: Visibility
    notes?: string
    documentGroupId?: string | null
    documentDetailId?: string | null
    documentSubtype?: string | null
    documentDate?: string | null
    manualAccess?: ManualAccess | null
    price?: string | null
    attestation?: boolean
    bookNumber?: string | null
    bookType?: string | null
    bookAssignmentType?: BookAssignment | null
    marketplaceDownloadable?: boolean
    marketplaceInjectable?: boolean
    marketplacePreviewAvailable?: boolean
    checksumSha256?: string | null
  }

  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid upload completion request.' }, { status: 400 })
  }

  const orgId = requestContext.organizationId
  const documentId = body.documentId?.trim()
  const storagePath = body.storagePath?.trim()
  const fileName = body.fileName?.trim()
  const fileSize = Number(body.fileSize)
  const mimeType = body.mimeType?.trim() || 'application/pdf'
  const aircraftId = body.aircraftId?.trim() || null
  const submittedDocType = body.docType?.trim() || 'miscellaneous'
  const documentGroupIdRaw = body.documentGroupId?.trim() || null
  const documentDetailIdRaw = body.documentDetailId?.trim() || null
  const documentSubtype = body.documentSubtype?.trim() || null
  const documentDateRaw = body.documentDate?.trim() || null
  const titleRaw = body.title?.trim()
  const manualAccessRaw = body.manualAccess?.trim()
  const priceRaw = body.price?.trim()
  const attestationRaw = body.attestation === true
  const bookNumber = body.bookNumber?.trim() || null
  const bookType = body.bookType?.trim() || null
  const marketplaceDownloadableRaw = body.marketplaceDownloadable
  const marketplaceInjectableRaw = body.marketplaceInjectable
  const marketplacePreviewAvailableRaw = body.marketplacePreviewAvailable
  const visibility = parseVisibility(body.visibility)
  const bookAssignment = parseBookAssignment(body.bookAssignmentType)
  const checksumSha256 = body.checksumSha256?.trim() || null

  if (!documentId || !storagePath || !fileName) {
    return NextResponse.json(
      { error: 'documentId, storagePath, and fileName are required.' },
      { status: 400 }
    )
  }

  // Prevent cross-tenant storage hijack: client-supplied storagePath must live
  // under the caller's org prefix. Without this, an attacker could pass
  // `<victim-org>/...` here and have a documents row in their own org point at
  // a victim org's storage object — which the preview/download routes then
  // hand back via service-role storage reads (bypassing storage RLS).
  if (!storagePath.startsWith(`${orgId}/`) || storagePath.includes('..')) {
    return NextResponse.json({ error: 'Invalid storage path.' }, { status: 400 })
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json({ error: 'Invalid file size.' }, { status: 400 })
  }

  const documentGroupId = isDocumentGroupId(documentGroupIdRaw) ? documentGroupIdRaw : null
  const documentDetailId = isDocumentDetailId(documentDetailIdRaw) ? documentDetailIdRaw : null
  const docType = deriveDocTypeFromClassification(
    documentDetailId,
    submittedDocType as DocType
  )
  const classificationFields = buildClassificationStorageFieldsBySelection(
    documentGroupId,
    documentDetailId,
    docType
  )

  const manualTypes = ['maintenance_manual', 'service_manual', 'parts_catalog']
  const isManualType = manualTypes.includes(docType)

  if (!VALID_DOC_TYPES.includes(docType as DocType)) {
    return NextResponse.json({ error: 'Invalid document category selected.' }, { status: 400 })
  }

  // Role-scoped doc_type enforcement:
  // Owner-only doc types (aircraft identity / ownership records) can only be uploaded by
  // an organization owner/admin, OR a user with persona='owner' (dual role).
  const OWNER_ONLY_DOC_TYPES: DocType[] = [
    'logbook', 'poh', 'afm', 'afm_supplement', 'insurance', 'lease_ownership',
  ]
  if (OWNER_ONLY_DOC_TYPES.includes(docType as DocType)) {
    const orgRole = requestContext.role
    const isOrgOwnerOrAdmin = orgRole === 'owner' || orgRole === 'admin'
    if (!isOrgOwnerOrAdmin) {
      const { data: uploaderPersonaRow } = await serviceClient
        .from('user_profiles')
        .select('persona')
        .eq('id', user.id)
        .maybeSingle()
      const hasOwnerPersona = uploaderPersonaRow?.persona === 'owner'
      if (!hasOwnerPersona) {
        await serviceClient.storage.from('documents').remove([storagePath])
        return NextResponse.json(
          {
            error:
              'Only aircraft owners can upload this document type. Mechanics must have an owner profile and active subscription to upload aircraft logbooks, POH/AFM, insurance, or ownership documents.',
            code: 'OWNER_ROLE_REQUIRED',
            doc_type: docType,
          },
          { status: 403 }
        )
      }
    }
  }

  if ((documentGroupIdRaw && !documentGroupId) || (documentDetailIdRaw && !documentDetailId)) {
    return NextResponse.json(
      { error: 'Invalid structured document classification selected.' },
      { status: 400 }
    )
  }

  const manualAccess =
    isManualType && ['private', 'free', 'paid'].includes(manualAccessRaw ?? '')
      ? (manualAccessRaw as 'private' | 'free' | 'paid')
      : null

  const marketplaceDownloadable = marketplaceDownloadableRaw !== false
  const marketplaceInjectable =
    manualAccess !== 'private' && marketplaceInjectableRaw !== false
  const marketplacePreviewAvailable = marketplacePreviewAvailableRaw !== false
  const communityListing = manualAccess === 'free' || manualAccess === 'paid'

  if (communityListing && !attestationRaw) {
    await serviceClient.storage.from('documents').remove([storagePath])
    return NextResponse.json(
      { error: 'Attestation required to list in the community marketplace' },
      { status: 400 }
    )
  }

  const priceCapCents = 100_000_000
  let priceCents: number | null = null
  if (manualAccess === 'paid') {
    const parsed = Number(priceRaw)
    if (!priceRaw || !Number.isFinite(parsed) || parsed <= 0) {
      await serviceClient.storage.from('documents').remove([storagePath])
      return NextResponse.json(
        { error: 'Valid price required for paid listings' },
        { status: 400 }
      )
    }
    priceCents = Math.min(priceCapCents, Math.round(parsed * 100))
  }

  const uploaderRoleMap: Record<string, 'owner' | 'admin' | 'mechanic' | 'pilot'> = {
    owner: 'owner',
    admin: 'admin',
    mechanic: 'mechanic',
    pilot: 'pilot',
  }
  const uploaderRole = uploaderRoleMap[requestContext.role] ?? 'mechanic'

  const { data: uploaderProfile } = await serviceClient
    .from('user_profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .single()

  const uploaderName =
    (uploaderProfile?.full_name as string | undefined) ||
    (uploaderProfile?.email as string | undefined) ||
    null

  const title = titleRaw || fileName.replace(/\.pdf$/i, '')

  const bookId = await ensureBookRecord(serviceClient, {
    organizationId: orgId,
    aircraftId,
    bookType,
    bookNumber,
    bookAssignment,
    title: bookNumber ? `Logbook ${bookNumber}` : null,
    createdBy: user.id,
  })

  const { data: docRecord, error: insertError } = await (serviceClient as any)
    .from('documents')
    .insert({
      id: documentId,
      organization_id: orgId,
      aircraft_id: aircraftId ?? null,
      title,
      doc_type: docType,
      document_group_id: documentGroupId,
      document_detail_id: documentDetailId,
      document_subtype: documentSubtype,
      ...(classificationFields ?? {}),
      description: body.notes?.trim() || null,
      file_path: storagePath,
      file_name: fileName,
      file_size_bytes: fileSize,
      mime_type: mimeType,
      checksum_sha256: checksumSha256,
      parsing_status: 'pending',
      processing_state: buildInitialDocumentProcessingState(),
      source_provider: 'direct_upload',
      ocr_required: false,
      version_number: 1,
      uploaded_by: user.id,
      uploader_role: uploaderRole,
      uploader_name: uploaderName,
      allow_download: false,
      community_listing: communityListing,
      manual_access: manualAccess,
      marketplace_downloadable: marketplaceDownloadable,
      marketplace_injectable: marketplaceInjectable,
      marketplace_preview_available: marketplacePreviewAvailable,
      document_date: documentDateRaw || null,
      price_cents: priceCents,
      attestation_accepted: attestationRaw,
      listing_status: communityListing ? 'pending_review' : null,
      visibility,
      book_assignment: bookAssignment,
      book_id: bookId,
      book_number: bookNumber,
      book_type: bookType,
      download_count: 0,
      uploaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (insertError || !docRecord) {
    console.error('[upload/complete] DB insert error:', insertError)
    await serviceClient.storage.from('documents').remove([storagePath])
    return NextResponse.json(
      { error: 'Failed to create document record. Please try again.' },
      { status: 500 }
    )
  }

  await writeAuditLog(serviceClient, {
    orgId,
    userId: user.id,
    action: 'document.upload',
    resourceType: 'document',
    resourceId: documentId,
    metadata: {
      file_name: fileName,
      file_size_bytes: fileSize,
      doc_type: docType,
      document_group_id: documentGroupId,
      document_detail_id: documentDetailId,
      ...(classificationFields ?? {}),
      aircraft_id: aircraftId,
      book_id: bookId,
      book_number: bookNumber,
      book_type: bookType,
    },
  })

  // Fire-and-forget ingestion. We deliberately don't await here:
  //  - The browser client should get a fast 201 so the user can keep
  //    uploading the next file (multi-upload UX was getting stuck waiting
  //    for OCR to finish each file before the response returned).
  //  - queueDocumentIngestion runs inline (Document AI / Textract / Tesseract
  //    fallback). On Vercel this continues running in the background until
  //    the function instance is reused or the 300s budget is exhausted.
  //  - If the ingestion crashes or the function gets killed before chunks
  //    land, the heal-ingestions cron picks it up within 10 minutes — the
  //    doc was inserted with parsing_status: 'pending' which is in the
  //    cron's STUCK_STATES list, so it auto-retries.
  //
  // Wrap in a Promise so an unhandled rejection in this background work
  // doesn't take down the function instance.
  void queueDocumentIngestion(documentId, {
    preferBackground: true,
    allowInlineFallback: true,
  }).catch((err) => {
    console.error(`[upload/complete] ingestion enqueue failed for ${documentId}:`, err)
  })

  return NextResponse.json(
    {
      document_id: documentId,
      status: 'pending',
      ingestion_mode: 'background',
      warning: null,
    },
    { status: 201 }
  )
}
