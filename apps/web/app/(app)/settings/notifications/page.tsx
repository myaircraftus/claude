import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { NotificationPreferencesView } from '@/components/notifications/notification-preferences'

export const metadata = { title: 'Notification preferences' }

/**
 * Notification preferences page (Spec 0.4).
 *
 * Per-category × per-channel toggle grid. The matrix lives in
 * components/notifications/notification-preferences.tsx; this page is
 * just the route shell.
 */
export default async function NotificationPreferencesPage() {
  const { profile } = await requireAppServerSession()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Settings', href: '/settings' },
          { label: 'Notifications' },
        ]}
      />
      <main className="flex-1 overflow-y-auto p-6">
        <NotificationPreferencesView />
      </main>
    </div>
  )
}
