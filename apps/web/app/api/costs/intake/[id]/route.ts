/**
 * /api/costs/intake/[id]  (Spec 7.3)
 *
 *   GET    → intake row + latest extraction_results + linked cost_entries
 *   PATCH  → approve / reject the intake batch (mechanic+)
 *
 * On approve:
 *   - flip every linked cost_entry approved=true
 *   - intake_documents.status='posted'
 * On reject:
 *   - delete linked cost_entries (they were never approved)
 *   - intake_documents.status='rejected'
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const WRITE_ROLES = new Set(['owner', 'admin', 'mechanic'])

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })

  const { data: intake } = await supabase
    .from('intake_documents')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()
  if (!intake) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: latestExtraction } = await supabase
    .from('extraction_results')
    .select('*')
    .eq('intake_document_id', params.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: costEntries } = await supabase
    .from('cost_entries')
    .select('*')
    .eq('intake_document_id', params.id)
    .order('cost_date', { ascending: false })

  // Generate a short-lived signed URL so the operator UI can preview
  // the receipt PDF/image without exposing the storage bucket.
  let preview_url: string | null = null
  if ((intake as { storage_path?: string | null }).storage_path) {
    const service = createServiceSupabase()
    const { data: signed } = await service
      .storage.from('cost-receipts')
      .createSignedUrl((intake as { storage_path: string }).storage_path, 600)
    preview_url = signed?.signedUrl ?? null
  }

  return NextResponse.json({
    intake,
    extraction: latestExtraction ?? null,
    cost_entries: costEntries ?? [],
    preview_url,
  })
}

interface PatchBody {
  action?: 'approve' | 'reject' | 'edit_status'
  status?: 'review' | 'rejected'
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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
  if (!WRITE_ROLES.has(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let body: PatchBody
  try { body = (await req.json()) as PatchBody } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { data: intake } = await supabase
    .from('intake_documents')
    .select('id, status')
    .eq('id', params.id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()
  if (!intake) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (body.action === 'approve') {
    // Flip all linked cost_entries to approved=true.
    const { error: ceErr, count } = await supabase
      .from('cost_entries')
      .update({ approved: true }, { count: 'exact' })
      .eq('intake_document_id', params.id)
      .eq('organization_id', membership.organization_id)
    if (ceErr) return NextResponse.json({ error: ceErr.message }, { status: 500 })

    await supabase
      .from('intake_documents')
      .update({ status: 'posted' })
      .eq('id', params.id)
      .eq('organization_id', membership.organization_id)

    return NextResponse.json({ ok: true, posted: true, cost_entries_approved: count ?? 0 })
  }

  if (body.action === 'reject') {
    await supabase
      .from('cost_entries')
      .delete()
      .eq('intake_document_id', params.id)
      .eq('organization_id', membership.organization_id)

    await supabase
      .from('intake_documents')
      .update({ status: 'rejected' })
      .eq('id', params.id)
      .eq('organization_id', membership.organization_id)

    return NextResponse.json({ ok: true, rejected: true })
  }

  if (body.action === 'edit_status' && (body.status === 'review' || body.status === 'rejected')) {
    await supabase
      .from('intake_documents')
      .update({ status: body.status })
      .eq('id', params.id)
      .eq('organization_id', membership.organization_id)
    return NextResponse.json({ ok: true, status: body.status })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
