import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { createServerSupabase } from '@/lib/supabase/server'
import { isStripeMock } from '@/lib/billing/stripe-client'
import { OrgBillingView } from './org-billing-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Billing' }

interface StripeSubscriptionRow {
  id: string
  status: string
  price_id: string | null
  product_id: string | null
  persona: string | null
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  trial_end: string | null
}

interface StripeInvoiceRow {
  id: string
  status: string
  amount_due: number
  amount_paid: number
  currency: string
  hosted_invoice_url: string | null
  invoice_pdf: string | null
  created_at: string
}

export default async function BillingPage() {
  const { profile, membership } = await requireAppServerSession()
  const supabase = createServerSupabase()

  const [subRes, invRes] = await Promise.all([
    supabase.from('stripe_subscriptions').select('*')
      .eq('organization_id', membership.organization_id)
      .order('created_at', { ascending: false }),
    supabase.from('stripe_invoices').select('*')
      .eq('organization_id', membership.organization_id)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Org', href: '/org' }, { label: 'Billing' }]} />
      <main className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
        <OrgBillingView
          canManage={['owner', 'admin'].includes(membership.role)}
          subscriptions={(subRes.data ?? []) as StripeSubscriptionRow[]}
          invoices={(invRes.data ?? []) as StripeInvoiceRow[]}
          isMock={isStripeMock()}
        />
      </main>
    </div>
  )
}
