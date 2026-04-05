import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import LibraryClient from './library-client'
import type { UserProfile } from '@/types'

export const metadata = { title: 'Community Library' }

export default async function LibraryPage({
  searchParams,
}: {
  searchParams?: { tab?: string }
}) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileRes, membershipRes] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', user.id).single(),
    supabase.from('organization_memberships')
      .select('organization_id, role, organizations(*)')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single(),
  ])

  const profile = profileRes.data as UserProfile
  const membership = membershipRes.data
  if (!membership) redirect('/onboarding')

  let items: any[] = []
  try {
    const { data } = await supabase
      .from('community_library_items')
      .select('*')
      .eq('is_public', true)
      .eq('status', 'active')
      .order('download_count', { ascending: false })
      .limit(50)
    items = data ?? []
  } catch {}

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[{ label: 'Community Library' }]}
      />
      <LibraryClient
        items={items}
        orgId={membership.organization_id}
        userId={user.id}
        userName={profile?.full_name ?? profile?.email}
        userRole={membership.role}
        initialTab={searchParams?.tab === 'upload' ? 'upload' : 'browse'}
      />
    </div>
  )
}
