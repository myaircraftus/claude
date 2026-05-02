'use client'

/**
 * SchedulerView — top-level client component for /scheduler.
 *
 * Three tabs:
 *   1. Shift Calendar  (default — month/week toggle)
 *   2. Your Shifts     (filtered to current user)
 *   3. Shift Covers    (open + claimed cover requests)
 *
 * Spec 2.5.1. Uses Feature 2.4 multi-view tokens (segmented control)
 * for the tab switcher.
 */

import { useState, useCallback, useEffect } from 'react'
import { Calendar, User as UserIcon, ArrowLeftRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ShiftCalendar } from './shift-calendar'
import { MyShiftsView } from './my-shifts-view'
import { ShiftCoversList } from './shift-covers-list'
import { ShiftForm } from './shift-form'
import type { Shift, ShiftCover } from '@/types'

type Tab = 'calendar' | 'mine' | 'covers'

export interface TechSummary {
  id: string
  full_name: string
  role: string
}

interface Props {
  techs: TechSummary[]
  currentUserId: string
  isAdmin: boolean
}

export function SchedulerView({ techs, currentUserId, isAdmin }: Props) {
  const [tab, setTab] = useState<Tab>('calendar')
  const [shifts, setShifts] = useState<Shift[]>([])
  const [covers, setCovers] = useState<ShiftCover[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingShift, setEditingShift] = useState<Shift | null>(null)

  const techNameById = new Map(techs.map((t) => [t.id, t.full_name]))

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      // Pull a wide window so the calendar can flip months without
      // re-fetching constantly: previous month + next 3 months.
      const start = new Date()
      start.setUTCDate(1)
      start.setUTCMonth(start.getUTCMonth() - 1)
      const end = new Date(start)
      end.setUTCMonth(end.getUTCMonth() + 4)

      const [shiftsRes, coversRes] = await Promise.all([
        fetch(`/api/shifts?from=${start.toISOString()}&to=${end.toISOString()}`),
        fetch('/api/shift-covers?status=open&status=claimed'),
      ])
      const shiftsJson = shiftsRes.ok ? await shiftsRes.json() : { shifts: [] }
      const coversJson = coversRes.ok ? await coversRes.json() : { covers: [] }
      setShifts((shiftsJson.shifts ?? []) as Shift[])
      setCovers((coversJson.covers ?? []) as ShiftCover[])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const handleCreated = () => {
    setShowForm(false)
    setEditingShift(null)
    void reload()
  }

  const TABS: Array<{ id: Tab; label: string; icon: any; count?: number }> = [
    { id: 'calendar', label: 'Shift Calendar', icon: Calendar },
    { id: 'mine',     label: 'Your Shifts',    icon: UserIcon,
      count: shifts.filter((s) => s.technician_id === currentUserId).length },
    { id: 'covers',   label: 'Shift Covers',   icon: ArrowLeftRight,
      count: covers.length },
  ]

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-white shrink-0 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Scheduler
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Plan shifts. See who's on. Cover when you can't make it.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => { setEditingShift(null); setShowForm(true) }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> New shift
          </Button>
        )}
      </div>

      {/* Tab strip */}
      <div className="px-6 pt-3 pb-0 border-b border-border bg-white shrink-0">
        <div className="inline-flex gap-1 bg-muted/40 rounded-lg p-1">
          {TABS.map((t) => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] transition-colors',
                  active ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
                style={{ fontWeight: active ? 600 : 500 }}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
                {typeof t.count === 'number' && t.count > 0 && (
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full',
                    active ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-600',
                  )} style={{ fontWeight: 700 }}>
                    {t.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="text-center py-20 text-[12px] text-muted-foreground">Loading…</div>
        ) : tab === 'calendar' ? (
          <ShiftCalendar
            shifts={shifts}
            techNameById={techNameById}
            onShiftClick={(s) => {
              if (!isAdmin) return
              setEditingShift(s)
              setShowForm(true)
            }}
          />
        ) : tab === 'mine' ? (
          <MyShiftsView
            shifts={shifts.filter((s) => s.technician_id === currentUserId)}
            currentUserId={currentUserId}
            onChanged={reload}
          />
        ) : (
          <ShiftCoversList
            covers={covers}
            shiftsById={new Map(shifts.map((s) => [s.id, s]))}
            techNameById={techNameById}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            onChanged={reload}
          />
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <ShiftForm
          techs={techs}
          shift={editingShift}
          onClose={() => { setShowForm(false); setEditingShift(null) }}
          onSaved={handleCreated}
        />
      )}
    </div>
  )
}
