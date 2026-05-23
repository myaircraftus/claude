/**
 * /communications — unified email + SMS inbox.
 *
 * Phase 1 MVP: server-rendered shell + a client component that fetches
 * /api/inbox and /api/inbox/thread/[key]. Filters: All / Unread /
 * Receipts / Estimates / Invoices / Reminders. Compose at the bottom of
 * the open thread.
 *
 * Phase 2 will hang inline "Approve" / "File as expense" / "Link to WO"
 * actions off AI-classified messages.
 */
import { redirect } from 'next/navigation'
import { Topbar } from '@/components/shared/topbar'
import { createServerSupabase } from '@/lib/supabase/server'
import type { UserProfile } from '@/types'
import { InboxClient } from './inbox-client'

export const metadata = { title: 'Inbox · myaircraft' }
export const dynamic = 'force-dynamic'

export default async function CommunicationsPage() {
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
  const profile = profileRow as UserProfile & { inbox_email?: string | null }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Inbox' }]} />
      <main className="flex-1 overflow-hidden">
        <InboxClient
          inboxEmail={profile.inbox_email ?? null}
          userName={profile.full_name ?? profile.email ?? 'You'}
        />
      </main>
    </div>
  )
}
