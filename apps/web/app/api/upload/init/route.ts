import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { getRequestUser } from '@/lib/supabase/request-user'
import { resolveRequestOrgContext } from '@/lib/auth/context'

const MAX_FILE_SIZE_BYTES = 250 * 1024 * 1024 // 250 MB
const ALLOWED_MIME_TYPES = ['application/pdf']

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^\w.\-]+/g, '-')
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
    fileName?: string
    fileSize?: number
    mimeType?: string
    aircraftId?: string | null
  }

  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid upload request.' }, { status: 400 })
  }

  const fileName = body.fileName?.trim()
  const fileSize = Number(body.fileSize)
  const mimeType = body.mimeType?.trim() || 'application/pdf'
  const aircraftId = body.aircraftId?.trim() || null

  if (!fileName) {
    return NextResponse.json({ error: 'fileName is required.' }, { status: 400 })
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json({ error: 'fileSize must be a positive number.' }, { status: 400 })
  }

  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return NextResponse.json(
      { error: `Invalid file type "${mimeType}". Only PDF files are accepted.` },
      { status: 400 }
    )
  }

  if (fileSize > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File exceeds maximum size of 250 MB (received ${Math.round(fileSize / 1024 / 1024)} MB).` },
      { status: 400 }
    )
  }

  const orgId = requestContext.organizationId

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
    (sum: number, row: { file_size_bytes?: number | null }) => sum + (row.file_size_bytes ?? 0),
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

  if (usedBytes + fileSize > limitBytes) {
    const remainingMb = Math.max(0, Math.round((limitBytes - usedBytes) / 1024 / 1024))
    return NextResponse.json(
      { error: `Not enough storage. You have ${remainingMb} MB remaining.` },
      { status: 402 }
    )
  }

  const documentId = crypto.randomUUID()
  const safeFileName = sanitizeFileName(fileName)
  const storagePath = `${orgId}/${aircraftId ?? 'general'}/originals/${documentId}/${safeFileName}`

  const { data, error } = await serviceClient.storage.from('documents').createSignedUploadUrl(storagePath)

  if (error || !data?.token) {
    console.error('[upload/init] signed upload url error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to initialize upload.' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    documentId,
    storagePath,
    uploadToken: data.token,
    signedPath: data.path ?? storagePath,
    signedUrl: data.signedUrl,
  })
}
