'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn, formatDate } from '@/lib/utils'
import {
  Plus, FileText, DollarSign, AlertTriangle, CheckCircle2,
  Send, Trash2, Loader2, X,
} from 'lucide-react'

type InvoiceStatus = 'draft' | 'sent' | 'pending' | 'partially_paid' | 'paid' | 'overdue' | 'void' | 'writeoff'

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  pending: 'Pending',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
  writeoff: 'Write-off',
}

const STATUS_COLOR: Record<InvoiceStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  sent: 'bg-blue-50 text-blue-700 border-blue-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  partially_paid: 'bg-orange-50 text-orange-700 border-orange-200',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
  void: 'bg-slate-50 text-slate-500 border-slate-200',
  writeoff: 'bg-slate-50 text-slate-500 border-slate-200',
}

const STATUS_TABS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'paid', label: 'Paid' },
  { key: 'void', label: 'Void' },
]

interface Props {
  initialInvoices: any[]
  stats: {
    total_invoices: number
    total_outstanding: number
    overdue_count: number
    paid_this_month: number
  }
  workOrders: any[]
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

export function InvoicesList({ initialInvoices, stats, workOrders }: Props) {
  const router = useRouter()
  const [invoices, setInvoices] = useState(initialInvoices)
  const [filter, setFilter] = useState('all')
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const now = new Date()
  const filtered = invoices.filter(inv => {
    if (filter === 'all') return true
    if (filter === 'overdue') {
      return inv.status !== 'paid' && inv.status !== 'void' && inv.due_date && new Date(inv.due_date) < now
    }
    return inv.status === filter
  })

  async function handleCreateInvoice(workOrderId?: string) {
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workOrderId ? { work_order_id: workOrderId } : {}),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const msg = body?.error ?? `Failed to create invoice (${res.status})`
        setCreateError(msg)
        setCreating(false)
        return
      }
      const data = await res.json()
      setShowNewDialog(false)
      router.push(`/invoices/${data.id}`)
    } catch (err: any) {
      setCreateError(err.message ?? 'Network error creating invoice')
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteInvoice(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this draft invoice?')) return
    const res = await fetch(`/api/invoices/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setInvoices(prev => prev.filter(inv => inv.id !== id))
    }
  }

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
            <p className="text-muted-foreground text-sm">Create and manage invoices for maintenance work</p>
          </div>
          <Button onClick={() => { setCreateError(null); setShowNewDialog(true) }}>
            <Plus className="h-4 w-4 mr-1" />
            New Invoice
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Invoices', value: stats.total_invoices, icon: FileText, color: 'text-foreground', bg: 'bg-muted' },
            { label: 'Outstanding', value: formatCurrency(stats.total_outstanding), icon: DollarSign, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Overdue', value: stats.overdue_count, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
            { label: 'Paid This Month', value: formatCurrency(stats.paid_this_month), icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          ].map(stat => (
            <div key={stat.label} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
              <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', stat.bg)}>
                <stat.icon className={cn('h-4 w-4', stat.color)} />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground leading-none">
                  {typeof stat.value === 'number' ? stat.value : stat.value}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 border-b border-border">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={cn(
                'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                filter === tab.key
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-xl border border-dashed border-border text-center">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No invoices found</p>
            <p className="text-xs text-muted-foreground mt-1">Create a new invoice to get started.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Invoice #</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Aircraft</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Balance</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Due Date</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {filtered.map((inv: any) => {
                    const isOverdue = inv.status !== 'paid' && inv.status !== 'void' && inv.due_date && new Date(inv.due_date) < now
                    const displayStatus = isOverdue ? 'overdue' : inv.status

                    return (
                      <tr
                        key={inv.id}
                        onClick={() => router.push(`/invoices/${inv.id}`)}
                        className="hover:bg-muted/30 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-semibold text-brand-600">
                            {inv.invoice_number}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-foreground">
                          {inv.customer?.name ?? <span className="text-muted-foreground">--</span>}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                          {inv.aircraft?.tail_number ?? '--'}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-semibold tabular-nums">
                          {formatCurrency(inv.total ?? 0)}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-semibold tabular-nums">
                          {formatCurrency(inv.balance_due ?? 0)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border',
                            STATUS_COLOR[displayStatus as InvoiceStatus] ?? STATUS_COLOR.draft
                          )}>
                            {STATUS_LABEL[displayStatus as InvoiceStatus] ?? displayStatus}
                          </span>
                        </td>
                        <td className={cn(
                          'px-4 py-3 text-xs whitespace-nowrap',
                          isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'
                        )}>
                          {inv.due_date ? formatDate(inv.due_date) : '--'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {inv.status === 'draft' && (
                              <button
                                onClick={(e) => handleDeleteInvoice(inv.id, e)}
                                className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 border-t border-border bg-muted/20">
              <span className="text-xs text-muted-foreground">
                {filtered.length} invoice{filtered.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}

        {/* New Invoice Dialog */}
        {showNewDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setCreateError(null); setShowNewDialog(false) }}>
            <div className="bg-background border border-border rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-foreground">New Invoice</h3>
                <button onClick={() => { setCreateError(null); setShowNewDialog(false) }} className="p-1 rounded text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {createError && (
                <div className="mb-3 flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <div className="space-y-3">
                {/* Blank invoice */}
                <button
                  onClick={() => handleCreateInvoice()}
                  disabled={creating}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Blank Invoice</p>
                    <p className="text-xs text-muted-foreground">Start from scratch</p>
                  </div>
                </button>

                {/* From work order */}
                {workOrders.length > 0 && (
                  <>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider pt-2">
                      From Work Order
                    </p>
                    <div className="max-h-60 overflow-y-auto space-y-1">
                      {workOrders.map((wo: any) => (
                        <button
                          key={wo.id}
                          onClick={() => handleCreateInvoice(wo.id)}
                          disabled={creating}
                          className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left"
                        >
                          <div>
                            <p className="text-sm font-medium font-mono text-foreground">{wo.work_order_number}</p>
                            <p className="text-xs text-muted-foreground">
                              {wo.aircraft?.tail_number ?? 'No aircraft'} -- {wo.status}
                            </p>
                          </div>
                          <span className="text-xs font-semibold tabular-nums text-foreground">
                            {formatCurrency(wo.total_amount ?? 0)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {creating && (
                <div className="flex items-center justify-center gap-2 mt-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating invoice...
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
