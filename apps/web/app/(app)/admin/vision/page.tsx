/**
 * /(app)/admin/vision  (Phase 8 Sprint 8.4)
 *
 * Vision-RAG operational dashboard. Admin-only. Shows:
 *   - vision_pages count by status
 *   - vision_embeddings count
 *   - Recent vision_index_jobs
 *   - "Trigger render" button per source_document_id (admin pulls
 *     from a list of recent documents that don't yet have vision
 *     pages — calls /api/vision/render).
 *   - "Trigger dispatch" button per queued job (calls /api/vision/dispatch).
 *
 * The buttons are intentionally simple POSTs — no toasts / spinners
 * yet. This is the admin's manual cockpit for driving the future GPU
 * run (the cron sweep handles the automated path).
 */
import { redirect } from 'next/navigation'
import { Topbar } from '@/components/shared/topbar'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { listVisionPages, listVisionIndexJobs } from '@/lib/vision/registry'
import { VisionAdminDashboard } from './vision-admin-dashboard'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Vision Index (Admin)' }

export default async function AdminVisionPage() {
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

  // Use the service-role client for the admin reads — these surfaces
  // are intentionally privileged and need to bypass RLS to show the
  // ground-truth status board.
  const service = createServiceSupabase()
  const orgId = membership.organization_id

  const [allPages, recentJobs] = await Promise.all([
    listVisionPages(service, orgId, { include_deleted: false }),
    listVisionIndexJobs(service, orgId),
  ])

  const { data: embedRows } = await service
    .from('vision_embeddings')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
  const embeddingCount = (embedRows as unknown as { count: number } | null)?.count ?? 0

  // Documents that DON'T have vision pages yet — pull a small list so
  // admin can render a few at a time. Read-only of the documents table
  // (sacred boundary).
  const { data: recentDocs } = await service
    .from('documents')
    .select('id, file_name, organization_id, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(50)

  const docsWithVisionPageIds = new Set(allPages.map((p) => p.source_document_id))
  const candidateDocs = ((recentDocs ?? []) as Array<{ id: string; file_name: string | null; created_at: string }>)
    .filter((d) => !docsWithVisionPageIds.has(d.id))
    .slice(0, 20)

  // Status histogram.
  const byStatus: Record<string, number> = {
    pending: 0, rendering: 0, embedding: 0, indexed: 0, failed: 0, review_required: 0,
  }
  for (const p of allPages) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1

  // Profile for Topbar
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
          { label: 'Vision Index' },
        ]}
      />
      <main className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full">
        <VisionAdminDashboard
          orgId={orgId}
          pageCountByStatus={byStatus}
          totalPages={allPages.length}
          embeddingCount={embeddingCount}
          recentJobs={recentJobs.slice(0, 25)}
          candidateDocs={candidateDocs}
        />
      </main>
    </div>
  )
}
