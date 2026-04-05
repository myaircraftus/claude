import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

// GET /api/marketplace/download/:id
// Generates a signed URL for a published (or own) community document
// Increments download_count and logs the event.

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const documentId = params.id
  const service = createServiceSupabase()

  // Fetch the document (service client bypasses RLS)
  const { data: doc, error: docErr } = await (service as any)
    .from('documents')
    .select('id, file_path, file_name, community_listing, listing_status, manual_access, uploaded_by, organization_id, price_cents, allow_download')
    .eq('id', documentId)
    .single()

  if (docErr || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const isOwner = doc.uploaded_by === user.id

  // Determine if user's org matches doc's org (team member)
  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('organization_id', doc.organization_id)
    .not('accepted_at', 'is', null)
    .maybeSingle()
  const isTeamMember = !!membership

  // Authorization rules:
  // - Owner of the doc: always allowed
  // - Team member + allow_download=true: allowed
  // - Any authenticated user + community_listing=true + listing_status=published + manual_access=free: allowed
  // - Paid listings: NOT allowed from this endpoint (require purchase flow, not yet built)
  const isFreeCommunity =
    doc.community_listing === true &&
    doc.listing_status === 'published' &&
    doc.manual_access === 'free'

  const isTeamShared =
    isTeamMember &&
    doc.allow_download === true

  if (!isOwner && !isTeamShared && !isFreeCommunity) {
    if (doc.manual_access === 'paid' && doc.community_listing === true && doc.listing_status === 'published') {
      return NextResponse.json(
        { error: 'Paid listings require purchase (not yet implemented)' },
        { status: 402 }
      )
    }
    return NextResponse.json({ error: 'Not authorized to download this document' }, { status: 403 })
  }

  // Generate signed URL (1 hour)
  const { data: signed, error: signErr } = await service.storage
    .from('documents')
    .createSignedUrl(doc.file_path, 60 * 60)

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: 'Failed to create download URL' }, { status: 500 })
  }

  // Increment download_count + log event (async, non-blocking on failure)
  await Promise.all([
    (service as any).rpc('increment_download_count', { doc_id: documentId }).then(
      async (res: any) => {
        // Fallback: if RPC doesn't exist, do a raw update
        if (res.error) {
          const { data: current } = await (service as any)
            .from('documents')
            .select('download_count')
            .eq('id', documentId)
            .single()
          if (current) {
            await (service as any)
              .from('documents')
              .update({ download_count: (current.download_count ?? 0) + 1 })
              .eq('id', documentId)
          }
        }
      }
    ),
    (service as any).from('marketplace_download_events').insert({
      document_id: documentId,
      downloader_id: user.id,
      downloader_org: membership?.organization_id ?? null,
    }),
  ])

  return NextResponse.json({
    url: signed.signedUrl,
    file_name: doc.file_name,
  })
}
