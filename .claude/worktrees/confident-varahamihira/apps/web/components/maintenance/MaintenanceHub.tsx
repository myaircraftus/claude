'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { FileText, ClipboardList, ShoppingCart, GitBranch, Plus, Loader2, Plane, Clock, DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WorkOrdersTab } from './WorkOrdersTab'
import { PartsOrderingTab } from './PartsOrderingTab'

type Tab = 'entries' | 'work_orders' | 'parts' | 'workflow'

interface Props {
  organizationId: string
  userRole: string
  userId: string
  aircraft: { id: string; tail_number: string; make: string; model: string; year?: number | null }[]
  members: { id: string; name: string; role: string }[]
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

const KANBAN_COLS = [
  { status: 'draft',              label: 'Draft',              color: 'border-slate-200 bg-slate-50',   dot: 'bg-slate-400',  textColor: 'text-slate-700' },
  { status: 'open',               label: 'Open',               color: 'border-blue-200 bg-blue-50',     dot: 'bg-blue-500',   textColor: 'text-blue-800' },
  { status: 'in_progress',        label: 'In Progress',        color: 'border-amber-200 bg-amber-50',   dot: 'bg-amber-500',  textColor: 'text-amber-800' },
  { status: 'awaiting_parts',     label: 'Awaiting Parts',     color: 'border-orange-200 bg-orange-50', dot: 'bg-orange-500', textColor: 'text-orange-800' },
  { status: 'ready_for_signoff',  label: 'Ready for Signoff',  color: 'border-green-200 bg-green-50',   dot: 'bg-green-500',  textColor: 'text-green-800' },
  { status: 'closed',             label: 'Closed / Invoiced',  color: 'border-purple-200 bg-purple-50', dot: 'bg-purple-500', textColor: 'text-purple-800' },
]

interface WOCard {
  id: string
  work_order_number: string
  status: string
  complaint?: string | null
  total_amount: number
  labor_total: number
  parts_total: number
  outside_services_total: number
  opened_at: string
  aircraft?: { tail_number: string; make: string; model: string } | null
  mechanic_name?: string | null
  has_parts: boolean
  has_outside: boolean
}

function KanbanView({ organizationId }: { organizationId: string }) {
  const [cards, setCards] = useState<WOCard[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/work-orders?org=${organizationId}&limit=200`)
      const data = await res.json()
      setCards(data.workOrders ?? [])
    } catch {
      setCards([])
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const byStatus = (status: string) =>
    cards.filter(c => {
      if (status === 'closed') return c.status === 'closed' || c.status === 'invoiced' || c.status === 'paid'
      return c.status === status
    })

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 px-6 pt-4 h-full">
      {KANBAN_COLS.map(col => {
        const colCards = byStatus(col.status)
        return (
          <div key={col.status} className="flex flex-col shrink-0 w-60">
            <div className={cn('rounded-xl border p-3 flex flex-col gap-2 h-full', col.color)}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={cn('w-2 h-2 rounded-full', col.dot)} />
                  <span className={cn('text-xs font-semibold', col.textColor)}>{col.label}</span>
                </div>
                <span className="text-xs font-bold text-muted-foreground">{colCards.length}</span>
              </div>

              {colCards.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No orders</p>
              )}

              {colCards.map(card => (
                <div
                  key={card.id}
                  className="bg-background rounded-lg border border-border p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => {
                    // Switch to work orders tab — this is a simple approach
                    window.dispatchEvent(new CustomEvent('open-work-order', { detail: card.id }))
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono font-semibold text-foreground">{card.work_order_number}</span>
                    {card.total_amount > 0 && (
                      <span className="text-xs font-semibold text-foreground">${card.total_amount.toFixed(0)}</span>
                    )}
                  </div>

                  {card.aircraft && (
                    <div className="flex items-center gap-1 mb-1">
                      <Plane className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-medium text-foreground">{card.aircraft.tail_number}</span>
                      <span className="text-xs text-muted-foreground">{card.aircraft.make} {card.aircraft.model}</span>
                    </div>
                  )}

                  {card.complaint && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{card.complaint}</p>
                  )}

                  <div className="flex flex-wrap gap-1">
                    {card.labor_total > 0 && (
                      <span className="flex items-center gap-0.5 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                        <Clock className="h-2.5 w-2.5" /> Labor
                      </span>
                    )}
                    {card.parts_total > 0 && (
                      <span className="flex items-center gap-0.5 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">
                        <DollarSign className="h-2.5 w-2.5" /> Parts
                      </span>
                    )}
                    {card.outside_services_total > 0 && (
                      <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">Outside</span>
                    )}
                  </div>

                  {card.mechanic_name && (
                    <p className="text-xs text-muted-foreground mt-1.5">{card.mechanic_name}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Entry Generator Tab ──────────────────────────────────────────────────────

function EntryGeneratorTab({ canWrite }: { canWrite: boolean }) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-foreground">Entry Generator</h2>
            <p className="text-sm text-muted-foreground">AI-assisted FAA-compliant maintenance logbook entries.</p>
          </div>
          {canWrite && (
            <Link
              href="/maintenance/new"
              className="flex items-center gap-2 px-4 py-2 bg-foreground text-background text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              New Entry
            </Link>
          )}
        </div>

        <Link
          href="/maintenance/new"
          className="group flex flex-col items-center justify-center p-16 border-2 border-dashed border-border rounded-xl hover:border-foreground/40 hover:bg-muted/30 transition-all text-center"
        >
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4 group-hover:bg-foreground/10 transition-colors">
            <FileText className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="font-semibold text-foreground text-base">Create a logbook entry</p>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-xs">
            AI-generated, FAA-compliant maintenance entries with digital signature and license fields
          </p>
          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            {['Annual Inspection', '100-Hour', 'Engine Run-Up', 'Avionics Repair', 'Oil Change'].map(chip => (
              <span key={chip} className="text-xs px-3 py-1 rounded-full border border-border text-muted-foreground">
                {chip}
              </span>
            ))}
          </div>
        </Link>
      </div>
    </div>
  )
}

// ─── Main Hub ─────────────────────────────────────────────────────────────────

export function MaintenanceHub({ organizationId, userRole, userId, aircraft, members }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('work_orders')
  const [woCount, setWoCount] = useState<number | null>(null)
  const [partsCount, setPartsCount] = useState<number | null>(null)

  const canWrite = ['owner', 'admin', 'mechanic'].includes(userRole)

  // Listen for kanban card clicks to switch to work orders tab
  useEffect(() => {
    const handler = () => setActiveTab('work_orders')
    window.addEventListener('open-work-order', handler)
    return () => window.removeEventListener('open-work-order', handler)
  }, [])

  const tabs = [
    { id: 'entries' as Tab, label: 'Entry Generator', icon: FileText },
    { id: 'work_orders' as Tab, label: 'Work Orders', icon: ClipboardList, count: woCount },
    { id: 'parts' as Tab, label: 'Parts & Ordering', icon: ShoppingCart, count: partsCount },
    { id: 'workflow' as Tab, label: 'Workflow', icon: GitBranch },
  ]

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Tab bar */}
      <div className="border-b border-border bg-background px-6">
        <div className="flex items-center gap-0">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span className={cn(
                  'text-xs rounded-full px-1.5 py-0.5 font-semibold',
                  activeTab === tab.id ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'entries' && (
          <EntryGeneratorTab canWrite={canWrite} />
        )}

        {activeTab === 'work_orders' && (
          <WorkOrdersTab
            organizationId={organizationId}
            userRole={userRole}
            userId={userId}
            aircraft={aircraft}
            members={members}
            onCountChange={setWoCount}
          />
        )}

        {activeTab === 'parts' && (
          <PartsOrderingTab
            organizationId={organizationId}
            userRole={userRole}
            aircraft={aircraft}
            onCountChange={setPartsCount}
          />
        )}

        {activeTab === 'workflow' && (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div>
                <h2 className="text-lg font-bold text-foreground">Workflow Board</h2>
                <p className="text-sm text-muted-foreground">Track work orders by status. Click a card to open it.</p>
              </div>
              {canWrite && (
                <button
                  onClick={() => setActiveTab('work_orders')}
                  className="flex items-center gap-2 px-4 py-2 bg-foreground text-background text-sm font-semibold rounded-lg hover:opacity-90"
                >
                  <Plus className="h-4 w-4" />
                  New Work Order
                </button>
              )}
            </div>
            <div className="flex-1 overflow-hidden">
              <KanbanView organizationId={organizationId} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
