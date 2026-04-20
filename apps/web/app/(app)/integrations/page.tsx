import { IntegrationsPage } from '@/components/redesign/IntegrationsPage'
import { requireAppServerSession } from '@/lib/auth/server-app'

export const metadata = { title: 'Integrations' }

export default async function IntegrationsRoute() {
  await requireAppServerSession()

  return <IntegrationsPage />
}
