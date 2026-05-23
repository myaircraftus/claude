/**
 * /admin/tach-review — surface for the data-sync.tach-time-scraper agent's
 * recommendations. Lets the admin accept/reject each delta + each
 * proposed new aircraft. Approved deltas update
 * aircraft.total_time_hours; approved proposals insert a new aircraft
 * row.
 */
import { redirect } from 'next/navigation'
import { Topbar } from '@/components/shared/topbar'
import { createServerSupabase } from '@/lib/supabase/server'
import type { UserProfile } from '@/types'
import { TachReviewClient } from './tach-review-client'

export const metadata = { title: 'Tach-time review · admin' }
export const dynamic = 'force-dynamic'

export default async function TachReviewPage() {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profileRow } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  if (!profileRow) redirect('/login')
  const profile = profileRow as UserProfile
  if (!profile.is_platform_admin) redirect('/dashboard')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Tach-time review' },
        ]}
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          <TachReviewClient />
        </div>
      </main>
    </div>
  )
}
