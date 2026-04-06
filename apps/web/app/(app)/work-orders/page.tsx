import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn, formatDate } from '@/lib/utils'
import { Plus, ClipboardList, Plane } from 'lucide-react'
import type { UserProfile, WorkOrderStatus } from '@/types'
import { NewWorkOrderButton } from './new-work-order-button'

export const metadata = { title: 'Work Orders' }

const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  awaiting_approval: 'Awaiting Approval',
  awaiting_parts: 'Awaiting Parts',
  in_progress: 'In Progress',
  waiting_on_customer: 'Waiting on Customer',
  ready_for_signoff: 'Ready for Sign-off',
  closed: 'Closed',
  invoiced: 'Invoiced',
  paid: 'Paid',
  archived: 'Archived',
}

const STATUS_COLOR: Record<WorkOrderStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  open: 'bg-blue-50 text-blue-700 border-blue-200',
  awaiting_approval: 'bg-amber-50 text-amber-700 border-amber-200',
  awaiting_parts: 'bg-orange-50 text-orange-700 border-orange-200',
  in_progress: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  waiting_on_customer: 'bg-amber-50 text-amber-700 border-amber-200',
  ready_for_signoff: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed: 'bg-green-50 text-green-700 border-green-200',
  invoiced: 'bg-violet-50 text-violet-700 border-violet-200',
  paid: 'bg-green-100 text-green-800 border-green-300',
  archived: 'bg-slate-50 text-slate-500 border-slate-200',
}

interface SearchParams {
  status?: string
  aircraft?: string
}

export default async function WorkOrdersPage({ searchParams }: { searchParams: SearchParams }) {
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

  // Fetch aircraft for filter
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number')
    .eq('organization_id', orgId)
    .eq('is_archived', false)
    .order('tail_number')

  // Build work orders query
  let query = supabase
    .from('work_orders')
    .select(`
      id, work_order_number, status, customer_complaint, labor_total, parts_total,
      outside_services_total, total, opened_at, created_at,
      aircraft:aircraft_id (id, tail_number, make, model)
    `, { count: 'exact' })
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  if (searchParams.status) query = (query as any).eq('status', searchParams.status)
  if (searchParams.aircraft) query = (query as any).eq('aircraft_id', searchParams.aircraft)

  const { data: workOrders, count } = await query

  // Stats
  const { data: allStatuses } = await supabase
    .from('work_orders')
    .select('status')
    .eq('organization_id', orgId)

  const stats = {
    open: allStatuses?.filter(r => r.status === 'open').length ?? 0,
    in_progress: allStatuses?.filter(r => r.status === 'in_progress').length ?? 0,
    ready_for_signoff: allStatuses?.filter(r => r.status === 'ready_for_signoff').length ?? 0,
    total: allStatuses?.length ?? 0,
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[{ label: 'Work Orders' }]}
        actions={<NewWorkOrderButton aircraft={aircraft ?? []} />}
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">

          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-foreground">Work Orders</h1>
            <p className="text-muted-foreground text-sm">Track maintenance work orders and job cards</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Open', value: stats.open, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'In Progress', value: stats.in_progress, color: 'text-indigo-600', bg: 'bg-indigo-50' },
              { label: 'Ready for Sign-off', value: stats.ready_for_signoff, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Total', value: stats.total, color: 'text-foreground', bg: 'bg-muted' },
            ].map(stat => (
              <div key={stat.label} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
                <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', stat.bg)}>
                  <ClipboardList className={cn('h-4 w-4', stat.color)} />
                </div>
                <div>
                  <p className="text-xl font-bold text-foreground leading-none">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <form method="GET" className="flex flex-wrap gap-2">
            <select
              name="aircraft"
              defaultValue={searchParams.aircraft ?? ''}
              className="h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">All aircraft</option>
              {(aircraft ?? []).map(ac => (
                <option key={ac.id} value={ac.id}>{ac.tail_number}</option>
              ))}
            </select>

            <select
              name="status"
              defaultValue={searchParams.status ?? ''}
              className="h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">All statuses</option>
              {(Object.entries(STATUS_LABEL) as [WorkOrderStatus, string][]).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>

            <button
              type="submit"
              className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Filter
            </button>

            {(searchParams.status || searchParams.aircraft) && (
              <a
                href="/work-orders"
                className="h-9 px-3 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground flex items-center transition-colors"
              >
                Clear
              </a>
            )}
          </form>

          {/* Table */}
          {(!workOrders || workOrders.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-20 rounded-xl border border-dashed border-border text-center">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
                <ClipboardList className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">No work orders found</p>
              <p className="text-xs text-muted-foreground mt-1">Create a new work order to get started.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">WO #</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Aircraft</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Complaint</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Total</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Opened</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-card">
                    {(workOrders as any[]).map(wo => (
                      <tr key={wo.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <Link
                            href={`/work-orders/${wo.id}`}
                            className="font-mono text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline"
                          >
                            {wo.work_order_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          {wo.aircraft ? (
                            <span className="flex items-center gap-1 text-xs font-mono">
                              <Plane className="h-3 w-3 text-muted-foreground" />
                              {wo.aircraft.tail_number}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border',
                            STATUS_COLOR[wo.status as WorkOrderStatus] ?? STATUS_COLOR.draft
                          )}>
                            {STATUS_LABEL[wo.status as WorkOrderStatus] ?? wo.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <p className="text-xs text-foreground truncate">
                            {wo.customer_complaint ?? <span className="text-muted-foreground italic">No complaint recorded</span>}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-semibold tabular-nums">
                          ${(wo.total ?? 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(wo.opened_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 border-t border-border bg-muted/20">
                <span className="text-xs text-muted-foreground">
                  {(count ?? 0).toLocaleString()} work order{count !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
