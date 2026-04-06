'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Wrench, FileText, ClipboardList, Package, LayoutDashboard,
  Plus, Clock, Plane, ChevronRight,
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils'
import { WorkOrdersSplitPanel } from './work-orders-split-panel'
import { PartsWorkspace } from '@/app/(app)/parts/components/parts-workspace'
import { OpsDashboardClient } from '@/app/(app)/dashboard/ops/ops-dashboard-client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MaintenanceHubProps {
  // Shared
  orgId: string
  userRole: string
  currentUserId: string
  aircraft: { id: string; tail_number: string; make: string; model: string; year?: number }[]
  defaultTab: string

  // Entry Generator tab
  drafts: any[]
  selectedAircraftId: string | null

  // Work Orders tab
  workOrders: any[]
  workOrderStats: { open: number; in_progress: number; ready_for_signoff: number; total: number }

  // Parts tab
  orders: any[]
  partsStats: { total: number; ordered: number; received: number; spend: number }

  // Workflow tab
  members: any[]
  opsWorkOrders: any[]
  invoices: any[]
  pendingRequests: any[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENTRY_TYPE_LABELS: Record<string, string> = {
  '100hr': '100-Hour',
  annual: 'Annual',
  oil_change: 'Oil Change',
  repair: 'Repair',
  overhaul: 'Overhaul',
  ad_compliance: 'AD Compliance',
  maintenance: 'Maintenance',
  custom: 'Custom',
}

const STATUS_VARIANT: Record<string, 'secondary' | 'warning' | 'success' | 'danger' | 'info'> = {
  draft: 'secondary',
  review: 'warning',
  signed: 'success',
  void: 'danger',
  finalized: 'info',
}

const LOGBOOK_LABELS: Record<string, string> = {
  airframe: 'Airframe',
  engine: 'Engine',
  prop: 'Propeller',
  avionics: 'Avionics',
  multiple: 'Multiple',
}

type TabKey = 'entries' | 'work-orders' | 'parts' | 'workflow'

const TAB_META: { key: TabKey; label: string; icon: typeof FileText }[] = [
  { key: 'entries', label: 'Entry Generator', icon: FileText },
  { key: 'work-orders', label: 'Work Orders', icon: ClipboardList },
  { key: 'parts', label: 'Parts & Ordering', icon: Package },
  { key: 'workflow', label: 'Workflow', icon: LayoutDashboard },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MaintenanceHubClient({
  orgId,
  userRole,
  currentUserId,
  aircraft,
  defaultTab,
  drafts,
  selectedAircraftId: initialAircraftId,
  workOrders,
  workOrderStats,
  orders,
  partsStats,
  members,
  opsWorkOrders,
  invoices,
  pendingRequests,
}: MaintenanceHubProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const currentTab = (searchParams.get('tab') as TabKey) || (defaultTab as TabKey) || 'entries'

  // Client-side aircraft filter for Entry Generator
  const [filterAircraftId, setFilterAircraftId] = useState<string | null>(initialAircraftId)

  const filteredDrafts = useMemo(() => {
    if (!filterAircraftId) return drafts
    return drafts.filter((d: any) => d.aircraft_id === filterAircraftId)
  }, [drafts, filterAircraftId])

  const handleTabChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('tab', value)
      router.push(`/maintenance?${params.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="px-6 pt-6 pb-2">
        <div className="flex items-center gap-2 mb-1">
          <Wrench className="h-5 w-5 text-brand-600" />
          <h1 className="text-2xl font-bold text-foreground">Maintenance</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Logbook entries, work orders, parts, and shop workflow in one place.
        </p>
      </div>

      {/* Tabs */}
      <Tabs
        value={currentTab}
        onValueChange={handleTabChange}
        className="flex flex-col flex-1 overflow-hidden"
      >
        <div className="px-6">
          <TabsList className="bg-transparent border-b border-border rounded-none p-0 h-auto w-full justify-start gap-0">
            {TAB_META.map(({ key, label, icon: Icon }) => (
              <TabsTrigger
                key={key}
                value={key}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-brand-600 data-[state=active]:text-foreground data-[state=active]:shadow-none px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <Icon className="h-4 w-4 mr-2" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Tab 1 - Entry Generator                                         */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="entries" className="flex-1 overflow-y-auto mt-0">
          <div className="p-6">
            <div className="max-w-5xl mx-auto space-y-6">
              {/* Header + New Entry button */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Logbook Entry Drafts</h2>
                  <p className="text-sm text-muted-foreground">
                    AI-generated FAA-compliant maintenance logbook entries.
                  </p>
                </div>
                <Button size="sm" asChild>
                  <Link href="/maintenance/new">
                    <Plus className="h-4 w-4 mr-1" />
                    New Entry
                  </Link>
                </Button>
              </div>

              {/* Aircraft filter badges */}
              {aircraft.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium mr-1">
                    Filter:
                  </span>
                  <button type="button" onClick={() => setFilterAircraftId(null)}>
                    <Badge
                      variant={filterAircraftId === null ? 'default' : 'outline'}
                      className="cursor-pointer hover:bg-primary/90 transition-colors"
                    >
                      All Aircraft
                    </Badge>
                  </button>
                  {aircraft.map((ac) => (
                    <button
                      type="button"
                      key={ac.id}
                      onClick={() => setFilterAircraftId(ac.id)}
                    >
                      <Badge
                        variant={filterAircraftId === ac.id ? 'default' : 'outline'}
                        className="cursor-pointer transition-colors"
                      >
                        <Plane className="h-3 w-3 mr-1" />
                        {ac.tail_number}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}

              {/* Drafts list */}
              {filteredDrafts.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="p-4 rounded-full bg-muted mb-4">
                      <Wrench className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="font-semibold text-foreground mb-1">No maintenance entries yet</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mb-6">
                      Use AI to generate professionally formatted, FAA-compliant maintenance logbook
                      entries in seconds.
                    </p>
                    <Button asChild>
                      <Link href="/maintenance/new">
                        <Plus className="h-4 w-4 mr-1" />
                        Create First Entry
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {filteredDrafts.map((draft: any) => {
                    const ac = draft.aircraft
                    const displayText = draft.edited_text ?? draft.ai_generated_text ?? ''
                    return (
                      <Link key={draft.id} href={`/maintenance/new?draft=${draft.id}`}>
                        <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-3 min-w-0">
                                <div className="p-2 rounded-lg bg-muted flex-shrink-0 mt-0.5">
                                  <FileText className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    {ac && (
                                      <span className="text-xs font-mono font-semibold text-primary">
                                        {ac.tail_number}
                                      </span>
                                    )}
                                    {draft.entry_type && (
                                      <Badge variant="secondary" className="text-xs">
                                        {ENTRY_TYPE_LABELS[draft.entry_type] ?? draft.entry_type}
                                      </Badge>
                                    )}
                                    {draft.logbook_type && (
                                      <Badge variant="outline" className="text-xs">
                                        {LOGBOOK_LABELS[draft.logbook_type] ?? draft.logbook_type}
                                      </Badge>
                                    )}
                                  </div>
                                  {displayText ? (
                                    <p className="text-sm text-foreground line-clamp-2 leading-relaxed">
                                      {displayText.slice(0, 180)}
                                      {displayText.length > 180 ? '...' : ''}
                                    </p>
                                  ) : draft.ai_prompt ? (
                                    <p className="text-sm text-muted-foreground italic line-clamp-2">
                                      &ldquo;{draft.ai_prompt.slice(0, 120)}&rdquo;
                                    </p>
                                  ) : (
                                    <p className="text-sm text-muted-foreground">No content yet</p>
                                  )}
                                  <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                                    <Clock className="h-3 w-3" />
                                    <span>{formatDateTime(draft.created_at)}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Badge variant={STATUS_VARIANT[draft.status] ?? 'secondary'}>
                                  {draft.status.charAt(0).toUpperCase() + draft.status.slice(1)}
                                </Badge>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* Tab 2 - Work Orders                                             */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="work-orders" className="flex-1 overflow-y-auto mt-0">
          <div className="p-6">
            <WorkOrdersSplitPanel
              workOrders={workOrders}
              stats={workOrderStats}
              aircraft={aircraft}
              userRole={userRole}
            />
          </div>
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* Tab 3 - Parts & Ordering                                        */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="parts" className="flex-1 overflow-y-auto mt-0">
          <PartsWorkspace
            orgId={orgId}
            aircraft={aircraft}
            orders={orders}
            stats={partsStats}
            initialTab="search"
          />
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* Tab 4 - Workflow                                                */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="workflow" className="flex-1 overflow-y-auto mt-0">
          <div className="p-6">
            <OpsDashboardClient
              members={members}
              workOrders={opsWorkOrders}
              aircraft={aircraft}
              invoices={invoices}
              pendingRequests={pendingRequests}
              currentUserId={currentUserId}
              embedded={true}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

