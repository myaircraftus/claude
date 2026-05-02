'use client'

/**
 * CompliancePage view (Spec 1.2) — whole-org compliance dashboard.
 *
 * Default view is the org-wide Due List (overdue + due-soon, sorted
 * closest-first). Aircraft picker on the right groups items by tail.
 *
 * To create new items, the user picks an aircraft → dropdown opens its
 * per-aircraft panel (linked at /aircraft/[id]/compliance). Keeping the
 * create flow on the per-aircraft page avoids a global dropdown that
 * can drift off-screen on small viewports.
 */

import { useEffect, useMemo, useState } from 'react'
import { Loader2, ClipboardCheck, Plane } from 'lucide-react'
import { ComplianceDueList } from './compliance-due-list'
import { getDueList } from '@/lib/compliance/compute'
import Link from '@/components/shared/tenant-link'
import type { ComplianceItem, OrgRole } from '@/types'

interface AircraftLite {
  id: string
  tail_number: string
}

export function CompliancePageView({ userRole }: { userRole: OrgRole }) {
  const [items, setItems] = useState<ComplianceItem[]>([])
  const [aircraft, setAircraft] = useState<AircraftLite[]>([])
  const [loading, setLoading] = useState(true)

  async function refresh() {
    try {
      const [itemsRes, aircraftRes] = await Promise.all([
        fetch('/api/compliance-items?limit=500', { cache: 'no-store' }),
        fetch('/api/aircraft', { cache: 'no-store' }),
      ])
      if (itemsRes.ok) {
        const p = await itemsRes.json()
        setItems((p.items ?? []) as ComplianceItem[])
      }
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

  const dueList = useMemo(() => getDueList(items), [items])
  const tailById = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of aircraft) m.set(a.id, a.tail_number)
    return m
  }, [aircraft])

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <div>
        <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
          Compliance
        </h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          Annual inspections, 100-hours, ADs, life-limited parts. Whichever-comes-first
          intervals are recomputed every time you log a meter reading.
        </p>
      </div>

      {/* Headline counts */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
        <Stat label="Due List" value={dueList.length} tint="bg-blue-50 text-blue-700 border-blue-200" />
        <Stat label="Overdue" value={items.filter((i) => i.status === 'overdue').length} tint="bg-rose-50 text-rose-700 border-rose-200" />
        <Stat label="Due Soon" value={items.filter((i) => i.status === 'due-soon').length} tint="bg-amber-50 text-amber-700 border-amber-200" />
        <Stat label="Tracked" value={items.length} tint="bg-emerald-50 text-emerald-700 border-emerald-200" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,260px] gap-5">
          {/* Due list */}
          <div>
            <h2 className="text-[12px] uppercase tracking-wider text-muted-foreground mb-2" style={{ fontWeight: 700 }}>
              Org-wide due list
            </h2>
            {dueList.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
                <div className="mx-auto w-10 h-10 rounded-2xl bg-white border border-border flex items-center justify-center mb-2">
                  <ClipboardCheck className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="text-[12.5px] text-muted-foreground">
                  Nothing overdue or due-soon. Nice.
                </p>
              </div>
            ) : (
              <ComplianceDueList
                items={dueList.map((it) => ({
                  ...it,
                  // Prefix the title with the tail number so the user knows which
                  // aircraft each row is for (showAircraft would only show UUIDs).
                  title: tailById.has(it.aircraft_id)
                    ? `${tailById.get(it.aircraft_id)} — ${it.title}`
                    : it.title,
                }))}
                userRole={userRole}
                onChange={refresh}
              />
            )}
          </div>

          {/* Aircraft list with per-tail link */}
          <aside className="space-y-2">
            <h2 className="text-[12px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
              By aircraft
            </h2>
            <ul className="bg-white rounded-2xl border border-border overflow-hidden divide-y divide-border">
              {aircraft.length === 0 ? (
                <li className="p-3 text-[12px] text-muted-foreground">No aircraft yet.</li>
              ) : aircraft.map((a) => {
                const tailItems = items.filter((i) => i.aircraft_id === a.id)
                const overdueN = tailItems.filter((i) => i.status === 'overdue').length
                const dueSoonN = tailItems.filter((i) => i.status === 'due-soon').length
                return (
                  <li key={a.id}>
                    <Link
                      href={`/aircraft/${a.id}/compliance`}
                      className="block px-3 py-2.5 hover:bg-muted/40"
                    >
                      <div className="flex items-center gap-2">
                        <Plane className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>
                          {a.tail_number || '(unnamed)'}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground flex items-center gap-2">
                        <span>{tailItems.length} tracked</span>
                        {overdueN > 0 && <span className="text-rose-600">· {overdueN} overdue</span>}
                        {dueSoonN > 0 && <span className="text-amber-600">· {dueSoonN} due soon</span>}
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
      <div className="text-[10px] uppercase tracking-wider" style={{ fontWeight: 700 }}>
        {label}
      </div>
      <div className="text-[24px] mt-0.5" style={{ fontWeight: 700 }}>
        {value}
      </div>
    </div>
  )
}
