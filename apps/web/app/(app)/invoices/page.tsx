import { InvoicesPage } from '@/components/redesign/InvoicesPage'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { redirect } from 'next/navigation'
import { requirePersona } from '@/lib/persona/route-guard'
import { OpsTabStrip } from '@/components/ops/ops-tab-strip'

export const metadata = { title: 'Invoices' }

export default async function InvoicesRoute() {
  await requireAppServerSession()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <OpsTabStrip active="invoices" />
      <div className="flex-1 overflow-hidden">
        <InvoicesPage />
      </div>
    </div>
  )
}
