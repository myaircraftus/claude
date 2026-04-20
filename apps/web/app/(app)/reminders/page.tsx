import { Topbar } from '@/components/shared/topbar'
import { requireAppServerSession } from '@/lib/auth/server-app'
import RemindersClient from './reminders-client'

export const metadata = { title: 'Reminders' }

export default async function RemindersPage({
  searchParams,
}: {
  searchParams?: {
    aircraft?: string
    add?: string
    request_reminder?: string
  }
}) {
  const { supabase, profile, membership } = await requireAppServerSession()

  const orgId = membership.organization_id
  const role = membership.role

  // Fetch aircraft for this org
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model, total_time_hours')
    .eq('organization_id', orgId)
    .eq('is_archived', false)
    .order('tail_number')

  const { data: mechanics } = await supabase
    .from('organization_memberships')
    .select('user_id, user:user_id(id, full_name, email)')
    .eq('organization_id', orgId)
    .eq('role', 'mechanic')
    .not('accepted_at', 'is', null)

  // Try to fetch reminders (table may not exist yet — handle gracefully)
  let reminders: any[] = []
  let requestStates: Record<string, { id: string; status: 'pending' | 'accepted' | 'declined' | 'converted_to_wo'; mechanic_name?: string }> = {}
  try {
    const { data } = await supabase
      .from('reminders')
      .select(`
        *,
        aircraft:aircraft_id(tail_number, make, model)
      `)
      .eq('organization_id', orgId)
      .neq('status', 'dismissed')
      .order('due_date', { ascending: true, nullsFirst: false })
    reminders = data ?? []
  } catch {
    // Table doesn't exist yet — show empty state
  }

  try {
    const { data } = await supabase
      .from('maintenance_requests')
      .select(`
        id,
        source_reminder_id,
        status,
        mechanic:target_mechanic_user_id(full_name, email)
      `)
      .eq('organization_id', orgId)
      .eq('request_source', 'reminder')
      .not('source_reminder_id', 'is', null)

    requestStates = Object.fromEntries(
      (data ?? [])
        .map((request: any) => {
          const sourceReminderId = request.source_reminder_id as string | null
          if (!sourceReminderId) return null
          const mechanic = Array.isArray(request.mechanic) ? request.mechanic[0] ?? null : request.mechanic ?? null
          return [
            sourceReminderId,
            {
              id: request.id,
              status: request.status,
              mechanic_name: mechanic?.full_name ?? mechanic?.email ?? undefined,
            },
          ]
        })
        .filter(Boolean) as Array<[string, { id: string; status: 'pending' | 'accepted' | 'declined' | 'converted_to_wo'; mechanic_name?: string }]>
    )
  } catch {}

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[{ label: 'Reminders' }]}
      />
      <RemindersClient
        reminders={reminders}
        aircraft={aircraft ?? []}
        orgId={orgId}
        mechanics={(mechanics ?? []).map((member: any) => {
          const profile = Array.isArray(member.user) ? member.user[0] ?? null : member.user ?? null
          return {
            id: member.user_id,
            full_name: profile?.full_name ?? profile?.email ?? 'Unknown mechanic',
            email: profile?.email ?? '',
          }
        })}
        currentUserRole={role}
        initialAircraftFilter={searchParams?.aircraft}
        initialOpenAddModal={searchParams?.add === '1'}
        initialAddAircraftId={searchParams?.aircraft}
        initialRequestReminderId={searchParams?.request_reminder}
        reminderRequestStates={requestStates}
      />
    </div>
  )
}
