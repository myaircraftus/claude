import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import type { UserProfile } from '@/types'
import { PartsLibraryView } from './parts-library-view'

export const metadata = { title: 'Parts Library' }

export default async function PartsLibraryPage() {
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

  // Fetch initial parts from library
  const { data: parts } = await (supabase as any)
    .from('parts_library')
    .select('*')
    .eq('organization_id', orgId)
    .order('usage_count', { ascending: false })
    .limit(200)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Parts', href: '/parts' },
          { label: 'Library' },
        ]}
      />
      <main className="flex-1 overflow-y-auto">
        <PartsLibraryView initialParts={parts ?? []} />
      </main>
    </div>
  )
}
