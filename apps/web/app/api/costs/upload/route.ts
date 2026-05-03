/**
 * POST /api/costs/upload (Spec 7.2)
 *
 * Accepts multipart/form-data with one file. Stores in the cost-receipts
 * bucket (private, signed-URL-only) and creates an intake_documents row
 * with status='received'. Sprint 7.3 will pick up the row and extract.
 *
 * Allowed mime types are enforced by the Storage bucket's allowed_mime_types
 * (set in migration 081); we double-check here for clearer error messages.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
])
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_ROLES = new Set(['owner', 'admin', 'mechanic', 'pilot'])

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })
  if (!ALLOWED_ROLES.has(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'multipart/form-data required' }, { status: 400 })

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB)` }, { status: 413 })
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: `Unsupported mime type: ${file.type}` }, { status: 415 })
  }

  // Storage path: org-scoped folder so RLS-bypassing service uploads don't
  // leak across orgs. Filename randomized to avoid clobbers.
  const ext = (file.name.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? '').toLowerCase()
  const stamp = new Date().toISOString().replace(/[^0-9T]/g, '').slice(0, 15)
  const rand = crypto.randomUUID().slice(0, 8)
  const path = `${membership.organization_id}/${stamp}-${rand}${ext}`

  const buf = Buffer.from(await file.arrayBuffer())
  const service = createServiceSupabase()
  const { error: upErr } = await service.storage
    .from('cost-receipts')
    .upload(path, buf, {
      contentType: file.type,
      upsert: false,
    })
  if (upErr) {
    return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })
  }

  const { data: pub } = service.storage.from('cost-receipts').getPublicUrl(path)
  const storage_url = pub?.publicUrl ?? null

  const { data: row, error: insErr } = await supabase
    .from('intake_documents')
    .insert({
      organization_id: membership.organization_id,
      uploaded_by: user.id,
      source: 'upload',
      filename: file.name,
      storage_path: path,
      storage_url,
      mime_type: file.type,
      file_size_bytes: file.size,
      status: 'received',
    })
    .select('*')
    .single()
  if (insErr || !row) {
    // Roll back the storage upload — don't leave an orphan blob.
    await service.storage.from('cost-receipts').remove([path]).catch(() => {})
    return NextResponse.json({ error: insErr?.message ?? 'Insert failed' }, { status: 500 })
  }

  return NextResponse.json({ intake: row }, { status: 201 })
}
