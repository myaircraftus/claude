import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase, createServerSupabase } from '@/lib/supabase/server'
import { slugify } from '@/lib/utils'
import { normalizeChecklistTemplateKey } from '@/lib/work-orders/checklists'

const MAX_TEMPLATE_FILE_SIZE_BYTES = 25 * 1024 * 1024
const ALLOWED_TEMPLATE_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'text/plain',
  'text/markdown',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

function sanitizeFileName(fileName: string) {
  const dotIndex = fileName.lastIndexOf('.')
  const base = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName
  const ext = dotIndex > 0 ? fileName.slice(dotIndex + 1).toLowerCase() : ''
  const safeBase = slugify(base) || 'template-reference'
  return ext ? `${safeBase}.${ext}` : safeBase
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }

  if (!['owner', 'admin', 'mechanic'].includes(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const fileName = String(body?.fileName ?? '').trim()
  const mimeType = String(body?.mimeType ?? '').trim()
  const fileSize = Number(body?.fileSize ?? 0)
  const kind = body?.kind === 'logbook' ? 'logbook' : body?.kind === 'checklist' ? 'checklist' : null
  const templateKey =
    kind === 'checklist'
      ? normalizeChecklistTemplateKey(String(body?.templateKey ?? '').trim())
      : null
  const note = String(body?.note ?? '').trim()

  if (!fileName || !kind || !Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json({ error: 'Invalid template asset request.' }, { status: 400 })
  }

  if (kind === 'checklist' && !templateKey) {
    return NextResponse.json({ error: 'Checklist uploads require a template key.' }, { status: 400 })
  }

  if (!ALLOWED_TEMPLATE_MIME_TYPES.includes(mimeType)) {
    return NextResponse.json(
      { error: `Unsupported template file type "${mimeType}".` },
      { status: 400 }
    )
  }

  if (fileSize > MAX_TEMPLATE_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: 'Template reference files must be 25 MB or smaller.' },
      { status: 400 }
    )
  }

  const safeFileName = sanitizeFileName(fileName)
  const assetId = crypto.randomUUID()
  const storagePath =
    kind === 'checklist'
      ? `${membership.organization_id}/settings/templates/checklists/${templateKey}/${assetId}-${safeFileName}`
      : `${membership.organization_id}/settings/templates/logbook/${assetId}-${safeFileName}`

  const service = createServiceSupabase()
  const { data, error } = await service.storage.from('documents').createSignedUploadUrl(storagePath)

  if (error || !data?.token) {
    return NextResponse.json(
      { error: error?.message ?? 'Failed to initialize template upload.' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    asset: {
      id: assetId,
      name: fileName,
      storagePath,
      contentType: mimeType,
      sizeBytes: fileSize,
      uploadedAt: new Date().toISOString(),
      note: note || null,
    },
    uploadToken: data.token,
    uploadPath: data.path ?? storagePath,
  })
}
