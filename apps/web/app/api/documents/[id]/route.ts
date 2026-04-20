import { NextRequest, NextResponse } from 'next/server'
import { isDocumentDetailId, isDocumentGroupId } from '@/lib/documents/taxonomy'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { reconcileDocumentProcessingStates } from '@/lib/documents/processing-health'
import type { DocType } from '@/types'

export const dynamic = 'force-dynamic'

// ─── Route context type ────────────────────────────────────────────────────────

interface RouteContext {
  params: { id: string }
}

// ─── GET /api/documents/[id] ───────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = params

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
    return NextResponse.json({ error: 'No organization membership found' }, { status: 403 })
  }

  const { data: doc, error } = await supabase
    .from('documents')
    .select(
      `
      *,
      aircraft:aircraft_id (
        id,
        tail_number,
        make,
        model,
        year
      )
    `
    )
    .eq('id', id)
    .eq('organization_id', membership.organization_id)
    .single()

  if (error || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const serviceClient = createServiceSupabase()
  const [reconciled] = await reconcileDocumentProcessingStates(serviceClient, [doc])

  return NextResponse.json(
    { document: reconciled },
    {
      headers: {
        'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    }
  )
}

// ─── PUT /api/documents/[id] ───────────────────────────────────────────────────

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { id } = params

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
    return NextResponse.json({ error: 'No organization membership found' }, { status: 403 })
  }

  const ALLOWED_ROLES = ['owner', 'admin', 'mechanic']
  if (!ALLOWED_ROLES.includes(membership.role)) {
    return NextResponse.json(
      { error: 'Insufficient permissions. Mechanic role or higher required.' },
      { status: 403 }
    )
  }

  // Verify document belongs to this org
  const { data: existing } = await supabase
    .from('documents')
    .select('id')
    .eq('id', id)
    .eq('organization_id', membership.organization_id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Only allow updating safe fields
  const allowedFields = ['title', 'doc_type', 'aircraft_id', 'description']
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  for (const field of allowedFields) {
    if (field in body) {
      patch[field] = body[field] === '' ? null : body[field]
    }
  }

  if (patch.doc_type !== undefined) {
    const VALID_DOC_TYPES: DocType[] = [
      'logbook', 'poh', 'afm', 'afm_supplement', 'maintenance_manual', 'service_manual',
      'parts_catalog', 'service_bulletin', 'airworthiness_directive', 'work_order',
      'inspection_report', 'form_337', 'form_8130', 'lease_ownership', 'insurance',
      'compliance', 'miscellaneous',
    ]
    if (!VALID_DOC_TYPES.includes(patch.doc_type as DocType)) {
      return NextResponse.json({ error: 'Invalid doc_type value' }, { status: 400 })
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from('documents')
    .update(patch)
    .eq('id', id)
    .eq('organization_id', membership.organization_id)
    .select()
    .single()

  if (updateError || !updated) {
    console.error('[documents PUT] update error:', updateError)
    return NextResponse.json({ error: 'Failed to update document' }, { status: 500 })
  }

  return NextResponse.json({ document: updated })
}

// ─── PATCH /api/documents/[id] ────────────────────────────────────────────────
// Partial update for ownership/listing fields. Uploader-only by default, but
// allow admins/owners to toggle on any doc.

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = params

  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

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
    return NextResponse.json({ error: 'No organization membership found' }, { status: 403 })
  }

  // Fetch doc to check ownership
  const { data: existing } = await (supabase as any)
    .from('documents')
    .select(
      'id, uploaded_by, organization_id, manual_access, listing_status, community_listing, doc_type, price_cents'
    )
    .eq('id', id)
    .eq('organization_id', membership.organization_id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const isUploader = existing.uploaded_by === user.id
  const isAdmin = ['owner', 'admin'].includes(membership.role)
  if (!isUploader && !isAdmin) {
    return NextResponse.json(
      { error: 'Only the uploader or an admin may modify ownership fields' },
      { status: 403 }
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Whitelist of patchable fields
  const allowedFields = [
    'title',
    'description',
    'aircraft_id',
    'doc_type',
    'document_group_id',
    'document_detail_id',
    'document_subtype',
    'revision',
    'allow_download',
    'community_listing',
    'manual_access',
    'marketplace_downloadable',
    'marketplace_injectable',
    'marketplace_preview_available',
    'price_cents',
    'visibility',
    'listing_status', // admins only for status changes
  ]
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const field of allowedFields) {
    if (field in body) {
      if (field === 'listing_status' && !isAdmin) continue
      const rawValue = body[field]
      patch[field] =
        typeof rawValue === 'string' ? (rawValue.trim() === '' ? null : rawValue.trim()) : rawValue
    }
  }

  const VALID_DOC_TYPES: DocType[] = [
    'logbook', 'poh', 'afm', 'afm_supplement', 'maintenance_manual', 'service_manual',
    'parts_catalog', 'service_bulletin', 'airworthiness_directive', 'work_order',
    'inspection_report', 'form_337', 'form_8130', 'lease_ownership', 'insurance',
    'compliance', 'miscellaneous',
  ]
  if (patch.doc_type !== undefined && patch.doc_type !== null && !VALID_DOC_TYPES.includes(patch.doc_type as DocType)) {
    return NextResponse.json({ error: 'Invalid doc_type value' }, { status: 400 })
  }

  if (
    patch.document_group_id !== undefined &&
    patch.document_group_id !== null &&
    !isDocumentGroupId(String(patch.document_group_id))
  ) {
    return NextResponse.json({ error: 'Invalid document_group_id value' }, { status: 400 })
  }

  if (
    patch.document_detail_id !== undefined &&
    patch.document_detail_id !== null &&
    !isDocumentDetailId(String(patch.document_detail_id))
  ) {
    return NextResponse.json({ error: 'Invalid document_detail_id value' }, { status: 400 })
  }

  if (
    patch.manual_access !== undefined &&
    patch.manual_access !== null &&
    !['private', 'free', 'paid'].includes(String(patch.manual_access))
  ) {
    return NextResponse.json({ error: 'Invalid manual_access value' }, { status: 400 })
  }

  if (
    patch.listing_status !== undefined &&
    patch.listing_status !== null &&
    !['draft', 'pending_review', 'published', 'rejected'].includes(String(patch.listing_status))
  ) {
    return NextResponse.json({ error: 'Invalid listing_status value' }, { status: 400 })
  }

  if (patch.price_cents !== undefined) {
    if (patch.price_cents === null) {
      patch.price_cents = null
    } else {
      const cents = Number(patch.price_cents)
      if (!Number.isFinite(cents) || cents < 0 || cents > 100_000_000) {
        return NextResponse.json({ error: 'Invalid price_cents value' }, { status: 400 })
      }
      patch.price_cents = Math.round(cents)
    }
  }

  const nextManualAccess = (patch.manual_access ?? existing.manual_access) as string | null
  let nextCommunityListing =
    patch.community_listing !== undefined
      ? Boolean(patch.community_listing)
      : Boolean(existing.community_listing)

  if (nextManualAccess === 'private') {
    nextCommunityListing = false
  } else if (nextManualAccess === 'free' || nextManualAccess === 'paid') {
    nextCommunityListing = true
  }

  patch.community_listing = nextCommunityListing

  if (!nextCommunityListing) {
    patch.listing_status = null
  } else if (patch.listing_status === undefined) {
    const existingStatus = typeof existing.listing_status === 'string' ? existing.listing_status : null
    patch.listing_status =
      existingStatus === 'published' || existingStatus === 'pending_review'
        ? existingStatus
        : 'pending_review'
  }

  if (nextManualAccess === 'paid' && (patch.price_cents ?? existing.price_cents) == null) {
    return NextResponse.json({ error: 'price_cents is required for paid marketplace listings' }, { status: 400 })
  }

  const service = createServiceSupabase()
  const { data: updated, error: updateError } = await (service as any)
    .from('documents')
    .update(patch)
    .eq('id', id)
    .select(`
      id,
      title,
      doc_type,
      description,
      file_name,
      page_count,
      manual_access,
      marketplace_downloadable,
      marketplace_injectable,
      marketplace_preview_available,
      price_cents,
      listing_status,
      uploaded_by,
      uploader_name,
      document_group_id,
      document_detail_id,
      document_subtype,
      record_family,
      truth_role,
      parser_strategy,
      revision,
      uploaded_at,
      updated_at,
      aircraft:aircraft_id (tail_number, make, model)
    `)
    .single()

  if (updateError || !updated) {
    console.error('[documents PATCH] update error:', updateError)
    return NextResponse.json({ error: 'Failed to update document' }, { status: 500 })
  }

  return NextResponse.json({ document: updated })
}

// ─── DELETE /api/documents/[id] ───────────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = params

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
    return NextResponse.json({ error: 'No organization membership found' }, { status: 403 })
  }

  // Only owner or admin may delete
  const DELETE_ALLOWED_ROLES = ['owner', 'admin']
  if (!DELETE_ALLOWED_ROLES.includes(membership.role)) {
    return NextResponse.json(
      { error: 'Insufficient permissions. Admin or owner role required to delete documents.' },
      { status: 403 }
    )
  }

  const serviceClient = createServiceSupabase()

  // Fetch the document to get its file_path
  const { data: doc, error: fetchError } = await serviceClient
    .from('documents')
    .select('id, file_path, title')
    .eq('id', id)
    .eq('organization_id', membership.organization_id)
    .single()

  if (fetchError || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  // Delete from Storage
  const { error: storageError } = await serviceClient.storage
    .from('documents')
    .remove([doc.file_path])

  if (storageError) {
    console.error('[documents DELETE] storage removal error:', storageError)
    // Non-fatal: proceed to delete DB record; storage can be cleaned up separately
  }

  // Delete DB record (cascades to chunks, citations, etc. via FK constraints)
  const { error: deleteError } = await serviceClient
    .from('documents')
    .delete()
    .eq('id', id)
    .eq('organization_id', membership.organization_id)

  if (deleteError) {
    console.error('[documents DELETE] db delete error:', deleteError)
    return NextResponse.json({ error: 'Failed to delete document record' }, { status: 500 })
  }

  // Write audit log
  await serviceClient.from('audit_logs').insert({
    organization_id: membership.organization_id,
    user_id: user.id,
    action: 'document.delete',
    resource_type: 'document',
    resource_id: id,
    metadata_json: { title: doc.title, file_path: doc.file_path },
  })

  return NextResponse.json({ success: true })
}
