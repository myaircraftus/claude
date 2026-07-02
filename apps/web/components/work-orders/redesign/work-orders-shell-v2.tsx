'use client'

/**
 * Work Orders shell — redesign (v2).
 *
 * This is the DEFAULT work-orders list. The original shell stays reachable at
 * ?ui=legacy (see lib/work-orders/ui-mode.ts — flip DEFAULT_WO_UI to revert).
 * Same data + behaviour as the original WorkOrdersShell (selection highlight,
 * client search, status filter, stats, create modal, server pagination,
 * master-detail collapse) — restyled into a calmer, more spacious, card-based
 * layout that shares the redesign's status system (./wo-status).
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ClipboardList, Plane, Plus, Search } from 'lucide-react'
import { OpsTabStrip } from '@/components/ops/ops-tab-strip'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useTenantRouter } from '@/components/shared/tenant-link'
import { CreateWorkOrderModalV2 } from './create-work-order-modal-v2'
import { woHref } from '@/lib/work-orders/ui-mode'
import { WO_STATUS_LABEL, woStatusLabel, woStatusPill, woStatusDot } from './wo-status'

interface WorkOrderListItem {
  id: string
  work_order_number: string
  status: string
  customer_complaint?: string | null
  total_amount?: number | null
  opened_at?: string | null
  created_at: string
  updated_at?: string | null
  aircraft?: { id: string; tail_number: string; make?: string | null; model?: string | null } | null
  aircraft_id?: string | null
  assigned_mechanic_id?: string | null
}

interface ShellAircraft {
  id: string
  tail_number: string
}

export function WorkOrdersShellV2({
  workOrders,
  aircraft,
  children,
  isOwner = false,
  currentUserId = null,
  page = 1,
  totalPages = 1,
}: {
  workOrders: WorkOrderListItem[]
  aircraft: ShellAircraft[]
  children: React.ReactNode
  isOwner?: boolean
  currentUserId?: string | null
  page?: number
  totalPages?: number
}) {
  const pathname = usePathname()
  const router = useTenantRouter()
  const [searchQ, setSearchQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [mineOnly, setMineOnly] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  const selectedId = useMemo(() => {
    const m = pathname.match(/\/work-orders\/([^/?#]+)/)
    return m ? m[1] : null
  }, [pathname])
  const isDetailView = selectedId !== null

  const filtered = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    return workOrders.filter((wo) => {
      if (mineOnly && wo.assigned_mechanic_id !== currentUserId) return false
      if (statusFilter && wo.status !== statusFilter) return false
      if (!q) return true
      return (
        wo.work_order_number.toLowerCase().includes(q) ||
        (wo.aircraft?.tail_number ?? '').toLowerCase().includes(q) ||
        (wo.customer_complaint ?? '').toLowerCase().includes(q)
      )
    })
  }, [workOrders, searchQ, statusFilter, mineOnly, currentUserId])

  const stats = useMemo(() => ({
    open: workOrders.filter((wo) => wo.status === 'open').length,
    inProgress: workOrders.filter((wo) => wo.status === 'in_progress').length,
    ready: workOrders.filter((wo) => wo.status === 'ready_for_signoff').length,
    total: workOrders.length,
  }), [workOrders])

  // Each chip is also a one-tap status filter (Total clears it).
  const statItems = [
    { label: 'Open', value: stats.open, cls: 'text-blue-600', filter: 'open' },
    { label: 'In progress', value: stats.inProgress, cls: 'text-indigo-600', filter: 'in_progress' },
    { label: 'Ready', value: stats.ready, cls: 'text-emerald-600', filter: 'ready_for_signoff' },
    { label: 'Total', value: stats.total, cls: 'text-foreground', filter: '' },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden bg-muted/20">
      {/* Ops nav stays on desktop; on narrow screens it hides once a WO is open
          so the detail gets the full screen. */}
      <div className={cn('shrink-0', isDetailView && 'hidden lg:block')}>
        <OpsTabStrip active="work-orders" />
      </div>
      <div className="flex flex-1 overflow-hidden">
        {/* List panel — persistent beside the detail on desktop (master-detail);
            full-width when browsing on narrow screens; hidden on narrow once a
            WO is open (the detail drills in full-screen). */}
        <div className={cn(
          'flex-col border-r border-border bg-background w-full lg:w-[380px] lg:flex-shrink-0',
          isDetailView ? 'hidden lg:flex' : 'flex',
        )}>
            {/* Header */}
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-foreground leading-tight">Work orders</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{stats.total} on this page</p>
              </div>
              {!isOwner && (
                <Button size="sm" onClick={() => setShowCreate(true)} className="h-8 rounded-lg px-3">
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> New
                </Button>
              )}
            </div>

            {/* Stats — tap to filter */}
            <div className="px-5 pb-3">
              <div className="grid grid-cols-4 gap-2">
                {statItems.map((s) => {
                  const active = s.filter !== '' && statusFilter === s.filter
                  return (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => setStatusFilter(active ? '' : s.filter)}
                      aria-pressed={active}
                      title={s.filter ? `Show only ${s.label.toLowerCase()}` : 'Show all statuses'}
                      className={cn(
                        'rounded-xl border bg-background px-1.5 py-2.5 text-center transition-colors',
                        active
                          ? 'border-indigo-300 ring-1 ring-indigo-200 bg-indigo-50/50'
                          : 'border-border hover:border-foreground/25',
                      )}
                    >
                      <p className={cn('text-lg font-semibold leading-none tabular-nums', s.cls)}>{s.value}</p>
                      <p className="text-[10px] text-muted-foreground mt-1.5 leading-none truncate">{s.label}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Assigned-to-me toggle — a mechanic's "my work" view */}
            {!isOwner && currentUserId && (
              <div className="px-5 pb-3">
                <div className="inline-flex rounded-lg border border-border p-0.5 text-[12px]">
                  <button
                    type="button"
                    onClick={() => setMineOnly(false)}
                    aria-pressed={!mineOnly}
                    className={cn('rounded-md px-2.5 py-1 transition-colors', !mineOnly ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground')}
                  >
                    All work
                  </button>
                  <button
                    type="button"
                    onClick={() => setMineOnly(true)}
                    aria-pressed={mineOnly}
                    className={cn('rounded-md px-2.5 py-1 transition-colors', mineOnly ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground')}
                  >
                    Assigned to me
                  </button>
                </div>
              </div>
            )}

            {/* Search + filter */}
            <div className="px-5 pb-3 space-y-2">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 focus-within:ring-1 focus-within:ring-ring">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Search WO#, tail, complaint…"
                  aria-label="Search work orders"
                  className="bg-transparent text-[13px] outline-none flex-1 placeholder:text-muted-foreground/60"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-border bg-background text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">All statuses</option>
                {Object.entries(WO_STATUS_LABEL).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                  <div className="w-11 h-11 rounded-2xl bg-muted flex items-center justify-center mb-3">
                    <ClipboardList className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No work orders</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {mineOnly
                      ? 'Nothing is assigned to you on this page.'
                      : searchQ || statusFilter
                        ? 'Try adjusting your filters.'
                        : isOwner
                          ? 'Work orders from your shop will show up here.'
                          : 'Click “New” to create one.'}
                  </p>
                </div>
              ) : (
                filtered.map((wo) => {
                  const selected = selectedId === wo.id
                  return (
                    <Link
                      key={wo.id}
                      href={woHref(`/work-orders/${wo.id}`, 'v2')}
                      className={cn(
                        'block rounded-xl border bg-background px-3.5 py-3 transition-all',
                        selected
                          ? 'border-brand-500/40 bg-brand-50/60 ring-1 ring-brand-500/30'
                          : 'border-border hover:border-foreground/20 hover:shadow-sm',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-[13px] text-foreground truncate">
                          {wo.work_order_number}
                        </span>
                        <span className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0',
                          woStatusPill(wo.status),
                        )}>
                          <span className={cn('h-1.5 w-1.5 rounded-full', woStatusDot(wo.status))} />
                          {woStatusLabel(wo.status)}
                        </span>
                      </div>
                      {wo.aircraft && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1.5">
                          <Plane className="h-3 w-3 shrink-0" />
                          {wo.aircraft.tail_number}
                          {wo.aircraft.model ? <span className="text-muted-foreground/70">· {wo.aircraft.model}</span> : null}
                        </p>
                      )}
                      {wo.customer_complaint && (
                        <p className="text-xs text-foreground/75 line-clamp-1 mt-1">{wo.customer_complaint}</p>
                      )}
                      <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          {formatDate(wo.opened_at ?? wo.created_at)}
                          <AgeBadge openedAt={wo.opened_at ?? wo.created_at} status={wo.status} />
                        </span>
                        <span className="tabular-nums font-medium text-foreground/80">
                          ${Number(wo.total_amount ?? 0).toFixed(2)}
                        </span>
                      </div>
                    </Link>
                  )
                })
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border">
                <Link
                  href={woHref('/work-orders', 'v2', { page: page - 1 })}
                  aria-disabled={page <= 1}
                  className={cn(
                    'h-8 px-3 rounded-lg border border-border text-xs flex items-center transition-colors',
                    page <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-muted',
                  )}
                >
                  Previous
                </Link>
                <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
                <Link
                  href={woHref('/work-orders', 'v2', { page: page + 1 })}
                  aria-disabled={page >= totalPages}
                  className={cn(
                    'h-8 px-3 rounded-lg border border-border text-xs flex items-center transition-colors',
                    page >= totalPages ? 'pointer-events-none opacity-40' : 'hover:bg-muted',
                  )}
                >
                  Next
                </Link>
              </div>
            )}
          </div>

        {/* Right pane: the selected work order's detail (or the empty state).
            On desktop it sits beside the list and swaps in place; on narrow
            screens it takes the full screen when a WO is open, and stays hidden
            while browsing so the list owns the screen. */}
        <div className={cn('flex-1 flex-col min-w-0 bg-background overflow-hidden', isDetailView ? 'flex' : 'hidden lg:flex')}>
          {children}
        </div>
      </div>

      {showCreate && !isOwner && (
        <CreateWorkOrderModalV2
          aircraft={aircraft}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false)
            router.push(woHref(`/work-orders/${id}`, 'v2'))
            // The list + stat chips are server-rendered — without a refresh
            // the new WO doesn't appear in the panel until a manual reload.
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

// Redesigned empty state for the right pane on /work-orders?ui=v2.
export function WorkOrdersEmptyStateV2() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <ClipboardList className="h-7 w-7 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">Select a work order</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
        Pick a work order from the list to open its full detail — checklist, parts, costs, sign-off, and activity.
      </p>
    </div>
  )
}

// Age chip — "3d" / "12d" since opening, amber once it's sat past a week.
// Only on still-active WOs: a closed order isn't "aging".
const WO_DONE_STATUSES = new Set(['closed', 'invoiced', 'paid', 'archived'])
const STALE_AFTER_DAYS = 7

function AgeBadge({ openedAt, status }: { openedAt?: string | null; status: string }) {
  if (!openedAt || WO_DONE_STATUSES.has(status)) return null
  const t = Date.parse(openedAt)
  if (Number.isNaN(t)) return null
  const days = Math.floor((Date.now() - t) / 86_400_000)
  if (days < 1) return null
  return (
    // suppressHydrationWarning: "now" can tick across a day boundary between
    // server render and hydration.
    <span
      suppressHydrationWarning
      className={cn(
        'rounded px-1 py-px text-[10px] font-medium tabular-nums leading-none',
        days > STALE_AFTER_DAYS ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground',
      )}
      title={`Open for ${days} day${days === 1 ? '' : 's'}`}
    >
      {days}d
    </span>
  )
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

// Hydration-safe date format (parse ISO fields directly — no Date/locale/tz).
function formatDate(iso?: string | null) {
  if (!iso) return ''
  const head = iso.slice(0, 10)
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
