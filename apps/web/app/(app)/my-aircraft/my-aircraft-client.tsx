'use client'

import Link from '@/components/shared/tenant-link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Plane, AlertTriangle, Wrench, Receipt,
  ChevronRight, MapPin, Clock, FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type WorkOrderStatus =
  | 'draft' | 'open' | 'awaiting_approval' | 'awaiting_parts'
  | 'in_progress' | 'waiting_on_customer' | 'ready_for_signoff'
  | 'closed' | 'invoiced' | 'paid' | 'archived'

const WO_STATUS_LABEL: Record<WorkOrderStatus, string> = {
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

const WO_STATUS_COLOR: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  open: 'bg-blue-50 text-blue-700',
  awaiting_approval: 'bg-amber-50 text-amber-700',
  awaiting_parts: 'bg-orange-50 text-orange-700',
  in_progress: 'bg-indigo-50 text-indigo-700',
  waiting_on_customer: 'bg-amber-50 text-amber-700',
  ready_for_signoff: 'bg-emerald-50 text-emerald-700',
}

const INV_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  pending: 'Pending',
  partially_paid: 'Partially Paid',
  overdue: 'Overdue',
}

const INV_STATUS_COLOR: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-blue-50 text-blue-700',
  pending: 'bg-amber-50 text-amber-700',
  partially_paid: 'bg-orange-50 text-orange-700',
  overdue: 'bg-red-50 text-red-700',
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date))
}

interface AircraftSummary {
  id: string
  tail_number: string
  make: string
  model: string
  year?: number
  base_airport?: string
  total_time_hours?: number
}

interface WorkOrderSummary {
  id: string
  work_order_number: string
  aircraft_id: string
  status: WorkOrderStatus
  created_at: string
  updated_at: string
}

interface InvoiceSummary {
  id: string
  invoice_number: string
  aircraft_id: string
  status: string
  total: number
  balance_due: number
  due_date: string
  created_at: string
}

interface Props {
  aircraft: AircraftSummary[]
  squawkCounts: Record<string, number>
  workOrdersByAircraft: Record<string, WorkOrderSummary[]>
  invoices: InvoiceSummary[]
  role?: 'owner' | 'admin' | 'mechanic' | 'pilot' | 'viewer' | 'auditor' | string
}

export function MyAircraftClient({ aircraft, squawkCounts, workOrdersByAircraft, invoices, role }: Props) {
  const canSelfAdd = role === 'owner' || role === 'admin' || role === 'mechanic'
  const invoicesByAircraft: Record<string, InvoiceSummary[]> = {}
  for (const inv of invoices) {
    if (!invoicesByAircraft[inv.aircraft_id]) invoicesByAircraft[inv.aircraft_id] = []
    invoicesByAircraft[inv.aircraft_id].push(inv)
  }

  const totalUnpaid = invoices.reduce((sum, inv) => sum + (Number(inv.balance_due) || 0), 0)
  const totalSquawks = Object.values(squawkCounts).reduce((sum, c) => sum + c, 0)
  const totalWOs = Object.values(workOrdersByAircraft).reduce((sum, wos) => sum + wos.length, 0)

  if (aircraft.length === 0) {
    return (
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          <Card>
            <CardContent className="py-16 text-center">
              <Plane className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <h3 className="font-semibold text-foreground mb-1">
                {canSelfAdd ? 'No aircraft yet' : 'No aircraft assigned'}
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-4">
                {canSelfAdd
                  ? 'Add your first aircraft to start tracking maintenance, documents, and squawks.'
                  : "You don't have any aircraft assigned to your account yet. Contact your maintenance shop to get set up."}
              </p>
              {canSelfAdd && (
                <Button asChild>
                  <Link href="/aircraft">Add Your First Aircraft</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Summary stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Aircraft</p>
                  <p className="text-2xl font-bold mt-1 text-foreground">{aircraft.length}</p>
                </div>
                <div className="p-2 rounded-lg bg-muted">
                  <Plane className="h-4 w-4 text-brand-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Open Squawks</p>
                  <p className="text-2xl font-bold mt-1 text-foreground">{totalSquawks}</p>
                </div>
                <div className="p-2 rounded-lg bg-muted">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Active Work Orders</p>
                  <p className="text-2xl font-bold mt-1 text-foreground">{totalWOs}</p>
                </div>
                <div className="p-2 rounded-lg bg-muted">
                  <Wrench className="h-4 w-4 text-sky-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Unpaid Balance</p>
                  <p className="text-2xl font-bold mt-1 text-foreground">{formatCurrency(totalUnpaid)}</p>
                </div>
                <div className="p-2 rounded-lg bg-muted">
                  <Receipt className="h-4 w-4 text-red-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Aircraft cards */}
        <div className="space-y-4">
          {aircraft.map(ac => {
            const squawkCount = squawkCounts[ac.id] ?? 0
            const wos = workOrdersByAircraft[ac.id] ?? []
            const acInvoices = invoicesByAircraft[ac.id] ?? []
            const acUnpaid = acInvoices.reduce((sum, inv) => sum + (Number(inv.balance_due) || 0), 0)

            return (
              <Card key={ac.id}>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                      <Plane className="h-5 w-5 text-brand-500" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-mono tracking-wide">
                        <Link href={`/aircraft/${ac.id}`} className="hover:underline">
                          {ac.tail_number}
                        </Link>
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {ac.make} {ac.model}
                        {ac.year && ` (${ac.year})`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {squawkCount > 0 && (
                      <Badge variant="warning" className="text-xs">
                        {squawkCount} squawk{squawkCount > 1 ? 's' : ''}
                      </Badge>
                    )}
                    {wos.length > 0 && (
                      <Badge variant="info" className="text-xs">
                        {wos.length} work order{wos.length > 1 ? 's' : ''}
                      </Badge>
                    )}
                    {acUnpaid > 0 && (
                      <Badge variant="danger" className="text-xs">
                        {formatCurrency(acUnpaid)} due
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Quick info badges */}
                  <div className="flex flex-wrap gap-2">
                    {ac.base_airport && (
                      <Badge variant="outline" className="text-xs flex items-center gap-1">
                        <MapPin className="h-2.5 w-2.5" />
                        {ac.base_airport}
                      </Badge>
                    )}
                    {ac.total_time_hours != null && (
                      <Badge variant="outline" className="text-xs flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {ac.total_time_hours.toLocaleString()} hrs TT
                      </Badge>
                    )}
                  </div>

                  {/* Work orders */}
                  {wos.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                        Active Work Orders
                      </p>
                      {wos.slice(0, 3).map(wo => (
                        <Link
                          key={wo.id}
                          href={`/work-orders/${wo.id}`}
                          className="flex items-center justify-between p-2 rounded-md hover:bg-accent transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium">{wo.work_order_number}</span>
                          </div>
                          <span className={cn(
                            'text-xs px-2 py-0.5 rounded-full font-medium',
                            WO_STATUS_COLOR[wo.status] ?? 'bg-slate-100 text-slate-600'
                          )}>
                            {WO_STATUS_LABEL[wo.status] ?? wo.status}
                          </span>
                        </Link>
                      ))}
                      {wos.length > 3 && (
                        <p className="text-xs text-muted-foreground pl-2">
                          + {wos.length - 3} more
                        </p>
                      )}
                    </div>
                  )}

                  {/* Unpaid invoices */}
                  {acInvoices.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                        Unpaid Invoices
                      </p>
                      {acInvoices.slice(0, 3).map(inv => (
                        <Link
                          key={inv.id}
                          href={`/invoices/${inv.id}`}
                          className="flex items-center justify-between p-2 rounded-md hover:bg-accent transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium">{inv.invoice_number}</span>
                            <span className="text-xs text-muted-foreground">
                              Due {formatDate(inv.due_date)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              'text-xs px-2 py-0.5 rounded-full font-medium',
                              INV_STATUS_COLOR[inv.status] ?? 'bg-slate-100 text-slate-600'
                            )}>
                              {INV_STATUS_LABEL[inv.status] ?? inv.status}
                            </span>
                            <span className="text-sm font-semibold">{formatCurrency(inv.balance_due)}</span>
                          </div>
                        </Link>
                      ))}
                      {acInvoices.length > 3 && (
                        <p className="text-xs text-muted-foreground pl-2">
                          + {acInvoices.length - 3} more
                        </p>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/aircraft/${ac.id}/squawks`}>
                        <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                        Squawks
                      </Link>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/aircraft/${ac.id}`}>
                        View Details
                        <ChevronRight className="ml-1 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </main>
  )
}
