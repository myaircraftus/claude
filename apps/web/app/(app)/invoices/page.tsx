import { InvoicesPage } from '@/components/redesign/InvoicesPage'
import { requireAppServerSession } from '@/lib/auth/server-app'

export const metadata = { title: 'Invoices' }

export default async function InvoicesRoute() {
  await requireAppServerSession()

  return <InvoicesPage />
}
