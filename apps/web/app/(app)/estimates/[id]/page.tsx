import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { EstimateDetail } from './estimate-detail'

export default async function EstimateDetailPage({ params }: { params: { id: string } }) {
  const { profile, membership } = await requireAppServerSession()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Estimates', href: '/estimates' },
          { label: 'Estimate' },
        ]}
      />
      <EstimateDetail estimateId={params.id} userRole={membership.role} />
    </div>
  )
}
