'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import {
  Users, ClipboardList, DollarSign, Clock, AlertTriangle, CheckCircle2,
  Wrench, Plane, ArrowRight, TrendingUp
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Member {
  id: string
  role: string
  permissions: Record<string, boolean>
  user_profiles: { id: string; full_name: string; email: string; avatar_url: string | null; job_title: string | null } | null
}
interface WorkOrder {
  id: string
  status: string
  assigned_to: string | null
  aircraft_id: string | null
  customer_id: string | null
  created_at: string
  updated_at: string
}
interface Aircraft { id: string; tail_number: string; make: string; model: string }
interface Invoice { id: string; status: string; total: number; balance_due: number; created_at: string }
interface MaintRequest { id: string; status: string; aircraft_id: string; target_mechanic_user_id: string | null; created_at: string }

interface Props {
  members: Member[]
  workOrders: WorkOrder[]
  aircraft: Aircraft[]
  invoices: Invoice[]
  pendingRequests: MaintRequest[]
  currentUserId: string
}

const WO_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  open: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  awaiting_parts: 'bg-purple-100 text-purple-700',
  awaiting_approval: 'bg-indigo-100 text-indigo-700',
  ready_for_signoff: 'bg-cyan-100 text-cyan-700',
  closed: 'bg-emerald-100 text-emerald-700',
  invoiced: 'bg-green-100 text-green-700',
  paid: 'bg-emerald-100 text-emerald-700',
}

export function OpsDashboardClient({
  members, workOrders, aircraft, invoices, pendingRequests, currentUserId,
}: Props) {

  const mechanics = useMemo(
    () => members.filter(m => ['mechanic', 'admin', 'owner'].includes(m.role)),
    [members]
  )

  const woByStatus = useMemo(() => {
    const map: Record<string, number> = {}
    for (const wo of workOrders) {
      map[wo.status] = (map[wo.status] ?? 0) + 1
    }
    return map
  }, [workOrders])

  const woByAssignee = useMemo(() => {
    const map: Record<string, WorkOrder[]> = {}
    for (const wo of workOrders) {
      const key = wo.assigned_to ?? 'unassigned'
      if (!map[key]) map[key] = []
      map[key].push(wo)
    }
    return map
  }, [workOrders])

  const activeWOs = workOrders.filter(wo => !['closed', 'invoiced', 'paid', 'archived'].includes(wo.status))
  const totalOutstanding = invoices
    .filter(i => !['paid', 'void', 'writeoff'].includes(i.status))
    .reduce((sum, i) => sum + (i.balance_due ?? 0), 0)
  const overdueInvoices = invoices.filter(i => i.status === 'overdue').length

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Operations Dashboard</h1>
        <p className="text-sm text-muted-foreground">Team workload, work orders, and financial overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Team Members" value={mechanics.length} color="text-blue-600" />
        <StatCard icon={ClipboardList} label="Active WOs" value={activeWOs.length} color="text-amber-600" />
        <StatCard icon={DollarSign} label="Outstanding" value={`$${totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 0 })}`} color="text-emerald-600" />
        <StatCard icon={AlertTriangle} label="Pending Requests" value={pendingRequests.length} color="text-red-600" />
      </div>

      {/* Work Order Pipeline */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">Work Order Pipeline</h2>
          <Link href="/work-orders" className="text-xs text-brand-600 hover:underline flex items-center gap-1">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {['draft', 'open', 'in_progress', 'awaiting_parts', 'awaiting_approval', 'ready_for_signoff', 'closed', 'invoiced'].map(status => (
            <div key={status} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 min-w-[120px]">
              <span className={cn('inline-block w-2 h-2 rounded-full', (WO_STATUS_COLORS[status] ?? '').split(' ')[0])} />
              <div>
                <p className="text-lg font-bold text-foreground leading-none">{woByStatus[status] ?? 0}</p>
                <p className="text-[10px] text-muted-foreground capitalize mt-0.5">{status.replace(/_/g, ' ')}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Employee Workload */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Employee Workload</h2>
        <div className="space-y-3">
          {mechanics.map(m => {
            const memberName = m.user_profiles?.full_name ?? m.user_profiles?.email ?? 'Unknown'
            const memberWOs = woByAssignee[m.user_profiles?.id ?? ''] ?? []
            const activeCount = memberWOs.filter(wo => !['closed', 'invoiced', 'paid', 'archived'].includes(wo.status)).length
            const completedCount = memberWOs.filter(wo => ['closed', 'invoiced', 'paid'].includes(wo.status)).length
            const isMe = m.user_profiles?.id === currentUserId

            return (
              <div key={m.id} className={cn(
                'flex items-center gap-4 p-3 rounded-lg border',
                isMe ? 'border-brand-200 bg-brand-50/50' : 'border-border'
              )}>
                <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-sm font-bold text-brand-700 flex-shrink-0">
                  {(memberName[0] ?? '?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {memberName} {isMe && <span className="text-xs text-muted-foreground">(you)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">{m.role} {m.user_profiles?.job_title ? `\u00B7 ${m.user_profiles.job_title}` : ''}</p>
                </div>
                <div className="flex items-center gap-3 text-xs flex-shrink-0">
                  <div className="text-center">
                    <p className="font-bold text-amber-600">{activeCount}</p>
                    <p className="text-muted-foreground">Active</p>
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-emerald-600">{completedCount}</p>
                    <p className="text-muted-foreground">Done</p>
                  </div>
                </div>
              </div>
            )
          })}
          {mechanics.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No team members found. Invite mechanics from Settings.</p>
          )}
          {(woByAssignee['unassigned']?.length ?? 0) > 0 && (
            <div className="flex items-center gap-4 p-3 rounded-lg border border-amber-200 bg-amber-50/50">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800">
                  {woByAssignee['unassigned']?.length ?? 0} unassigned work orders
                </p>
                <p className="text-xs text-amber-600">These need to be assigned to a mechanic.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pending Maintenance Requests */}
      {pendingRequests.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-red-800">Pending Maintenance Requests</h2>
            <Link href="/maintenance/requests" className="text-xs text-red-600 hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {pendingRequests.slice(0, 5).map(req => {
              const ac = aircraft.find(a => a.id === req.aircraft_id)
              return (
                <div key={req.id} className="flex items-center gap-3 p-2 rounded-md bg-white/80 border border-red-100">
                  <Plane className="h-4 w-4 text-red-600 flex-shrink-0" />
                  <span className="text-sm font-mono">{ac?.tail_number ?? 'N/A'}</span>
                  <span className="text-xs text-red-700 flex-1">
                    Maintenance requested — waiting for acceptance
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(req.created_at).toLocaleDateString()}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Financial Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-foreground">Revenue</h3>
          </div>
          <p className="text-2xl font-bold text-foreground">
            ${invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total ?? 0), 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Paid invoices</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-foreground">Outstanding</h3>
          </div>
          <p className="text-2xl font-bold text-foreground">${totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 0 })}</p>
          <p className="text-xs text-muted-foreground mt-1">Unpaid balance</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <h3 className="text-sm font-semibold text-foreground">Overdue</h3>
          </div>
          <p className="text-2xl font-bold text-red-600">{overdueInvoices}</p>
          <p className="text-xs text-muted-foreground mt-1">Invoices past due date</p>
        </div>
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-3">
        <Link href="/work-orders" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-sm font-medium hover:bg-accent transition-colors">
          <ClipboardList className="h-4 w-4" /> Work Orders
        </Link>
        <Link href="/invoices" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-sm font-medium hover:bg-accent transition-colors">
          <DollarSign className="h-4 w-4" /> Invoices
        </Link>
        <Link href="/customers" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-sm font-medium hover:bg-accent transition-colors">
          <Users className="h-4 w-4" /> Customers
        </Link>
        <Link href="/settings" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-sm font-medium hover:bg-accent transition-colors">
          <Wrench className="h-4 w-4" /> Settings
        </Link>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn('h-4 w-4', color)} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
    </div>
  )
}
