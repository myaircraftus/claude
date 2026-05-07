import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { createServerSupabase } from '@/lib/supabase/server'
import { isQboMock } from '@/lib/integrations/qbo-client'
import { QboIntegrationView } from './qbo-integration-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'QuickBooks Integration' }

export default async function QboIntegrationPage() {
  const { profile, membership } = await requireAppServerSession()
  const supabase = createServerSupabase()

  const [stateRes, mappingsRes, paymentsRes] = await Promise.all([
    supabase.from('qbo_sync_state').select('*')
      .eq('organization_id', membership.organization_id).maybeSingle(),
    supabase.from('qbo_invoice_mappings').select('*')
      .eq('organization_id', membership.organization_id).order('pushed_at', { ascending: false }).limit(20),
    supabase.from('qbo_payment_mappings').select('*')
      .eq('organization_id', membership.organization_id).order('matched_at', { ascending: false }).limit(20),
  ])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[
        { label: 'Org', href: '/org' },
        { label: 'Integrations' },
        { label: 'QuickBooks' },
      ]} />
      <main className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
        <QboIntegrationView
          canManage={['owner', 'admin'].includes(membership.role)}
          state={stateRes.data ?? null}
          invoiceMappings={mappingsRes.data ?? []}
          paymentMappings={paymentsRes.data ?? []}
          isMock={isQboMock()}
        />
      </main>
    </div>
  )
}
