'use client'

/**
 * Workflow Board — kanban view of all active work orders for the org.
 * Columns mirror the WorkOrderStatus pipeline. Each card shows aircraft,
 * mechanic assignment, total $, and a status pill. Clicking a card goes
 * straight to /work-orders/[id] — no intermediate panels.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plane, User, DollarSign, Filter, Wrench } from 'lucide-react'
import type { WorkOrderStatus } from '@/types'

interface WorkflowBoardProps {
  workOrders: any[]
  mechanicById: Record<string, { name: string; role: string }>
}

const COLUMNS: Array<{
  status: WorkOrderStatus | 'closed_group'
  label: string
  match: (s: string) => boolean
  borderClass: string
  pillClass: string
  dotClass: string
}> = [
  { status: 'draft',              label: 'Draft',             match: (s) => s === 'draft',
    borderClass: 'border-t-slate-400',  pillClass: 'bg-slate-100 text-slate-600', dotClass: 'bg-slate-400' },
  { status: 'open',               label: 'Open',              match: (s) => s === 'open' || s === 'awaiting_approval',
    borderClass: 'border-t-blue-500',   pillClass: 'bg-blue-50 text-blue-700',    dotClass: 'bg-blue-500' },
  { status: 'in_progress',        label: 'In Progress',       match: (s) => s === 'in_progress',
    borderClass: 'border-t-indigo-500', pillClass: 'bg-indigo-50 text-indigo-700', dotClass: 'bg-indigo-500' },
  { status: 'awaiting_parts',     label: 'Awaiting Parts',    match: (s) => s === 'awaiting_parts' || s === 'waiting_on_customer',
    borderClass: 'border-t-amber-500',  pillClass: 'bg-amber-50 text-amber-700',  dotClass: 'bg-amber-500' },
  { status: 'ready_for_signoff',  label: 'Ready for Signoff', match: (s) => s === 'ready_for_signoff',
    borderClass: 'border-t-cyan-500',   pillClass: 'bg-cyan-50 text-cyan-700',    dotClass: 'bg-cyan-500' },
  { status: 'closed_group',       label: 'Closed / Invoiced', match: (s) => s === 'closed' || s === 'invoiced' || s === 'paid',
    borderClass: 'border-t-emerald-500', pillClass: 'bg-emerald-50 text-emerald-700', dotClass: 'bg-emerald-500' },
]

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  open: 'Open',
  awaiting_approval: 'Awaiting Approval',
  awaiting_parts: 'Awaiting Parts',
  in_progress: 'In Progress',
  waiting_on_customer: 'Waiting on Customer',
  ready_for_signoff: 'Ready for Signoff',
  closed: 'Closed',
  invoiced: 'Invoiced',
  paid: 'Paid',
  archived: 'Archived',
}

function formatMoney(n: number) {
  if (!Number.isFinite(n) || n === 0) return null
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`
}

function mechanicInitials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function avatarColor(name: string) {
  const palette = [
    'bg-blue-600', 'bg-violet-600', 'bg-emerald-600',
    'bg-amber-500', 'bg-rose-600', 'bg-teal-600', 'bg-indigo-600',
  ]
  const h = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return palette[h % palette.length]
}

export function WorkflowBoard({ workOrders, mechanicById }: WorkflowBoardProps) {
  const [filterMechanic, setFilterMechanic] = useState<string>('all')

  // Build mechanic filter options from work orders that actually have an
  // assignment + every mechanic in the org (so unassigned columns still let
  // you assign someone via the WO detail page).
  const mechanicOptions = useMemo(() => {
    const ids = new Set<string>()
    for (const wo of workOrders) {
      if (wo.assigned_mechanic_id) ids.add(wo.assigned_mechanic_id)
    }
    return [
      { id: 'all',         label: 'All mechanics' },
      { id: 'unassigned',  label: 'Unassigned' },
      ...Array.from(ids).map((id) => ({
        id,
        label: mechanicById[id]?.name ?? 'Unknown',
      })),
    ]
  }, [workOrders, mechanicById])

  const filteredWorkOrders = useMemo(() => {
    if (filterMechanic === 'all') return workOrders
    if (filterMechanic === 'unassigned') return workOrders.filter((wo) => !wo.assigned_mechanic_id)
    return workOrders.filter((wo) => wo.assigned_mechanic_id === filterMechanic)
  }, [workOrders, filterMechanic])

  // Group by column.
  const cardsByColumn = useMemo(() => {
    const map: Record<string, any[]> = {}
    for (const col of COLUMNS) map[col.status] = []
    for (const wo of filteredWorkOrders) {
      const col = COLUMNS.find((c) => c.match(wo.status))
      if (col) map[col.status].push(wo)
    }
    return map
  }, [filteredWorkOrders])

  const totalActive = filteredWorkOrders.filter(
    (wo) => !['closed', 'invoiced', 'paid', 'archived'].includes(wo.status),
  ).length

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-6 py-4 border-b border-border bg-white shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[20px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
              Workflow Board
            </h1>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {totalActive} active work order{totalActive !== 1 ? 's' : ''} across the shop · click any card to open
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Filter className="w-3.5 h-3.5" />
              <select
                value={filterMechanic}
                onChange={(e) => setFilterMechanic(e.target.value)}
                className="bg-white border border-border rounded-lg px-2.5 py-1.5 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 cursor-pointer"
              >
                {mechanicOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden bg-[#F7F8FA]">
        <div className="flex gap-4 p-6 h-full min-w-max">
          {COLUMNS.map((col) => {
            const cards = cardsByColumn[col.status] ?? []
            return (
              <div
                key={col.status}
                className={`w-[300px] shrink-0 bg-white rounded-xl border-t-4 ${col.borderClass} flex flex-col shadow-sm`}
              >
                <div className="p-3 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${col.dotClass}`} />
                    <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>
                      {col.label}
                    </span>
                  </div>
                  <span className="text-[10px] bg-slate-50 border border-border px-1.5 py-0.5 rounded-full text-muted-foreground" style={{ fontWeight: 600 }}>
                    {cards.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {cards.length === 0 ? (
                    <div className="text-center py-8 text-[11px] text-muted-foreground/50">
                      No items
                    </div>
                  ) : (
                    cards.map((wo) => {
                      const mech = wo.assigned_mechanic_id ? mechanicById[wo.assigned_mechanic_id] : null
                      const aircraft = Array.isArray(wo.aircraft) ? wo.aircraft[0] : wo.aircraft
                      const total = Number(wo.total_amount ?? 0)
                      const totalLabel = formatMoney(total)
                      const desc = wo.customer_complaint || wo.discrepancy || ''
                      return (
                        <Link
                          key={wo.id}
                          href={`/work-orders/${wo.id}`}
                          className="block bg-white rounded-lg border border-border p-3 shadow-sm hover:shadow-md hover:border-primary/30 transition-all"
                        >
                          <div className="flex items-start justify-between mb-1.5 gap-2">
                            <span className="text-[12px] text-primary tabular-nums" style={{ fontWeight: 600 }}>
                              {wo.work_order_number}
                            </span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${col.pillClass}`} style={{ fontWeight: 600 }}>
                              {STATUS_LABELS[wo.status] ?? wo.status}
                            </span>
                          </div>
                          {aircraft && (
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <Plane className="w-3 h-3 text-muted-foreground" />
                              <span className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>
                                {aircraft.tail_number}
                              </span>
                              {(aircraft.make || aircraft.model) && (
                                <span className="text-[10px] text-muted-foreground truncate">
                                  {[aircraft.make, aircraft.model].filter(Boolean).join(' ')}
                                </span>
                              )}
                            </div>
                          )}
                          {desc && (
                            <div className="text-[11px] text-muted-foreground line-clamp-2 mb-2">
                              {desc}
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border">
                            {mech ? (
                              <div className="flex items-center gap-1.5 min-w-0">
                                <div
                                  className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] shrink-0 ${avatarColor(mech.name)}`}
                                  style={{ fontWeight: 700 }}
                                >
                                  {mechanicInitials(mech.name)}
                                </div>
                                <span className="text-[10px] text-foreground truncate" style={{ fontWeight: 500 }}>
                                  {mech.name}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-[10px] text-amber-700">
                                <User className="w-3 h-3" /> Unassigned
                              </div>
                            )}
                            {totalLabel && (
                              <span className="flex items-center gap-0.5 text-[10px] text-foreground tabular-nums" style={{ fontWeight: 600 }}>
                                <DollarSign className="w-3 h-3 text-muted-foreground" />
                                {totalLabel}
                              </span>
                            )}
                          </div>
                        </Link>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
