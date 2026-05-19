'use client'

/**
 * Work Orders shell.
 *
 * /work-orders renders the operations strip plus the scrollable work-order
 * picker. /work-orders/[id] switches to a focused execution workspace so the
 * selected work order owns the full content area.
 *
 * One click → rich view. No intermediate panels, no chat detour.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ClipboardList, Plane, Plus, Search,
} from 'lucide-react'
import { OpsTabStrip } from '@/components/ops/ops-tab-strip'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useTenantRouter } from '@/components/shared/tenant-link'
import { CreateWorkOrderModal } from '@/components/work-orders/create-work-order-modal'
import type { WorkOrderStatus } from '@/types'

const STATUS_LABEL: Record<string, string> = {
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

const STATUS_COLOR: Record<string, string> = {
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

export interface WorkOrderListItem {
  id: string
  work_order_number: string
  status: string
  customer_complaint?: string | null
  total_amount?: number | null
  opened_at?: string | null
  created_at: string
  updated_at?: string | null
  aircraft?: {
    id: string
    tail_number: string
    make?: string | null
    model?: string | null
  } | null
  aircraft_id?: string | null
}

export interface ShellAircraft {
  id: string
  tail_number: string
}

export function WorkOrdersShell({
  workOrders,
  aircraft,
  children,
  isOwner = false,
  page = 1,
  totalPages = 1,
}: {
  workOrders: WorkOrderListItem[]
  aircraft: ShellAircraft[]
  children: React.ReactNode
  /** Owner persona — read-only: the create-WO control is hidden (PART 3A). */
  isOwner?: boolean
  /** Server-side pagination — current page (1-based) and total page count. */
  page?: number
  totalPages?: number
}) {
  const pathname = usePathname()
  const router = useTenantRouter()
  const [searchQ, setSearchQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [showCreate, setShowCreate] = useState(false)

  // Pull the current selection from the URL so the highlight stays
  // accurate after navigation. /work-orders/<id> → that <id>; /work-orders → null.
  const selectedId = useMemo(() => {
    const m = pathname.match(/\/work-orders\/([^/?#]+)/)
    return m ? m[1] : null
  }, [pathname])
  const isDetailView = selectedId !== null

  const filtered = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    return workOrders.filter((wo) => {
      if (statusFilter && wo.status !== statusFilter) return false
      if (!q) return true
      return (
        wo.work_order_number.toLowerCase().includes(q) ||
        (wo.aircraft?.tail_number ?? '').toLowerCase().includes(q) ||
        (wo.customer_complaint ?? '').toLowerCase().includes(q)
      )
    })
  }, [workOrders, searchQ, statusFilter])

  const stats = useMemo(() => {
    const open = workOrders.filter((wo) => wo.status === 'open').length
    const inProgress = workOrders.filter((wo) => wo.status === 'in_progress').length
    const ready = workOrders.filter((wo) => wo.status === 'ready_for_signoff').length
    return { open, inProgress, ready, total: workOrders.length }
  }, [workOrders])

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Operations tab strip — Work Orders / Estimates / Invoices / Logbook
          stays on the picker page; selected work orders get full focus. */}
      {!isDetailView && <OpsTabStrip active="work-orders" />}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: list ─────────────────────────────────────── */}
        {!isDetailView && (
          <div className="w-[420px] flex-shrink-0 flex flex-col border-r border-border bg-white">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Work Orders</h2>
              {/* Owners view work orders read-only — no create control. */}
              {!isOwner && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => setShowCreate(true)}
                  className="h-7 px-2.5"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> New
                </Button>
              )}
            </div>

            {/* Stats strip */}
            <div className="px-4 py-3 border-b border-border">
              <div className="flex gap-2">
                {[
                  { label: 'Open', value: stats.open, color: 'text-blue-600 bg-blue-50' },
                  { label: 'In Prog.', value: stats.inProgress, color: 'text-indigo-600 bg-indigo-50' },
                  { label: 'Ready', value: stats.ready, color: 'text-emerald-600 bg-emerald-50' },
                  { label: 'Total', value: stats.total, color: 'text-foreground bg-muted' },
                ].map((s) => (
                  <div key={s.label} className={cn('flex-1 rounded-lg px-2 py-1.5 text-center', s.color)}>
                    <p className="text-base font-bold leading-none">{s.value}</p>
                    <p className="text-[10px] mt-0.5 opacity-80">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Search + status filter */}
            <div className="px-4 py-3 border-b border-border space-y-2">
              <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-md px-2.5 py-1.5">
                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Search WO#, tail, complaint..."
                  aria-label="Search work orders"
                  className="bg-transparent text-[12px] outline-none flex-1 placeholder:text-muted-foreground/50"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">All statuses</option>
                {Object.entries(STATUS_LABEL).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            {/* Scrollable list — Link-based so navigation is one click */}
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-2">
                    <ClipboardList className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No work orders</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {searchQ || statusFilter ? 'Try adjusting your filters.' : 'Click "New" to create one.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filtered.map((wo) => (
                    <Link
                      key={wo.id}
                      href={`/work-orders/${wo.id}`}
                      className={cn(
                        'block px-4 py-3 transition-colors hover:bg-muted/40 border-l-2',
                        selectedId === wo.id
                          ? 'bg-brand-50 border-l-brand-500'
                          : 'border-l-transparent',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs font-semibold text-brand-600">
                              {wo.work_order_number}
                            </span>
                            <span className={cn(
                              'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border leading-none',
                              STATUS_COLOR[wo.status] ?? STATUS_COLOR.draft,
                            )}>
                              {STATUS_LABEL[wo.status] ?? wo.status}
                            </span>
                          </div>
                          {wo.aircraft && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                              <Plane className="h-3 w-3" />
                              {wo.aircraft.tail_number}
                            </p>
                          )}
                          {wo.customer_complaint && (
                            <p className="text-xs text-foreground/80 truncate mb-1">
                              {wo.customer_complaint}
                            </p>
                          )}
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span>{formatDate(wo.opened_at ?? wo.created_at)}</span>
                            <span className="tabular-nums font-medium">
                              ${Number(wo.total_amount ?? 0).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Pagination — server-side, ?page= param. Search + status
                filter above operate on the current page only. */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border">
                <Link
                  href={`/work-orders?page=${page - 1}`}
                  aria-disabled={page <= 1}
                  className={cn(
                    'h-7 px-2.5 rounded-md border border-border text-xs flex items-center transition-colors',
                    page <= 1
                      ? 'pointer-events-none opacity-40'
                      : 'hover:bg-muted',
                  )}
                >
                  Previous
                </Link>
                <span className="text-xs text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Link
                  href={`/work-orders?page=${page + 1}`}
                  aria-disabled={page >= totalPages}
                  className={cn(
                    'h-7 px-2.5 rounded-md border border-border text-xs flex items-center transition-colors',
                    page >= totalPages
                      ? 'pointer-events-none opacity-40'
                      : 'hover:bg-muted',
                  )}
                >
                  Next
                </Link>
              </div>
            )}
          </div>
        )}

        {/* ── Right: route children (detail or empty state) ──────── */}
        <div className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
          {children}
        </div>
      </div>{/* close inner flex row */}

      {/* New WO modal — unified create flow (never opens for owners) */}
      {showCreate && !isOwner && (
        <CreateWorkOrderModal
          aircraft={aircraft}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false)
            router.push(`/work-orders/${id}`)
          }}
        />
      )}
    </div>
  )
}

// ─── Empty state for /work-orders (no id) ────────────────────────

export function WorkOrdersEmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <ClipboardList className="h-7 w-7 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">Select a work order</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
        Click any work order in the list to see its full detail — line items, checklist, AD/SB, logbook, invoice, and more.
      </p>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

function formatDate(iso?: string | null) {
  if (!iso) return ''
  // Hydration-safe: parse the ISO calendar fields directly instead of via
  // `new Date(...).toLocaleDateString(...)`. The Date+toLocaleDateString
  // pair is sensitive to BOTH the runtime locale (en-US vs other) AND the
  // runtime timezone (server is iad1, client is the user's browser tz);
  // the timezone difference shifts the day across the UTC midnight
  // boundary, so the same ISO renders as "Apr 27, 26" server-side and
  // "Apr 28, 26" client-side. Pure-string parsing yields the SAME calendar
  // date on both sides regardless of locale or timezone.
  const head = iso.slice(0, 10) // "YYYY-MM-DD" prefix; works for full ISO and date-only.
  const parts = head.split('-')
  if (parts.length !== 3) return ''
  const [yStr, mStr, dStr] = parts
  const y = Number(yStr)
  const m = Number(mStr)
  const d = Number(dStr)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return ''
  if (m < 1 || m > 12) return ''
  return `${MONTH_ABBR[m - 1]} ${d}, ${String(y).slice(-2)}`
}
