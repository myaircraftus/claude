import { notFound } from 'next/navigation'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { ToolDetail } from './tool-detail'

export const metadata = { title: 'Tool detail' }

export default async function ToolDetailPage({ params }: { params: { id: string } }) {
  const { supabase, profile, membership } = await requireAppServerSession()

  const { data: tool } = await supabase
    .from('tools').select('*')
    .eq('id', params.id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()
  if (!tool) notFound()

  const isAdmin = ['owner', 'admin'].includes(membership.role)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Tools', href: '/tools' }, { label: (tool as any).name }]} />
      <main className="flex-1 overflow-auto">
        <ToolDetail initialTool={tool as any} currentUserId={profile.id} isAdmin={isAdmin} />
      </main>
    </div>
  )
}
