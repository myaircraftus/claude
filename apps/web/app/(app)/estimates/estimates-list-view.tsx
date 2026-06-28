'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { FileText, Plus, Search, Plane } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { RecordList, type RecordColumn } from '@/components/shared/record-list'
import { StatusBadge, type StatusMap } from '@/components/shared/status-badge'

/** Single source of truth for estimate status labels + colors on the list. */
const ESTIMATE_STATUS: StatusMap = {
  draft: { label: 'Draft', pill: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  sent: { label: 'Sent', pill: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
  ready_to_send: { label: 'Ready to send', pill: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
  awaiting_approval: { label: 'Awaiting approval', pill: 'bg-purple-50 text-purple-700', dot: 'bg-purple-500' },
  awaiting_deposit: { label: 'Awaiting deposit', pill: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  approved: { label: 'Approved', pill: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  deposit_paid: { label: 'Deposit paid', pill: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  rejected: { label: 'Rejected', pill: 'bg-red-50 text-red-700', dot: 'bg-red-500' },
  declined: { label: 'Declined', pill: 'bg-red-50 text-red-700', dot: 'bg-red-500' },
  expired: { label: 'Expired', pill: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  converted: { label: 'Converted', pill: 'bg-violet-50 text-violet-700', dot: 'bg-violet-500' },
  converted_to_work_order: { label: 'Converted to WO', pill: 'bg-violet-50 text-violet-700', dot: 'bg-violet-500' },
}

interface EstimateItem {
  id: string
  estimate_number: string
  status: string
  total: number | null
  service_type: string | null
  valid_until: string | null
  created_at: string
  aircraft: { id: string; tail_number: string; make: string | null; model: string | null } | null
  customer: { id: string; name: string | null; company: string | null } | null
}

export function EstimatesListView({
  estimates,
  isOwner = false,
  page = 1,
  totalPages = 1,
  loadError = false,
}: {
  estimates: EstimateItem[]
  /** Owner persona — read-only: the create-estimate control is hidden.
      Approve/reject lives on the /estimates/[id] detail page and is
      intentionally NOT gated here (owners approve/reject estimates). */
  isOwner?: boolean
  /** Server-side pagination — current page (1-based) and total page count. */
  page?: number
  totalPages?: number
  /** True when the server query failed — show an error state, not "empty". */
  loadError?: boolean
}) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return estimates.filter((e) => {
      if (!needle) return true
      return (
        e.estimate_number.toLowerCase().includes(needle) ||
        (e.aircraft?.tail_number ?? '').toLowerCase().includes(needle) ||
        (e.customer?.name ?? '').toLowerCase().includes(needle)
      )
    })
  }, [estimates, q])

  const columns: RecordColumn<EstimateItem>[] = [
    {
      key: 'estimate_number',
      header: 'Estimate #',
      primary: true,
      cell: (e) => <span className="text-[13px] font-semibold tabular-nums text-foreground">{e.estimate_number}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      badge: true,
      cell: (e) => <StatusBadge map={ESTIMATE_STATUS} status={e.status} />,
    },
    {
      key: 'aircraft',
      header: 'Aircraft',
      cell: (e) =>
        e.aircraft ? (
          <span className="inline-flex items-center gap-1 text-[13px] text-foreground">
            <Plane className="h-3 w-3 text-muted-foreground" />
            {e.aircraft.tail_number}
          </span>
        ) : (
          <span className="text-[12px] text-muted-foreground">—</span>
        ),
    },
    {
      key: 'customer',
      header: 'Customer',
      cell: (e) => <span className="text-[13px] text-foreground">{e.customer?.name ?? '—'}</span>,
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      cell: (e) => (
        <span className="text-[13px] font-medium tabular-nums text-foreground">${Number(e.total ?? 0).toFixed(2)}</span>
      ),
    },
    {
      key: 'valid_until',
      header: 'Valid until',
      cell: (e) => <span className="text-[12px] text-muted-foreground">{e.valid_until ? formatDate(e.valid_until) : '—'}</span>,
    },
    {
      key: 'created',
      header: 'Created',
      hideOnMobile: true,
      cell: (e) => <span className="text-[12px] text-muted-foreground">{formatDate(e.created_at)}</span>,
    },
  ]

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <div className="px-4 sm:px-6 py-4 border-b border-border bg-background flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-lg px-3 py-2 flex-1 max-w-md">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by estimate #, tail, or customer..."
            aria-label="Search estimates"
            className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground/50"
          />
        </div>
        {/* Owners view estimates read-only — no create control. */}
        {!isOwner && (
          <Button asChild>
            <Link href="/estimates/new">
              <Plus className="h-3.5 w-3.5 mr-1" />
              New Estimate
            </Link>
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <RecordList
          items={filtered}
          columns={columns}
          getRowKey={(e) => e.id}
          getRowHref={(e) => `/estimates/${e.id}`}
          error={loadError}
          emptyIcon={<FileText className="h-7 w-7" />}
          emptyTitle={q ? 'No matching estimates' : 'No estimates yet'}
          emptyDescription={
            q ? 'No estimates on this page match your search.' : 'Create one from a work order or directly from an aircraft.'
          }
        />

        {/* Pagination — server-side, ?page= param. The search box above
            filters only the current page; use Previous/Next for the rest. */}
        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 pt-4">
            {page > 1 ? (
              <Link
                href={`/estimates?page=${page - 1}`}
                className="h-8 px-3 rounded-md border border-border text-sm hover:bg-muted transition-colors flex items-center"
              >
                Previous
              </Link>
            ) : (
              <span className="h-8 px-3 rounded-md border border-border/50 text-sm text-muted-foreground/50 flex items-center cursor-not-allowed">
                Previous
              </span>
            )}
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            {page < totalPages ? (
              <Link
                href={`/estimates?page=${page + 1}`}
                className="h-8 px-3 rounded-md border border-border text-sm hover:bg-muted transition-colors flex items-center"
              >
                Next
              </Link>
            ) : (
              <span className="h-8 px-3 rounded-md border border-border/50 text-sm text-muted-foreground/50 flex items-center cursor-not-allowed">
                Next
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
