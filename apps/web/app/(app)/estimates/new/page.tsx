import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { EstimateCreateWorkspace } from '@/components/estimates/estimate-create-workspace'

export const metadata = { title: 'New Estimate' }

export default async function NewEstimatePage({
  searchParams,
}: {
  searchParams: { aircraft_id?: string; squawk_id?: string }
}) {
  const { supabase, profile, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  const [aircraftRes, customersRes, squawksRes] = await Promise.all([
    supabase
      .from('aircraft')
      .select('id, tail_number, make, model, owner_customer_id')
      .eq('organization_id', orgId)
      .order('tail_number', { ascending: true })
      .limit(500),
    supabase
      .from('customers')
      .select('id, name, company, email')
      .eq('organization_id', orgId)
      .order('name', { ascending: true })
      .limit(500),
    supabase
      .from('squawks')
      .select('id, aircraft_id, title, description, severity, status')
      .eq('organization_id', orgId)
      .not('status', 'in', '("resolved","closed_duplicate","closed_not_reproducible","closed_owner_declined","archived")')
      .order('created_at', { ascending: false })
      .limit(300),
  ])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Estimates', href: '/estimates' }, { label: 'New' }]} />
      <main className="flex-1 overflow-y-auto">
        <EstimateCreateWorkspace
          aircraftOptions={(aircraftRes.data ?? []) as any[]}
          customers={(customersRes.data ?? []) as any[]}
          squawks={(squawksRes.data ?? []) as any[]}
          initialAircraftId={searchParams.aircraft_id ?? null}
          initialSquawkId={searchParams.squawk_id ?? null}
        />
      </main>
    </div>
  )
}
