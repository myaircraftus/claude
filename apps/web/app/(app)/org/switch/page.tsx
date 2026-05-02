import { redirect } from 'next/navigation'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { listUserMemberships } from '@/lib/org/context'
import { OrgSwitchView } from './org-switch-view'

export const metadata = { title: 'Switch Organization' }

/**
 * Org switcher page (Spec 0.1) — lists every accepted membership and lets
 * the user pick which org to view. Selection writes the active_organization_id
 * cookie via /api/me/active-org and routes to /dashboard.
 */
export default async function OrgSwitchPage() {
  const session = await requireAppServerSession()
  const memberships = await listUserMemberships()

  // Edge case: only one membership → no need for a switcher screen,
  // just bounce them home so the URL doesn't dead-end.
  if (memberships.length <= 1) {
    redirect('/dashboard')
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={session.profile} breadcrumbs={[{ label: 'Switch Organization' }]} />
      <main className="flex-1 overflow-y-auto">
        <OrgSwitchView
          activeOrgId={session.membership.organization_id}
          memberships={memberships}
        />
      </main>
    </div>
  )
}
