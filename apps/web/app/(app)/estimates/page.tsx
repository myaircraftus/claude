// OWNER PERMISSIONS: Read-only. Can view estimates and approve/reject them.
// Cannot: create or edit estimates.
import { requireAppServerSession } from '@/lib/auth/server-app'
import { getCurrentPersona } from '@/lib/persona/server'
import { Topbar } from '@/components/shared/topbar'
import { OpsTabStrip } from '@/components/ops/ops-tab-strip'
import { EstimatesListView } from './estimates-list-view'

export const metadata = { title: 'Estimates' }

// Server-side pagination: 25 rows/page via ?page=. Previously this page
// loaded up to 200 rows for the org on every render — a full table scan
// plus a large client payload once a shop has real estimate volume.
const PAGE_SIZE = 25

export default async function EstimatesPage({
  searchParams,
}: {
  searchParams: { page?: string }
}) {
  const { supabase, profile, membership } = await requireAppServerSession()
  const { persona } = await getCurrentPersona()
  const isOwner = persona === 'owner'
  const orgId = membership.organization_id

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10))
  const offset = (page - 1) * PAGE_SIZE

  const { data: estimates, count } = await supabase
    .from('estimates')
    .select(`
      id, estimate_number, status, total, valid_until, service_type, deposit_required, deposit_amount, approval_status, created_at, updated_at,
      aircraft:aircraft_id (id, tail_number, make, model),
      customer:customer_id (id, name, company)
    `, { count: 'exact' })
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Estimates' }]} />
      <main className="flex-1 overflow-hidden flex">
        <div className="w-full flex flex-col">
          <OpsTabStrip active="estimates" />
          <EstimatesListView
            estimates={(estimates ?? []) as any[]}
            isOwner={isOwner}
            page={page}
            totalPages={totalPages}
          />
        </div>
      </main>
    </div>
  )
}
