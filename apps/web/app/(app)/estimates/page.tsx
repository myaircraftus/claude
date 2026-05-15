// OWNER PERMISSIONS: Read-only. Can view estimates and approve/reject them.
// Cannot: create or edit estimates.
import { requireAppServerSession } from '@/lib/auth/server-app'
import { getCurrentPersona } from '@/lib/persona/server'
import { Topbar } from '@/components/shared/topbar'
import { OpsTabStrip } from '@/components/ops/ops-tab-strip'
import { EstimatesListView } from './estimates-list-view'

export const metadata = { title: 'Estimates' }

export default async function EstimatesPage() {
  const { supabase, profile, membership } = await requireAppServerSession()
  const { persona } = await getCurrentPersona()
  const isOwner = persona === 'owner'
  const orgId = membership.organization_id

  const { data: estimates } = await supabase
    .from('estimates')
    .select(`
      id, estimate_number, status, total, valid_until, service_type, deposit_required, deposit_amount, approval_status, created_at, updated_at,
      aircraft:aircraft_id (id, tail_number, make, model),
      customer:customer_id (id, name, company)
    `)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(200)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Estimates' }]} />
      <main className="flex-1 overflow-hidden flex">
        <div className="w-full flex flex-col">
          <OpsTabStrip active="estimates" />
          <EstimatesListView estimates={(estimates ?? []) as any[]} isOwner={isOwner} />
        </div>
      </main>
    </div>
  )
}
