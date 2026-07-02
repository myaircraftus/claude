'use client'

import { useState } from 'react'
import { useTenantRouter } from '@/components/shared/tenant-link'
import { Button } from '@/components/ui/button'
import { cn, formatDate } from '@/lib/utils'
import { RecordList, type RecordColumn } from '@/components/shared/record-list'
import { StatusBadge, type StatusMap } from '@/components/shared/status-badge'
import {
  Plus, FileText, DollarSign, AlertTriangle, CheckCircle2,
  Trash2, Loader2, X,
} from 'lucide-react'

/** Single source of truth for invoice status labels + colors on the list. */
const INVOICE_STATUS: StatusMap = {
  draft: { label: 'Draft', pill: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  sent: { label: 'Sent', pill: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
  pending: { label: 'Pending', pill: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  partially_paid: { label: 'Partially paid', pill: 'bg-orange-50 text-orange-700', dot: 'bg-orange-500' },
  paid: { label: 'Paid', pill: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  overdue: { label: 'Overdue', pill: 'bg-red-50 text-red-700', dot: 'bg-red-500' },
  void: { label: 'Void', pill: 'bg-slate-50 text-slate-500', dot: 'bg-slate-300' },
  writeoff: { label: 'Write-off', pill: 'bg-slate-50 text-slate-500', dot: 'bg-slate-300' },
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
  /** Owner persona — read-only: the New Invoice + delete controls are hidden. */
  isOwner?: boolean
  /** Server-side pagination — current page (1-based) and total page count. */
  page?: number
  totalPages?: number
  /** True when the server query failed — show an error state, not "empty". */
  loadError?: boolean
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

export function InvoicesList({ initialInvoices, stats, workOrders, isOwner = false, page = 1, totalPages = 1, loadError = false }: Props) {
  const router = useTenantRouter()
  const [invoices, setInvoices] = useState(initialInvoices)
  const [filter, setFilter] = useState('all')
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const now = new Date()
  const isOverdue = (inv: any) =>
    inv.status !== 'paid' && inv.status !== 'void' && inv.due_date && new Date(inv.due_date) < now
  const filtered = invoices.filter(inv => {
    if (filter === 'all') return true
    if (filter === 'overdue') return isOverdue(inv)
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

  const columns: RecordColumn<any>[] = [
    {
      key: 'invoice_number',
      header: 'Invoice #',
      primary: true,
      cell: (inv) => <span className="font-mono text-xs font-semibold text-brand-600">{inv.invoice_number}</span>,
    },
    {
      key: 'customer',
      header: 'Customer',
      cell: (inv) => inv.customer?.name ? <span className="text-[12px] text-foreground">{inv.customer.name}</span> : <span className="text-[12px] text-muted-foreground">—</span>,
    },
    {
      key: 'aircraft',
      header: 'Aircraft',
      cell: (inv) => <span className="font-mono text-[12px] text-muted-foreground">{inv.aircraft?.tail_number ?? '—'}</span>,
    },
    {
      key: 'total',
      header: 'Amount',
      align: 'right',
      cell: (inv) => <span className="text-[12px] font-semibold tabular-nums text-foreground">{formatCurrency(inv.total ?? 0)}</span>,
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      // A paid/void invoice has nothing due — never show a stale balance_due
      // (rows marked paid without a payment record keep their old balance).
      cell: (inv) => (
        <span className="text-[12px] font-semibold tabular-nums text-foreground">
          {formatCurrency(['paid', 'void', 'writeoff'].includes(inv.status) ? 0 : inv.balance_due ?? 0)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      badge: true,
      cell: (inv) => <StatusBadge map={INVOICE_STATUS} status={isOverdue(inv) ? 'overdue' : inv.status} />,
    },
    {
      key: 'due_date',
      header: 'Due',
      cell: (inv) => (
        <span className={cn('text-[12px] whitespace-nowrap', isOverdue(inv) ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
          {inv.due_date ? formatDate(inv.due_date) : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      hideOnMobile: true,
      cell: (inv) =>
        !isOwner && inv.status === 'draft' ? (
          <button
            onClick={(e) => handleDeleteInvoice(inv.id, e)}
            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null,
    },
  ]

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
            <p className="text-muted-foreground text-sm">Create and manage invoices for maintenance work</p>
          </div>
          {!isOwner && (
            <Button onClick={() => { setCreateError(null); setShowNewDialog(true) }}>
              <Plus className="h-4 w-4 mr-1" />
              New Invoice
            </Button>
          )}
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
              <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', stat.bg)}>
                <stat.icon className={cn('h-4 w-4', stat.color)} />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold text-foreground leading-none truncate">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 border-b border-border overflow-x-auto [scrollbar-width:none]">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={cn(
                'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                filter === tab.key
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* List */}
        <RecordList
          items={filtered}
          columns={columns}
          getRowKey={(inv) => inv.id}
          getRowHref={(inv) => `/invoices/${inv.id}`}
          error={loadError}
          emptyIcon={<FileText className="h-7 w-7" />}
          emptyTitle={filter === 'all' ? 'No invoices found' : `No ${filter} invoices on this page`}
          emptyDescription={filter === 'all' ? 'Create a new invoice to get started.' : 'Try a different filter or page.'}
        />
        {filtered.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {filtered.length} invoice{filtered.length !== 1 ? 's' : ''} on this page
          </p>
        )}

        {/* Pagination — server-side, ?page= param. The status tabs above
            filter only the current page; use Previous/Next for the rest. */}
        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => router.push(`/invoices?page=${page - 1}`)}
              disabled={page <= 1}
              className="h-8 px-3 rounded-md border border-border text-sm hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => router.push(`/invoices?page=${page + 1}`)}
              disabled={page >= totalPages}
              className="h-8 px-3 rounded-md border border-border text-sm hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}

        {/* New Invoice Dialog */}
        {showNewDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setCreateError(null); setShowNewDialog(false) }}>
            <div className="bg-background border border-border rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
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
                              {wo.aircraft?.tail_number ?? 'No aircraft'} — {wo.status}
                            </p>
                          </div>
                          <span className="text-xs font-semibold tabular-nums text-foreground">
                            {formatCurrency(wo.total ?? 0)}
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
