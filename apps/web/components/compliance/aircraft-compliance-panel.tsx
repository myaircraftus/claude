'use client'

/**
 * AircraftCompliancePanel (Spec 1.2) — embeddable per-aircraft view.
 *
 * Self-fetches /api/aircraft/[id]/compliance on mount and refreshes
 * after every mutation. Mounted at /aircraft/[id]/compliance/page.tsx.
 * Logged follow-up: tab-embed inside the legacy AircraftDetail.tsx.
 */

import { useCallback, useEffect, useState } from 'react'
import { Plus, Loader2, ClipboardCheck } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from '@/components/ui/button'
import { ComplianceItemForm } from './compliance-item-form'
import { ComplianceDueList } from './compliance-due-list'
import type { ComplianceItem, OrgRole } from '@/types'

const READ_ONLY_ROLES = new Set<OrgRole>(['viewer', 'auditor', 'pilot'])

interface PanelData {
  aircraft: { id: string; tail_number: string }
  items: ComplianceItem[]
  due_list: ComplianceItem[]
}

export function AircraftCompliancePanel({
  aircraftId,
  userRole,
}: {
  aircraftId: string
  userRole: OrgRole
}) {
  const canMutate = !READ_ONLY_ROLES.has(userRole)
  const [data, setData] = useState<PanelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [tab, setTab] = useState<'due' | 'all'>('due')

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/compliance`, { cache: 'no-store' })
      if (!res.ok) return
      const payload = await res.json()
      setData(payload as PanelData)
    } finally {
      setLoading(false)
    }
  }, [aircraftId])

  useEffect(() => { refresh() }, [refresh])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    )
  }
  if (!data) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
        <p className="text-[12.5px] text-muted-foreground">Could not load compliance for this aircraft.</p>
      </div>
    )
  }

  const overdueCount = data.due_list.filter((i) => i.status === 'overdue').length
  const dueSoonCount = data.due_list.filter((i) => i.status === 'due-soon').length

  const visibleItems = tab === 'due' ? data.due_list : data.items

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
          <TabButton active={tab === 'due'} onClick={() => setTab('due')}>
            Due
            {data.due_list.length > 0 && (
              <span className="ml-1.5 inline-flex items-center bg-rose-500 text-white text-[10px] rounded-full px-1.5 py-0.5" style={{ fontWeight: 700 }}>
                {data.due_list.length}
              </span>
            )}
          </TabButton>
          <TabButton active={tab === 'all'} onClick={() => setTab('all')}>
            All ({data.items.length})
          </TabButton>
        </div>

        <div className="flex items-center gap-2 text-[11px]">
          {overdueCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-rose-200 bg-rose-50 text-rose-700" style={{ fontWeight: 600 }}>
              {overdueCount} overdue
            </span>
          )}
          {dueSoonCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700" style={{ fontWeight: 600 }}>
              {dueSoonCount} due soon
            </span>
          )}
          {canMutate && !creating && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-3 w-3 mr-1.5" />
              New item
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {creating && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
          >
            <ComplianceItemForm
              aircraftId={aircraftId}
              onCancel={() => setCreating(false)}
              onCreated={() => { setCreating(false); refresh() }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {visibleItems.length === 0 && tab === 'all' && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-white border border-border flex items-center justify-center mb-3">
            <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>
            No compliance items yet
          </h3>
          <p className="text-[12.5px] text-muted-foreground mt-1 max-w-md mx-auto">
            Add an inspection (Annual, 100hr) or component (ELT battery, transponder cert)
            to start tracking next-due dates.
          </p>
        </div>
      )}

      <ComplianceDueList items={visibleItems} userRole={userRole} onChange={refresh} />
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-[12.5px] transition-colors inline-flex items-center ${
        active ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
      }`}
      style={{ fontWeight: active ? 600 : 500 }}
    >
      {children}
    </button>
  )
}
