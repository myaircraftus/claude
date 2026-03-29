import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { Sidebar } from '@/components/shared/sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get user profile + membership
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role, organizations(*)')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()

  // No org yet → onboarding
  if (!membership) redirect('/onboarding')

  const organization = (membership as any).organizations

  // Get aircraft for sidebar
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model')
    .eq('organization_id', membership.organization_id)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(10)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        organization={organization}
        aircraft={aircraft ?? []}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  )
}
