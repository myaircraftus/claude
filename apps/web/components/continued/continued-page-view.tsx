'use client'

/**
 * ContinuedItemsPage view (Spec 1.4) — whole-org continued-items dashboard.
 *
 * Default view is the org-wide active list (open + in-progress). Aircraft
 * sidebar groups counts per tail. Mechanic+ can create new items inline
 * with an aircraft picker.
 */

import { useEffect, useMemo, useState } from 'react'
import { Plus, Loader2, Bookmark, Plane } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import Link from '@/components/shared/tenant-link'
import { Button } from '@/components/ui/button'
import { ContinuedItemForm } from './continued-item-form'
import { ContinuedItemsList } from './continued-items-list'
import type { ContinuedItem, OrgRole } from '@/types'

interface AircraftLite { id: string; tail_number: string }

const READ_ONLY_ROLES = new Set<OrgRole>(['viewer', 'auditor', 'pilot'])

export function ContinuedItemsPageView({ userRole }: { userRole: OrgRole }) {
  const canMutate = !READ_ONLY_ROLES.has(userRole)
  const [active, setActive] = useState<ContinuedItem[]>([])
  const [resolved, setResolved] = useState<ContinuedItem[]>([])
  const [aircraft, setAircraft] = useState<AircraftLite[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [tab, setTab] = useState<'active' | 'resolved'>('active')

  async function refresh() {
    try {
      const [activeRes, resolvedRes, aircraftRes] = await Promise.all([
        fetch('/api/continued-items?status=open,in-progress&limit=300', { cache: 'no-store' }),
        fetch('/api/continued-items?status=completed,wont-fix&limit=300', { cache: 'no-store' }),
        fetch('/api/aircraft', { cache: 'no-store' }),
      ])
      if (activeRes.ok) setActive(((await activeRes.json()).items ?? []) as ContinuedItem[])
      if (resolvedRes.ok) setResolved(((await resolvedRes.json()).items ?? []) as ContinuedItem[])
      if (aircraftRes.ok) {
        const p = await aircraftRes.json()
        const rows = Array.isArray(p?.aircraft) ? p.aircraft : Array.isArray(p) ? p : []
        setAircraft(rows.map((a: any) => ({ id: String(a.id), tail_number: String(a.tail_number ?? '') })))
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const tailById = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of aircraft) m.set(a.id, a.tail_number)
    return m
  }, [aircraft])

  const urgentCount = active.filter((i) => i.priority === 'urgent').length
  const highCount = active.filter((i) => i.priority === 'high').length

  const visible = tab === 'active' ? active : resolved

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Continued Items
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Found-but-deferred maintenance that follows the aircraft, not the work order.
            Pull these into a future WO when scheduling allows.
          </p>
        </div>
        {canMutate && !creating && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New item
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
              aircraftOptions={aircraft}
              onCancel={() => setCreating(false)}
              onCreated={() => { setCreating(false); refresh() }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stat tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
        <Stat label="Active" value={active.length} tint="bg-blue-50 text-blue-700 border-blue-200" />
        <Stat label="Urgent" value={urgentCount} tint="bg-rose-50 text-rose-700 border-rose-200" />
        <Stat label="High" value={highCount} tint="bg-amber-50 text-amber-700 border-amber-200" />
        <Stat label="Resolved" value={resolved.length} tint="bg-emerald-50 text-emerald-700 border-emerald-200" />
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 w-fit">
        <TabButton active={tab === 'active'} onClick={() => setTab('active')}>
          Active ({active.length})
        </TabButton>
        <TabButton active={tab === 'resolved'} onClick={() => setTab('resolved')}>
          Resolved ({resolved.length})
        </TabButton>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,260px] gap-5">
          {/* Items list */}
          <div>
            {visible.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center">
                <div className="mx-auto w-12 h-12 rounded-2xl bg-white border border-border flex items-center justify-center mb-3">
                  <Bookmark className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-[12.5px] text-muted-foreground">
                  {tab === 'active' ? 'Nothing deferred. Clean fleet.' : 'No resolved items yet.'}
                </p>
              </div>
            ) : (
              <ContinuedItemsList
                items={visible}
                showAircraft
                tailById={tailById}
                userRole={userRole}
                onChange={refresh}
              />
            )}
          </div>

          {/* Aircraft sidebar */}
          <aside className="space-y-2">
            <h2 className="text-[12px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
              By aircraft
            </h2>
            <ul className="bg-white rounded-2xl border border-border overflow-hidden divide-y divide-border">
              {aircraft.length === 0 ? (
                <li className="p-3 text-[12px] text-muted-foreground">No aircraft yet.</li>
              ) : aircraft.map((a) => {
                const tailActive = active.filter((i) => i.aircraft_id === a.id)
                const urgentN = tailActive.filter((i) => i.priority === 'urgent').length
                const highN = tailActive.filter((i) => i.priority === 'high').length
                return (
                  <li key={a.id}>
                    <Link href={`/aircraft/${a.id}/continued`} className="block px-3 py-2.5 hover:bg-muted/40">
                      <div className="flex items-center gap-2">
                        <Plane className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>
                          {a.tail_number || '(unnamed)'}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground flex items-center gap-2">
                        <span>{tailActive.length} active</span>
                        {urgentN > 0 && <span className="text-rose-600">· {urgentN} urgent</span>}
                        {highN > 0 && <span className="text-amber-600">· {highN} high</span>}
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </aside>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, tint }: { label: string; value: number; tint: string }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${tint}`}>
      <div className="text-[10px] uppercase tracking-wider" style={{ fontWeight: 700 }}>{label}</div>
      <div className="text-[24px] mt-0.5" style={{ fontWeight: 700 }}>{value}</div>
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
      className={`px-3 py-1.5 rounded-md text-[12.5px] transition-colors ${
        active ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
      }`}
      style={{ fontWeight: active ? 600 : 500 }}
    >
      {children}
    </button>
  )
}
