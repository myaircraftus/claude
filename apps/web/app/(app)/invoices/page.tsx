import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import { InvoicesList } from './invoices-list'
import type { UserProfile } from '@/types'

export const metadata = { title: 'Invoices' }

export default async function InvoicesPage() {
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

  // Fetch invoices
  const { data: invoices } = await supabase
    .from('invoices')
    .select(`
      id, invoice_number, status, issue_date, due_date,
      subtotal, total, amount_paid, balance_due, created_at,
      customer:customer_id (id, name, email),
      aircraft:aircraft_id (id, tail_number)
    `)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(100)

  // Stats
  const allInvoices = invoices ?? []
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const stats = {
    total_invoices: allInvoices.length,
    total_outstanding: allInvoices
      .filter(inv => !['paid', 'void', 'writeoff'].includes(inv.status))
      .reduce((sum, inv) => sum + ((inv as any).balance_due ?? 0), 0),
    overdue_count: allInvoices.filter(inv =>
      inv.status !== 'paid' && inv.status !== 'void' && inv.due_date && new Date(inv.due_date) < now
    ).length,
    paid_this_month: allInvoices
      .filter(inv => inv.status === 'paid' && inv.created_at >= startOfMonth)
      .reduce((sum, inv) => sum + (inv.total ?? 0), 0),
  }

  // Fetch work orders for new invoice dialog
  const { data: workOrders } = await supabase
    .from('work_orders')
    .select('id, work_order_number, status, total_amount, aircraft:aircraft_id (tail_number)')
    .eq('organization_id', orgId)
    .in('status', ['closed', 'ready_for_signoff', 'in_progress', 'open'])
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[{ label: 'Invoices' }]}
      />
      <InvoicesList
        initialInvoices={allInvoices as any[]}
        stats={stats}
        workOrders={(workOrders ?? []) as any[]}
      />
    </div>
  )
}
