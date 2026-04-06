import { redirect, notFound } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import { InvoiceDetail } from './invoice-detail'
import type { UserProfile } from '@/types'

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileRes, membershipRes] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('organization_memberships')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single(),
  ])

  const profile = profileRes.data as UserProfile
  if (!profile || !membershipRes.data) redirect('/login')

  const orgId = membershipRes.data.organization_id

  const { data: invoice } = await supabase
    .from('invoices')
    .select(`
      *,
      line_items:invoice_line_items (*),
      customer:customer_id (id, name, email, phone, address_line1, address_line2, city, state, zip),
      aircraft:aircraft_id (id, tail_number, make, model),
      work_order:work_order_id (id, work_order_number, status),
      payments:payments (*)
    `)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (!invoice) notFound()

  // Sort line items
  if (invoice.line_items) {
    (invoice.line_items as any[]).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Invoices', href: '/invoices' },
          { label: invoice.invoice_number ?? 'Invoice' },
        ]}
      />
      <InvoiceDetail initialInvoice={invoice as any} />
    </div>
  )
}
