import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const entry = formData.get('file')
  if (!entry || !(entry instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  const file = entry as File

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: `Unsupported image type (${file.type})` }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image exceeds 5 MB limit' }, { status: 400 })
  }

  const ext = file.type === 'image/png' ? 'png'
    : file.type === 'image/webp' ? 'webp'
    : file.type === 'image/gif' ? 'gif'
    : 'jpg'
  const path = `${user.id}/avatar-${Date.now()}.${ext}`

  const service = createServiceSupabase()
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await service.storage
    .from('avatars')
    .upload(path, buffer, { contentType: file.type, upsert: false })
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: publicData } = service.storage.from('avatars').getPublicUrl(path)
  const publicUrl = publicData.publicUrl

  const { data: prev } = await service
    .from('user_profiles')
    .select('avatar_url')
    .eq('id', user.id)
    .single()

  const { data: updated, error: updateError } = await service
    .from('user_profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', user.id)
    .select('id, email, full_name, avatar_url, job_title, is_platform_admin')
    .single()
  if (updateError) {
    await service.storage.from('avatars').remove([path])
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  if (prev?.avatar_url && typeof prev.avatar_url === 'string') {
    const marker = '/storage/v1/object/public/avatars/'
    const idx = prev.avatar_url.indexOf(marker)
    if (idx !== -1) {
      const oldPath = prev.avatar_url.slice(idx + marker.length)
      if (oldPath && oldPath !== path) {
        await service.storage.from('avatars').remove([oldPath])
      }
    }
  }

  return NextResponse.json({ profile: updated })
}

export async function DELETE(_req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceSupabase()
  const { data: prev } = await service
    .from('user_profiles')
    .select('avatar_url')
    .eq('id', user.id)
    .single()

  if (prev?.avatar_url && typeof prev.avatar_url === 'string') {
    const marker = '/storage/v1/object/public/avatars/'
    const idx = prev.avatar_url.indexOf(marker)
    if (idx !== -1) {
      const oldPath = prev.avatar_url.slice(idx + marker.length)
      if (oldPath) await service.storage.from('avatars').remove([oldPath])
    }
  }

  const { data: updated, error } = await service
    .from('user_profiles')
    .update({ avatar_url: null })
    .eq('id', user.id)
    .select('id, email, full_name, avatar_url, job_title, is_platform_admin')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ profile: updated })
}
