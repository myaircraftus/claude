import { redirect } from 'next/navigation'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { ApprovalDetail } from '@/components/approvals/approval-detail'
import { createServerSupabase } from '@/lib/supabase/server'
import type { OrgRole } from '@/types'

export const metadata = { title: 'Approval request' }

/**
 * Per-approval detail page (Spec 1.5). Mounts ApprovalDetail — operator
 * sees the full request, can hit Send, copy the public link, and watch
 * customer responses populate as they come in.
 */
export default async function ApprovalDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const { profile, membership } = await requireAppServerSession()
  const supabase = createServerSupabase()
  const { data } = await supabase
    .from('approval_requests')
    .select('id, subject')
    .eq('id', params.id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()
  if (!data) redirect('/approvals')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Approvals', href: '/approvals' },
          { label: (data as { subject: string | null }).subject ?? 'Approval' },
        ]}
      />
      <main className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
        <ApprovalDetail requestId={params.id} userRole={membership.role as OrgRole} />
      </main>
    </div>
  )
}
