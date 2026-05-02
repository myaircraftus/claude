/**
 * GET /documents/[id]
 *
 * Full-page document viewer. Used as the destination for citation deeplinks
 * out of the Ask AI surface — every citation pill and inline [N] marker can
 * now navigate to a real, shareable URL like:
 *   /documents/<docId>?page=12&chunk=<chunkId>&snippet=<text>
 *
 * The page mounts the same DocumentViewer the in-page side panel uses, so
 * highlights and bounding-region overlays stay consistent between the two
 * surfaces.
 */

import { redirect, notFound } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { DocumentViewerPage } from '@/components/documents/document-viewer-page'
import type { AnswerCitation } from '@/types'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { id: string }
  searchParams: Record<string, string | string[] | undefined>
}

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

export default async function DocumentPage({ params, searchParams }: PageProps) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=/documents/${params.id}`)

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .limit(1)
    .single()
  if (!membership) redirect('/onboarding')

  const { data: doc } = await supabase
    .from('documents')
    .select('id, title, file_name, doc_type, page_count, aircraft_id')
    .eq('id', params.id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()
  if (!doc) notFound()

  const pageParam = parseInt(firstParam(searchParams.page) ?? '1', 10)
  const pageNumber = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1
  const chunkId = firstParam(searchParams.chunk) ?? null
  const snippet = firstParam(searchParams.snippet) ?? null

  const citation: AnswerCitation | null =
    chunkId || snippet
      ? {
          chunkId: chunkId ?? '',
          documentId: doc.id,
          documentTitle: doc.title ?? doc.file_name ?? 'Document',
          docType: (doc.doc_type as AnswerCitation['docType']) ?? 'other',
          pageNumber,
          snippet: snippet ?? '',
          quotedText: snippet ?? undefined,
          relevanceScore: 0,
        }
      : null

  return (
    <DocumentViewerPage
      documentId={doc.id}
      title={doc.title ?? doc.file_name ?? 'Document'}
      docType={(doc.doc_type as string | null) ?? null}
      pageCount={doc.page_count ?? null}
      aircraftId={doc.aircraft_id ?? null}
      citation={citation}
    />
  )
}
