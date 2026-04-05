import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

// POST /api/marketplace/moderate
// Body: { documentId: string, action: 'approve' | 'reject', reason?: string }
// Platform admins only. Uses service client to bypass RLS.

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify platform admin
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_platform_admin) {
    return NextResponse.json({ error: 'Platform admin required' }, { status: 403 })
  }

  // Parse body
  let body: { documentId?: string; action?: string; reason?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { documentId, action, reason } = body
  if (!documentId || !['approve', 'reject'].includes(action ?? '')) {
    return NextResponse.json(
      { error: 'documentId and action (approve|reject) required' },
      { status: 400 }
    )
  }

  // Use service client to bypass RLS
  const service = createServiceSupabase()
  const newStatus = action === 'approve' ? 'published' : 'rejected'

  const { data: updated, error } = await (service as any)
    .from('documents')
    .update({ listing_status: newStatus })
    .eq('id', documentId)
    .eq('community_listing', true)
    .select('id, title, organization_id')
    .single()

  if (error || !updated) {
    return NextResponse.json({ error: 'Document not found or update failed' }, { status: 404 })
  }

  // Log moderation action
  await (service as any).from('marketplace_moderation_log').insert({
    document_id: documentId,
    moderator_id: user.id,
    action: action === 'approve' ? 'approved' : 'rejected',
    reason: reason || null,
  })

  // Audit log
  await (service as any).from('audit_logs').insert({
    organization_id: updated.organization_id,
    user_id: user.id,
    action: `marketplace.${action}`,
    resource_type: 'document',
    resource_id: documentId,
    metadata_json: { reason: reason || null, title: updated.title },
  })

  return NextResponse.json({ ok: true, status: newStatus })
}
