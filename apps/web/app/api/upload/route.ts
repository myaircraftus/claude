import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createServiceSupabase } from '@/lib/supabase/server'
import { getRequestUser } from '@/lib/supabase/request-user'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { queueDocumentIngestion } from '@/lib/ingestion/server'
import { shouldPreferBackgroundIngestion } from '@/lib/ingestion/background-policy'
import type { DocType } from '@/types'
import { buildClassificationStorageFieldsBySelection } from '@/lib/documents/classification'
import { ensureBookRecord } from '@/lib/documents/books'
import {
  buildInitialDocumentProcessingState,
  markDocumentProcessingFailed,
} from '@/lib/documents/processing-state'
import {
  deriveDocTypeFromClassification,
  isDocumentDetailId,
  isDocumentGroupId,
} from '@/lib/documents/taxonomy'

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024 // 500 MB
const ALLOWED_MIME_TYPES = ['application/pdf']
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

// ─── Helper: SHA-256 of an ArrayBuffer ────────────────────────────────────────

function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_REGEX.test(value)
}

function sanitizeFilenameForStorage(rawName: string): string {
  const lastSlash = Math.max(rawName.lastIndexOf('/'), rawName.lastIndexOf('\\'))
  const base = lastSlash >= 0 ? rawName.slice(lastSlash + 1) : rawName
  const cleaned = base
    .replace(/\.\.+/g, '.')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._-]+/, '')
    .slice(0, 200)
  return cleaned || 'file.pdf'
}

// ─── Helper: write audit log ──────────────────────────────────────────────────

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

// ─── POST /api/upload ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── 1. Auth check ──────────────────────────────────────────────────────────
  const user = await getRequestUser(req)

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Get user's org + role (must be pilot+) ──────────────────────────────
  const serviceClient = createServiceSupabase()
  const requestContext = await resolveRequestOrgContext(req)
  if (!requestContext) {
    return NextResponse.json({ error: 'No organization membership found' }, { status: 403 })
  }

  const ALLOWED_ROLES = ['owner', 'admin', 'mechanic']
  if (!ALLOWED_ROLES.includes(requestContext.role)) {
    return NextResponse.json(
      { error: 'Insufficient permissions. Mechanic or higher required.' },
      { status: 403 }
    )
  }

  const orgId = requestContext.organizationId

  // ── 3. Check org storage limit ────────────────────────────────────────────
  const { data: org, error: orgError } = await serviceClient
    .from('organizations')
    .select('plan_storage_gb')
    .eq('id', orgId)
    .single()

  if (orgError || !org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  }

  const { data: storageAgg } = await serviceClient
    .from('documents')
    .select('file_size_bytes')
    .eq('organization_id', orgId)

  const usedBytes = (storageAgg ?? []).reduce(
    (sum: number, row: any) => sum + (row.file_size_bytes ?? 0),
    0
  )
  const limitBytes = (org.plan_storage_gb as number) * 1024 * 1024 * 1024

  if (usedBytes >= limitBytes) {
    return NextResponse.json(
      {
        error: `Storage limit reached. Your plan allows ${org.plan_storage_gb} GB. Please upgrade or remove documents.`,
      },
      { status: 402 }
    )
  }

  // ── 4. Parse multipart FormData ────────────────────────────────────────────
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Failed to parse form data' }, { status: 400 })
  }

  const fileEntry = formData.get('file')
  const aircraftIdRaw = formData.get('aircraft_id')?.toString().trim() || null
  if (aircraftIdRaw && !isUuid(aircraftIdRaw)) {
    return NextResponse.json({ error: 'Invalid aircraft id.' }, { status: 400 })
  }
  const aircraftId = aircraftIdRaw
  const submittedDocType = formData.get('doc_type')?.toString().trim() || 'miscellaneous'
  const documentGroupIdRaw = formData.get('document_group')?.toString().trim() || null
  const documentDetailIdRaw = formData.get('document_detail')?.toString().trim() || null
  const documentSubtype = formData.get('document_subtype')?.toString().trim() || null
  const documentDateRaw = formData.get('document_date')?.toString().trim() || null
  const titleRaw = formData.get('title')?.toString().trim()
  const visibilityRaw = formData.get('visibility')?.toString().trim()
  const bookNumberRaw = formData.get('book_number')?.toString().trim()
  const bookTypeRaw = formData.get('book_type')?.toString().trim()
  const bookAssignmentRaw = formData.get('book_assignment_type')?.toString().trim()
  const manualAccessRaw = formData.get('manual_access')?.toString().trim()
  const priceRaw = formData.get('price')?.toString().trim()
  const attestationRaw = formData.get('attestation')?.toString().trim()
  const marketplaceDownloadableRaw = formData.get('marketplace_downloadable')?.toString().trim()
  const marketplaceInjectableRaw = formData.get('marketplace_injectable')?.toString().trim()
  const marketplacePreviewAvailableRaw = formData.get('marketplace_preview_available')?.toString().trim()

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

  // Ownership/listing derived fields
  const MANUAL_TYPES = ['maintenance_manual', 'service_manual', 'parts_catalog']
  const isManualType = MANUAL_TYPES.includes(docType)

  if (!VALID_DOC_TYPES.includes(docType as DocType)) {
    return NextResponse.json({ error: 'Invalid document category selected.' }, { status: 400 })
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
  const visibility = visibilityRaw === 'private' ? 'private' : 'team'
  const bookNumber = bookNumberRaw || null
  const bookType = bookTypeRaw || null
  const bookAssignment =
    bookAssignmentRaw === 'present'
      ? 'present'
      : bookAssignmentRaw === 'historical'
        ? 'historical'
        : null
  const marketplaceDownloadable = marketplaceDownloadableRaw !== 'false'
  const marketplaceInjectable =
    manualAccess !== 'private' && marketplaceInjectableRaw !== 'false'
  const marketplacePreviewAvailable = marketplacePreviewAvailableRaw !== 'false'
  const communityListing = manualAccess === 'free' || manualAccess === 'paid'
  const attestation = attestationRaw === 'true'

  // Server-side validation for community listings
  if (communityListing && !attestation) {
    return NextResponse.json(
      { error: 'Attestation required to list in the community marketplace' },
      { status: 400 }
    )
  }

  // Price: cap at $1,000,000 ($100M cents), enforce > 0 for paid
  const PRICE_CAP_CENTS = 100_000_000 // $1,000,000
  let priceCents: number | null = null
  if (manualAccess === 'paid') {
    const parsed = Number(priceRaw)
    if (!priceRaw || !Number.isFinite(parsed) || parsed <= 0) {
      return NextResponse.json(
        { error: 'Valid price required for paid listings' },
        { status: 400 }
      )
    }
    priceCents = Math.min(PRICE_CAP_CENTS, Math.round(parsed * 100))
  }

  // Map org role → uploader_role (viewer/auditor won't reach here due to ALLOWED_ROLES)
  const uploaderRoleMap: Record<string, 'owner' | 'admin' | 'mechanic' | 'pilot'> = {
    owner: 'owner',
    admin: 'admin',
    mechanic: 'mechanic',
    pilot: 'pilot',
  }
  const uploaderRole = uploaderRoleMap[requestContext.role] ?? 'mechanic'

  // Fetch uploader display name
  const { data: uploaderProfile } = await serviceClient
    .from('user_profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .single()
  const uploaderName =
    (uploaderProfile?.full_name as string | undefined) ||
    (uploaderProfile?.email as string | undefined) ||
    null

  if (!fileEntry || !(fileEntry instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const file = fileEntry as File
  const title = titleRaw || file.name.replace(/\.pdf$/i, '')

  // ── 5. Validate file type and size ────────────────────────────────────────
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Invalid file type "${file.type}". Only PDF files are accepted.` },
      { status: 400 }
    )
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File exceeds maximum size of 500 MB (received ${Math.round(file.size / 1024 / 1024)} MB).` },
      { status: 400 }
    )
  }

  // Check adding this file won't exceed the limit
  if (usedBytes + file.size > limitBytes) {
    const remainingMb = Math.max(0, Math.round((limitBytes - usedBytes) / 1024 / 1024))
    return NextResponse.json(
      { error: `Not enough storage. You have ${remainingMb} MB remaining.` },
      { status: 402 }
    )
  }

  // ── 6. Calculate SHA-256 checksum ─────────────────────────────────────────
  const fileBuffer = Buffer.from(await file.arrayBuffer())
  const checksum = sha256Hex(fileBuffer)

  // ── 7. Generate document_id ───────────────────────────────────────────────
  const docId = crypto.randomUUID()

  // ── 8. Upload to Supabase Storage ─────────────────────────────────────────
  // Sanitize the filename — never trust client-supplied paths in storage keys.
  const safeFilename = sanitizeFilenameForStorage(file.name)
  const storagePath = `${orgId}/${aircraftId ?? 'general'}/originals/${docId}/${safeFilename}`

  const { error: storageError } = await serviceClient.storage
    .from('documents')
    .upload(storagePath, fileBuffer, {
      contentType: file.type,
      upsert: false,
    })

  if (storageError) {
    console.error('[upload] Storage error:', storageError)
    return NextResponse.json(
      { error: 'Failed to store file. Please try again.' },
      { status: 500 }
    )
  }

  // ── 9. Create document record ─────────────────────────────────────────────
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
      id: docId,
      organization_id: orgId,
      aircraft_id: aircraftId ?? null,
      title,
      doc_type: docType,
      document_group_id: documentGroupId,
      document_detail_id: documentDetailId,
      document_subtype: documentSubtype,
      ...(classificationFields ?? {}),
      description: formData.get('notes')?.toString().trim() || null,
      file_path: storagePath,
      file_name: file.name,
      file_size_bytes: file.size,
      mime_type: file.type,
      checksum_sha256: checksum,
      parsing_status: 'queued',
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
      attestation_accepted: attestation,
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
    console.error('[upload] DB insert error:', insertError)
    // Attempt to clean up storage
    await serviceClient.storage.from('documents').remove([storagePath])
    return NextResponse.json(
      { error: 'Failed to create document record. Please try again.' },
      { status: 500 }
    )
  }

  // ── 10. Write audit log ───────────────────────────────────────────────────
  await writeAuditLog(serviceClient, {
    orgId,
    userId: user.id,
    action: 'document.upload',
    resourceType: 'document',
    resourceId: docId,
    metadata: {
      file_name: file.name,
      file_size_bytes: file.size,
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

  // ── 11. Trigger or inline-ingest the document ─────────────────────────────
  const ingestionResult = await queueDocumentIngestion(docId, {
    preferBackground: shouldPreferBackgroundIngestion({
      fileSizeBytes: file.size,
      docType,
    }),
    allowInlineFallback: true,
  })

  if (ingestionResult.status === 'failed') {
    await (serviceClient as any)
      .from('documents')
      .update({
        parsing_status: 'failed',
        processing_state: markDocumentProcessingFailed(
          buildInitialDocumentProcessingState(),
          ingestionResult.warning ?? 'Failed to hand document off for OCR/indexing.'
        ),
        parse_error:
          ingestionResult.warning ?? 'Failed to hand document off for OCR/indexing.',
        parse_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', docId)
      .eq('organization_id', orgId)
  }

  // ── 12. Return response ───────────────────────────────────────────────────
  return NextResponse.json(
    {
      document_id: docId,
      status: ingestionResult.status,
      ingestion_mode: ingestionResult.mode,
      warning: ingestionResult.warning ?? null,
    },
    { status: 201 }
  )
}
