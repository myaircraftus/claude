import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { ChatShell } from '@/components/chat/chat-shell'

export const metadata = { title: 'Chat — myaircraft.us' }

export default async function ChatPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role, organizations(*)')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) redirect('/onboarding')

  const orgId = membership.organization_id

  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model, year, total_time_hours')
    .eq('organization_id', orgId)
    .eq('is_archived', false)
    .order('tail_number')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('full_name, job_title')
    .eq('id', user.id)
    .single()

  return (
    <ChatShell
      orgId={orgId}
      userId={user.id}
      aircraft={(aircraft ?? []) as any[]}
      userProfile={{ fullName: profile?.full_name ?? '', jobTitle: profile?.job_title ?? '' }}
      userRole={(membership as any).role}
    />
  )
}
