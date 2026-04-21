import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

const MAX_ASSET_BYTES = 50 * 1024 * 1024 // 50 MB for images/video clips
const ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'video/quicktime',
]

const BUCKET = 'marketing-assets'

async function requirePlatformAdmin() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_platform_admin) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { user }
}

function sanitizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9.\-_]+/g, '-').replace(/-+/g, '-').slice(0, 100)
}

/**
 * POST /api/admin/marketing-assets/upload
 * Accepts a multipart form-data upload with fields:
 *   - file (required)
 *   - page (optional — for organizing)
 *   - slot (optional — for organizing)
 * Returns the public URL of the uploaded asset.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if (guard.error) return guard.error

  const formData = await req.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (file.size > MAX_ASSET_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${Math.round(MAX_ASSET_BYTES / 1024 / 1024)} MB)` },
      { status: 400 }
    )
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 })
  }

  const page = String(formData.get('page') ?? 'misc').replace(/[^a-z0-9_-]/gi, '') || 'misc'
  const slot = String(formData.get('slot') ?? 'asset').replace(/[^a-z0-9_-]/gi, '') || 'asset'
  const ext = file.name.includes('.') ? file.name.split('.').pop() : ''
  const assetId = crypto.randomUUID()
  const safeName = sanitizeName(file.name || `${slot}.${ext || 'bin'}`)
  const path = `${page}/${slot}/${assetId}-${safeName}`

  const service = createServiceSupabase()

  // Ensure bucket exists (idempotent). If creation fails due to it already existing, that's fine.
  try {
    await service.storage.createBucket(BUCKET, { public: true })
  } catch {
    /* already exists — ignore */
  }

  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await service.storage
    .from(BUCKET)
    .upload(path, Buffer.from(arrayBuffer), {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: publicUrl } = service.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({
    url: publicUrl.publicUrl,
    path,
    contentType: file.type,
    size: file.size,
  })
}
