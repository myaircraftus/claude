'use client'

/**
 * ToolsView — list / filter / register tools (Spec 2.6.1).
 *
 *   Tabs: All · Calibration due (next 30/60/90) · Overdue · Checked out
 *   New tool button opens ToolForm.
 *   Click a row → /tools/[id] for full detail + cal log + checkout.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Wrench, Plus, AlertTriangle, Search, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ToolForm } from './tool-form'
import type { Tool, ToolStatus } from '@/types'

type Tab = 'all' | 'due-30' | 'due-60' | 'overdue' | 'checked-out'

const STATUS_TONE: Record<ToolStatus, string> = {
  'in-use': 'bg-blue-50 text-blue-700 border-blue-200',
  'available': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'out-for-calibration': 'bg-amber-50 text-amber-700 border-amber-200',
  'out-of-service': 'bg-red-50 text-red-700 border-red-200',
  'lost': 'bg-slate-200 text-slate-700 border-slate-300',
  'retired': 'bg-slate-100 text-slate-500 border-slate-200',
}

export function ToolsView() {
  const [tab, setTab] = useState<Tab>('all')
  const [tools, setTools] = useState<Tool[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [searchQ, setSearchQ] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (tab === 'due-30') params.set('due_in_days', '30')
      else if (tab === 'due-60') params.set('due_in_days', '60')
      else if (tab === 'overdue') params.set('overdue', '1')
      else if (tab === 'checked-out') params.set('checked_out', '1')

      const res = await fetch(`/api/tools?${params.toString()}`)
      if (!res.ok) return
      const data = await res.json()
      setTools((data.tools ?? []) as Tool[])
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => { void reload() }, [reload])

  const filtered = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    if (!q) return tools
    return tools.filter((t) =>
      t.name.toLowerCase().includes(q) ||
      t.serial_number.toLowerCase().includes(q) ||
      (t.manufacturer ?? '').toLowerCase().includes(q) ||
      (t.model ?? '').toLowerCase().includes(q),
    )
  }, [tools, searchQ])

  const today = new Date().toISOString().slice(0, 10)
  const overdueCount = tools.filter((t) => t.calibration_required && t.next_calibration_date && t.next_calibration_date < today).length

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: 'all',         label: 'All' },
    { id: 'due-30',      label: 'Due in 30 days' },
    { id: 'due-60',      label: 'Due in 60 days' },
    { id: 'overdue',     label: 'Overdue' },
    { id: 'checked-out', label: 'Checked out' },
  ]

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-6 py-4 border-b border-border bg-white shrink-0 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>Tools</h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Calibration cycle tracking. Overdue tools block new WO uses.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New tool
        </Button>
      </div>

      <div className="px-6 pt-3 pb-3 border-b border-border bg-white shrink-0 flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex gap-1 bg-muted/40 rounded-lg p-1">
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cn('px-3 py-1.5 rounded-md text-[12px] transition-colors',
                  active ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                style={{ fontWeight: active ? 600 : 500 }}
              >
                {t.label}
                {t.id === 'overdue' && overdueCount > 0 && (
                  <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700" style={{ fontWeight: 700 }}>{overdueCount}</span>
                )}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-lg px-3 py-1.5 max-w-md flex-1">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Name, serial, manufacturer..." aria-label="Search tools"
            className="bg-transparent text-[12px] outline-none flex-1 placeholder:text-muted-foreground/50" />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="text-center py-20 text-[12px] text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <Wrench className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No tools{tab !== 'all' ? ' in this view' : ' yet'}</p>
            <p className="text-xs text-muted-foreground mt-1">Click "New tool" to register one.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-border overflow-hidden max-w-6xl mx-auto m-6">
            <table className="w-full text-[12.5px]">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  {['Tool', 'Serial', 'Status', 'Category', 'Last cal.', 'Next due'].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((t) => {
                  const overdue = !!(t.calibration_required && t.next_calibration_date && t.next_calibration_date < today)
                  return (
                    <tr key={t.id} className={cn('hover:bg-muted/20', overdue && 'bg-red-50/30')}>
                      <td className="px-3 py-2">
                        <Link href={`/tools/${t.id}`} className="text-foreground hover:underline" style={{ fontWeight: 600 }}>
                          {t.name}
                        </Link>
                        {t.manufacturer && <div className="text-[11px] text-muted-foreground">{t.manufacturer}{t.model ? ` ${t.model}` : ''}</div>}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11.5px] text-muted-foreground">{t.serial_number}</td>
                      <td className="px-3 py-2">
                        <span className={cn('inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border', STATUS_TONE[t.status])} style={{ fontWeight: 700 }}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground capitalize">{t.category.replace('-', ' ')}</td>
                      <td className="px-3 py-2 text-muted-foreground tabular-nums">{t.last_calibration_date ?? '—'}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {t.calibration_required && t.next_calibration_date ? (
                          <span className={overdue ? 'text-red-700 inline-flex items-center gap-1' : 'text-foreground'} style={{ fontWeight: overdue ? 700 : 500 }}>
                            {overdue && <AlertTriangle className="h-3 w-3" />}
                            {t.next_calibration_date}
                          </span>
                        ) : !t.calibration_required ? (
                          <span className="text-muted-foreground/60 italic">no cal</span>
                        ) : (
                          <span className="text-muted-foreground inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> never
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <ToolForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); void reload() }} />
      )}
    </div>
  )
}
