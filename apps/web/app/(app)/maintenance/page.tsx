import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import type { UserProfile, Aircraft, MaintenanceEntryDraft } from '@/types'
import { MaintenanceHubClient } from './maintenance-hub-client'

export const metadata = { title: 'Maintenance' }

interface SearchParams {
  tab?: string
  aircraft?: string
  wo?: string
  status?: string
}

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileRes, membershipRes] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('organization_memberships')
      .select('organization_id, role, organizations(*)')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single(),
  ])

  const profile = profileRes.data as UserProfile
  const membership = membershipRes.data
  if (!membership) redirect('/onboarding')

  const orgId = membership.organization_id
  const userRole = membership.role

  // ─── Parallel data fetching for all 4 tabs ─────────────────────────────────

  const [
    aircraftRes,
    draftsRes,
    workOrdersRes,
    allStatusesRes,
    ordersRes,
    orderStatsRes,
    membersRes,
    opsWorkOrdersRes,
    invoicesRes,
    pendingRequestsRes,
  ] = await Promise.all([
    // Shared: aircraft list
    supabase
      .from('aircraft')
      .select('id, tail_number, make, model, year')
      .eq('organization_id', orgId)
      .eq('is_archived', false)
      .order('tail_number'),

    // Tab 1: Entry Generator - maintenance entry drafts
    supabase
      .from('maintenance_entry_drafts')
      .select('*, aircraft:aircraft_id(tail_number, make, model)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50),

    // Tab 2: Work Orders - list with aircraft join
    supabase
      .from('work_orders')
      .select(`
        id, work_order_number, status, customer_complaint, labor_total, parts_total,
        outside_services_total, total, opened_at, created_at,
        aircraft:aircraft_id (id, tail_number, make, model)
      `)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false }),

    // Tab 2: Work Orders - stats
    supabase
      .from('work_orders')
      .select('status')
      .eq('organization_id', orgId),

    // Tab 3: Parts - orders
    supabase
      .from('part_order_records')
      .select(`
        id, status, quantity, unit_price, total_price, currency, vendor_name, vendor_url,
        selected_part_number, selected_title, selected_condition, selected_image_url,
        aircraft_id, work_order_id, created_at, updated_at,
        aircraft:aircraft_id (id, tail_number)
      `)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(100),

    // Tab 3: Parts - stats
    supabase
      .from('part_order_records')
      .select('status, total_price')
      .eq('organization_id', orgId),

    // Tab 4: Workflow - team members
    supabase
      .from('organization_memberships')
      .select(`
        id, role, permissions, accepted_at,
        user_profiles:user_id (id, full_name, email, avatar_url, job_title)
      `)
      .eq('organization_id', orgId)
      .not('accepted_at', 'is', null)
      .order('role'),

    // Tab 4: Workflow - work orders (for kanban)
    supabase
      .from('work_orders')
      .select('id, status, assigned_mechanic_id, aircraft_id, customer_id, created_at, updated_at')
      .eq('organization_id', orgId)
      .not('status', 'in', '("archived")')
      .order('updated_at', { ascending: false })
      .limit(200),

    // Tab 4: Workflow - invoices
    supabase
      .from('invoices')
      .select('id, status, total, balance_due, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(100),

    // Tab 4: Workflow - pending maintenance requests
    supabase
      .from('maintenance_requests')
      .select('id, status, aircraft_id, target_mechanic_user_id, created_at')
      .eq('organization_id', orgId)
      .eq('status', 'pending'),
  ])

  const aircraft = (aircraftRes.data ?? []) as Pick<Aircraft, 'id' | 'tail_number' | 'make' | 'model' | 'year'>[]
  const drafts = (draftsRes.data ?? []) as (MaintenanceEntryDraft & { aircraft?: Pick<Aircraft, 'tail_number' | 'make' | 'model'> | null })[]
  const workOrders = workOrdersRes.data ?? []
  const allStatuses = allStatusesRes.data ?? []

  const workOrderStats = {
    open: allStatuses.filter(r => r.status === 'open').length,
    in_progress: allStatuses.filter(r => r.status === 'in_progress').length,
    ready_for_signoff: allStatuses.filter(r => r.status === 'ready_for_signoff').length,
    total: allStatuses.length,
  }

  const orders = ordersRes.data ?? []
  const allOrderStats = orderStatsRes.data ?? []
  const partsStats = {
    total: allOrderStats.length,
    ordered: allOrderStats.filter((r: any) => ['marked_ordered', 'confirmed', 'shipped'].includes(r.status)).length,
    received: allOrderStats.filter((r: any) => ['received', 'installed', 'delivered'].includes(r.status)).length,
    spend: allOrderStats.reduce((acc: number, r: any) => acc + Number(r.total_price ?? 0), 0),
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[{ label: 'Maintenance' }]}
      />
      <MaintenanceHubClient
        orgId={orgId}
        userRole={userRole}
        currentUserId={user.id}
        aircraft={aircraft as any}
        defaultTab={searchParams.tab ?? 'entries'}
        drafts={drafts}
        selectedAircraftId={searchParams.aircraft ?? null}
        workOrders={workOrders}
        workOrderStats={workOrderStats}
        orders={orders}
        partsStats={partsStats}
        members={(membersRes.data ?? []) as any}
        opsWorkOrders={(opsWorkOrdersRes.data ?? []) as any}
        invoices={(invoicesRes.data ?? []) as any}
        pendingRequests={(pendingRequestsRes.data ?? []) as any}
      />
    </div>
  )
}
