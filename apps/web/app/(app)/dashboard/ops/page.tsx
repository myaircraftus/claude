import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import type { UserProfile } from '@/types'
import { OpsDashboardClient } from './ops-dashboard-client'

export const metadata = { title: 'Operations Dashboard' }

export default async function OpsDashboardPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/login')

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) redirect('/login')

  const orgId = (membership as any).organization_id

  // Fetch team members
  const { data: members } = await supabase
    .from('organization_memberships')
    .select(`
      id, role, permissions, accepted_at,
      user_profiles:user_id (id, full_name, email, avatar_url, job_title)
    `)
    .eq('organization_id', orgId)
    .not('accepted_at', 'is', null)
    .order('role')

  // Fetch work order stats by assignee
  const { data: workOrders } = await supabase
    .from('work_orders')
    .select('id, status, assigned_mechanic_id, aircraft_id, customer_id, created_at, updated_at')
    .eq('organization_id', orgId)
    .not('status', 'in', '("archived")')
    .order('updated_at', { ascending: false })
    .limit(200)

  // Fetch aircraft
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model')
    .eq('organization_id', orgId)

  // Fetch recent invoices summary
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, status, total, balance_due, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(100)

  // Fetch pending maintenance requests
  const { data: maintenanceRequests } = await supabase
    .from('maintenance_requests')
    .select('id, status, aircraft_id, target_mechanic_user_id, created_at')
    .eq('organization_id', orgId)
    .eq('status', 'pending')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile as UserProfile}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Operations' },
        ]}
      />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <OpsDashboardClient
          members={(members ?? []) as any}
          workOrders={(workOrders ?? []) as any}
          aircraft={(aircraft ?? []) as any}
          invoices={(invoices ?? []) as any}
          pendingRequests={(maintenanceRequests ?? []) as any}
          currentUserId={user.id}
        />
      </main>
    </div>
  )
}
