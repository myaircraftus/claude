import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import RemindersClient from './reminders-client'
import type { UserProfile } from '@/types'

export const metadata = { title: 'Reminders' }

export default async function RemindersPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
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

  // Fetch aircraft for this org
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model, total_time_hours')
    .eq('organization_id', orgId)
    .eq('is_archived', false)
    .order('tail_number')

  // Try to fetch reminders (table may not exist yet — handle gracefully)
  let reminders: any[] = []
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
      />
    </div>
  )
}
