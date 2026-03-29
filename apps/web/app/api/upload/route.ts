import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { tasks } from '@trigger.dev/sdk/v3'

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024 // 500 MB
const ALLOWED_MIME_TYPES = ['application/pdf']

// ─── Helper: SHA-256 of an ArrayBuffer ────────────────────────────────────────

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
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
  const supabase = createServerSupabase()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Get user's org + role (must be mechanic+) ───────────────────────────
  const { data: membership, error: membershipError } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()

  if (membershipError || !membership) {
    return NextResponse.json({ error: 'No organization membership found' }, { status: 403 })
  }

  const ALLOWED_ROLES = ['owner', 'admin', 'mechanic']
  if (!ALLOWED_ROLES.includes(membership.role)) {
    return NextResponse.json(
      { error: 'Insufficient permissions. Mechanic role or higher required.' },
      { status: 403 }
    )
  }

  const orgId = membership.organization_id

  // ── 3. Check org storage limit ────────────────────────────────────────────
  const serviceClient = createServiceSupabase()

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
    (sum, row) => sum + (row.file_size_bytes ?? 0),
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
  const aircraftId = formData.get('aircraft_id')?.toString().trim() || null
  const docType = formData.get('doc_type')?.toString().trim() || 'miscellaneous'
  const titleRaw = formData.get('title')?.toString().trim()

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
  const fileBuffer = await file.arrayBuffer()
  const checksum = await sha256Hex(fileBuffer)

  // ── 7. Generate document_id ───────────────────────────────────────────────
  const docId = crypto.randomUUID()

  // ── 8. Upload to Supabase Storage ─────────────────────────────────────────
  const storagePath = `${orgId}/${aircraftId ?? 'general'}/originals/${docId}/${file.name}`

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
  const { data: docRecord, error: insertError } = await serviceClient
    .from('documents')
    .insert({
      id: docId,
      organization_id: orgId,
      aircraft_id: aircraftId ?? null,
      title,
      doc_type: docType,
      file_path: storagePath,
      file_name: file.name,
      file_size_bytes: file.size,
      mime_type: file.type,
      checksum_sha256: checksum,
      parsing_status: 'queued',
      source_provider: 'direct_upload',
      ocr_required: false,
      version_number: 1,
      uploaded_by: user.id,
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
      aircraft_id: aircraftId,
    },
  })

  // ── 11. Trigger Trigger.dev ingest job ────────────────────────────────────
  try {
    await tasks.trigger('ingest-document', { documentId: docId })
  } catch (triggerError) {
    console.error('[upload] Failed to trigger ingest job:', triggerError)
    // Non-fatal: document is recorded as queued; a worker sweep can pick it up
  }

  // ── 12. Return response ───────────────────────────────────────────────────
  return NextResponse.json(
    { document_id: docId, status: 'queued' },
    { status: 201 }
  )
}
