import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import type { UserProfile } from '@/types'
import { PartsWorkspace } from './components/parts-workspace'

export const metadata = { title: 'Parts' }

interface SearchParams { aircraft?: string; status?: string; tab?: string }

export default async function PartsPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileRes, membershipRes] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('organization_memberships')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single(),
  ])
  const profile = profileRes.data as UserProfile
  if (!profile || !membershipRes.data) redirect('/login')

  const orgId = membershipRes.data.organization_id

  // Aircraft list for search filter
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model, year')
    .eq('organization_id', orgId)
    .eq('is_archived', false)
    .order('tail_number')

  // Recent orders
  let ordersQuery: any = supabase
    .from('part_order_records')
    .select(`
      id, status, quantity, unit_price, total_price, currency, vendor_name, vendor_url,
      selected_part_number, selected_title, selected_condition, selected_image_url,
      aircraft_id, work_order_id, created_at, updated_at,
      aircraft:aircraft_id (id, tail_number)
    `)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (searchParams.aircraft) ordersQuery = ordersQuery.eq('aircraft_id', searchParams.aircraft)
  if (searchParams.status) ordersQuery = ordersQuery.eq('status', searchParams.status)
  const { data: orders } = await ordersQuery

  // Stats
  const { data: allStatuses } = await supabase
    .from('part_order_records')
    .select('status, total_price')
    .eq('organization_id', orgId)

  const stats = {
    total: allStatuses?.length ?? 0,
    ordered: allStatuses?.filter((r: any) => ['marked_ordered','confirmed','shipped'].includes(r.status)).length ?? 0,
    received: allStatuses?.filter((r: any) => ['received','installed','delivered'].includes(r.status)).length ?? 0,
    spend: (allStatuses ?? []).reduce((acc: number, r: any) => acc + Number(r.total_price ?? 0), 0),
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Parts' }]} />
      <main className="flex-1 overflow-y-auto">
        <PartsWorkspace
          orgId={orgId}
          aircraft={(aircraft ?? []) as any}
          orders={(orders ?? []) as any}
          stats={stats}
          initialTab={(searchParams.tab as any) ?? 'search'}
          initialAircraftId={searchParams.aircraft}
          initialStatus={searchParams.status}
        />
      </main>
    </div>
  )
}
