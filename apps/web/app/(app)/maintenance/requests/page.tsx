import { Topbar } from '@/components/shared/topbar'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { RequestsList } from './requests-list'

export const metadata = { title: 'Maintenance Requests' }

export default async function MaintenanceRequestsPage() {
  const { supabase, user, profile, membership } = await requireAppServerSession()

  const orgId = membership.organization_id
  const role = membership.role

  // Fetch maintenance requests with joins
  let query = supabase
    .from('maintenance_requests')
    .select(`
      id, aircraft_id, requester_user_id, target_mechanic_user_id,
      message, squawk_ids, status, created_work_order_id, request_source,
      source_reminder_id, source_summary,
      created_at, responded_at,
      requester:requester_user_id (id, full_name, email, avatar_url),
      mechanic:target_mechanic_user_id (id, full_name, email, avatar_url),
      aircraft:aircraft_id (id, tail_number, make, model),
      source_reminder:source_reminder_id (id, title, reminder_type)
    `)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(100)

  // Mechanics see requests targeted at them
  if (role === 'mechanic') {
    query = query.eq('target_mechanic_user_id', user.id)
  } else if (role === 'pilot') {
    query = query.eq('requester_user_id', user.id)
  }

  const { data: requests } = await query

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Maintenance', href: '/maintenance' },
          { label: 'Requests' },
        ]}
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          <RequestsList
            initialRequests={(requests ?? []).map((r: any) => ({
              ...r,
              requester: Array.isArray(r.requester) ? r.requester[0] ?? null : r.requester ?? null,
              mechanic: Array.isArray(r.mechanic) ? r.mechanic[0] ?? null : r.mechanic ?? null,
              aircraft: Array.isArray(r.aircraft) ? r.aircraft[0] ?? null : r.aircraft ?? null,
              source_reminder: Array.isArray(r.source_reminder) ? r.source_reminder[0] ?? null : r.source_reminder ?? null,
            }))}
            currentUserRole={role}
          />
        </div>
      </main>
    </div>
  )
}
