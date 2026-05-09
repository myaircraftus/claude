/**
 * /(app)/admin/vision/review  (Phase 8 Sprint 8.7)
 *
 * Triage UI for the vision review queue. Admin/owner only. Lists
 * pending items by default; tabs for reviewed_problem / reviewed_ok /
 * dismissed surface previously-actioned rows. Click a row to open the
 * page-detail modal with the page image + reason + Mark OK / Mark
 * Problem / Dismiss buttons.
 */
import { redirect } from 'next/navigation'
import { Topbar } from '@/components/shared/topbar'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { listReviewQueue } from '@/lib/vision/review-queue'
import { ReviewQueueClient } from './review-queue-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Vision Review Queue (Admin)' }

export default async function AdminVisionReviewPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('full_name, email, is_platform_admin')
    .eq('id', user.id)
    .maybeSingle()

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) redirect('/login')
  if (!['owner', 'admin'].includes(membership.role)) redirect('/')

  const service = createServiceSupabase()
  const orgId = membership.organization_id

  const [pendingItems, reviewedItems, dismissedItems] = await Promise.all([
    listReviewQueue(service, orgId, { status: 'pending', limit: 100 }),
    listReviewQueue(service, orgId, {
      status: ['reviewed_ok', 'reviewed_problem'],
      limit: 100,
    }),
    listReviewQueue(service, orgId, { status: 'dismissed', limit: 100 }),
  ])

  // Hydrate page metadata for each item — file name, page number,
  // image storage path. One round-trip per status group is fine for
  // admin's list size (≤ 100 rows).
  const allPageIds = Array.from(
    new Set([
      ...pendingItems.map((i) => i.vision_page_id),
      ...reviewedItems.map((i) => i.vision_page_id),
      ...dismissedItems.map((i) => i.vision_page_id),
    ]),
  )
  const { data: pageRows } = allPageIds.length
    ? await service
        .from('vision_pages')
        .select('id, source_document_id, page_number, image_storage_path, status')
        .in('id', allPageIds)
        .eq('organization_id', orgId)
    : { data: [] as any[] }
  const pageById = new Map<string, any>()
  for (const p of (pageRows ?? []) as any[]) pageById.set(p.id, p)

  const sourceDocIds = Array.from(
    new Set(((pageRows ?? []) as any[]).map((p) => p.source_document_id).filter(Boolean)),
  )
  const { data: docRows } = sourceDocIds.length
    ? await service
        .from('documents')
        .select('id, file_name')
        .in('id', sourceDocIds)
    : { data: [] as any[] }
  const docNameById = new Map<string, string>()
  for (const d of (docRows ?? []) as any[]) docNameById.set(d.id, d.file_name ?? d.id)

  function decorate(items: any[]) {
    return items.map((item) => {
      const page = pageById.get(item.vision_page_id)
      return {
        ...item,
        page_number: page?.page_number ?? null,
        source_document_id: page?.source_document_id ?? null,
        file_name: page ? docNameById.get(page.source_document_id) ?? null : null,
      }
    })
  }

  const profileForTopbar = {
    id: user.id,
    email: user.email ?? '',
    full_name: profile?.full_name ?? user.email ?? '',
    avatar_url: null,
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profileForTopbar as any}
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Vision Index', href: '/admin/vision' },
          { label: 'Review Queue' },
        ]}
      />
      <main className="flex-1 overflow-y-auto p-6 max-w-6xl mx-auto w-full">
        <ReviewQueueClient
          pending={decorate(pendingItems)}
          reviewed={decorate(reviewedItems)}
          dismissed={decorate(dismissedItems)}
        />
      </main>
    </div>
  )
}
