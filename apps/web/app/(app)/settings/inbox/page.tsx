/**
 * /settings/inbox — manage the user's myaircraft.us inbox identity
 *
 *   1. Show their @myaircraft.us address + Twilio number
 *   2. "Allocate / re-allocate" button (POST /api/me/inbox)
 *   3. External-system credentials table:
 *      - Flight Schedule Pro / Flight Circle / etc.
 *      - "Add credentials" form (password is encrypted server-side via
 *        envelope-crypt before storage; never echoed back to the UI)
 *      - "Delete" per row
 *
 * Plain client component — small, no need for server pre-render
 * beyond auth.
 */
import { redirect } from 'next/navigation'
import { Topbar } from '@/components/shared/topbar'
import { createServerSupabase } from '@/lib/supabase/server'
import type { UserProfile } from '@/types'
import { InboxSettingsClient } from './inbox-settings-client'

export const metadata = { title: 'Inbox settings · myaircraft' }
export const dynamic = 'force-dynamic'

export default async function InboxSettingsPage() {
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Inbox' }]} />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <InboxSettingsClient />
        </div>
      </main>
    </div>
  )
}
