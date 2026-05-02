'use client'

/**
 * AircraftContinuedItemsPanel (Spec 1.4) — embeddable per-aircraft view.
 *
 * Self-fetches /api/aircraft/[id]/continued. Active / resolved tabs;
 * mechanic+ can create + resolve inline.
 */

import { useCallback, useEffect, useState } from 'react'
import { Plus, Loader2, Bookmark } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from '@/components/ui/button'
import { ContinuedItemForm } from './continued-item-form'
import { ContinuedItemsList } from './continued-items-list'
import type { ContinuedItem, OrgRole } from '@/types'

const READ_ONLY_ROLES = new Set<OrgRole>(['viewer', 'auditor', 'pilot'])

interface PanelData {
  aircraft: { id: string; tail_number: string }
  active: ContinuedItem[]
  resolved: ContinuedItem[]
  all: ContinuedItem[]
}

export function AircraftContinuedItemsPanel({
  aircraftId,
  userRole,
}: {
  aircraftId: string
  userRole: OrgRole
}) {
  const canMutate = !READ_ONLY_ROLES.has(userRole)
  const [data, setData] = useState<PanelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'active' | 'resolved'>('active')
  const [creating, setCreating] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/continued`, { cache: 'no-store' })
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
        <p className="text-[12.5px] text-muted-foreground">Could not load continued items.</p>
      </div>
    )
  }

  const visible = tab === 'active' ? data.active : data.resolved

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
          <TabButton active={tab === 'active'} onClick={() => setTab('active')}>
            Active
            {data.active.length > 0 && (
              <span className="ml-1.5 inline-flex items-center bg-rose-500 text-white text-[10px] rounded-full px-1.5 py-0.5" style={{ fontWeight: 700 }}>
                {data.active.length}
              </span>
            )}
          </TabButton>
          <TabButton active={tab === 'resolved'} onClick={() => setTab('resolved')}>
            Resolved ({data.resolved.length})
          </TabButton>
        </div>

        {canMutate && !creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3 w-3 mr-1.5" />
            New continued item
          </Button>
        )}
      </div>

      <AnimatePresence>
        {creating && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
          >
            <ContinuedItemForm
              aircraftId={aircraftId}
              onCancel={() => setCreating(false)}
              onCreated={() => { setCreating(false); refresh() }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {visible.length === 0 && tab === 'active' ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-white border border-border flex items-center justify-center mb-3">
            <Bookmark className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>
            No deferred items
          </h3>
          <p className="text-[12.5px] text-muted-foreground mt-1 max-w-md mx-auto">
            Items found during a work order but deferred (parts on order, scheduling, etc.)
            land here so they follow the aircraft instead of vanishing into a closed WO.
          </p>
        </div>
      ) : (
        <ContinuedItemsList
          items={visible}
          userRole={userRole}
          onChange={refresh}
        />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
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
