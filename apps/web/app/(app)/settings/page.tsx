import { SettingsPage } from '@/components/redesign/SettingsPage'
import { requireAppServerSession } from '@/lib/auth/server-app'

export const metadata = { title: 'Settings' }

export default async function SettingsRoute() {
  await requireAppServerSession()

  return <SettingsPage />
}
