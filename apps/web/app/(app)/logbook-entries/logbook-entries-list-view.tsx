'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { BookOpen, Plus, Search, Plane, CheckCircle2 } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const STATUS_COLOR: Record<string, string> = {
  draft:    'bg-amber-50 text-amber-700 border-amber-200',
  signed:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  void:     'bg-slate-100 text-slate-600 border-slate-200',
}

interface LogbookItem {
  id: string
  entry_type: string | null
  entry_date: string | null
  status: string
  signed_at: string | null
  created_at: string
  hobbs_in: number | null
  hobbs_out: number | null
  tach_time: number | null
  total_time: number | null
  description: string | null
  aircraft: { id: string; tail_number: string; make: string | null; model: string | null } | null
  work_order: { id: string; work_order_number: string } | null
}

export function LogbookEntriesListView({ entries }: { entries: LogbookItem[] }) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return entries.filter((e) => {
      if (!needle) return true
      return (
        (e.aircraft?.tail_number ?? '').toLowerCase().includes(needle) ||
        (e.entry_type ?? '').toLowerCase().includes(needle) ||
        (e.description ?? '').toLowerCase().includes(needle)
      )
    })
  }, [entries, q])

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <div className="px-6 py-4 border-b border-border bg-white flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-lg px-3 py-2 flex-1 max-w-md">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by tail, entry type, or description..."
            className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground/50"
          />
        </div>
        <Button disabled className="opacity-50">
          <Plus className="h-3.5 w-3.5 mr-1" />
          New Entry
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <BookOpen className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No logbook entries yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Generate one from a closed work order or write directly from an aircraft.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  {['Aircraft', 'Type', 'Date', 'Hobbs / Tach', 'Status', 'Linked WO', 'Description'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] text-muted-foreground uppercase tracking-wider whitespace-nowrap" style={{ fontWeight: 600 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((e) => (
                  <tr
                    key={e.id}
                    className="hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => (window.location.href = `/logbook-entries/${e.id}`)}
                  >
                    <td className="px-4 py-3">
                      <Link href={`/logbook-entries/${e.id}`} className="flex items-center gap-1 text-[13px] text-foreground" style={{ fontWeight: 600 }}>
                        <Plane className="h-3 w-3 text-muted-foreground" />
                        {e.aircraft?.tail_number ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[12px] text-foreground capitalize">
                        {(e.entry_type ?? '').replace(/_/g, ' ') || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[12px] text-muted-foreground">
                        {e.entry_date ? formatDate(e.entry_date) : formatDate(e.created_at)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {e.hobbs_in != null ? `H ${Number(e.hobbs_in).toFixed(1)}` : ''}
                        {e.hobbs_in != null && e.tach_time != null ? ' / ' : ''}
                        {e.tach_time != null ? `T ${Number(e.tach_time).toFixed(1)}` : ''}
                        {e.hobbs_in == null && e.tach_time == null ? '—' : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border',
                        STATUS_COLOR[e.status] ?? STATUS_COLOR.draft,
                      )} style={{ fontWeight: 600 }}>
                        {e.status === 'signed' && <CheckCircle2 className="h-2.5 w-2.5" />}
                        {e.status.charAt(0).toUpperCase() + e.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {e.work_order ? (
                        <Link
                          href={`/work-orders/${e.work_order.id}`}
                          onClick={(ev) => ev.stopPropagation()}
                          className="text-[12px] text-primary hover:underline tabular-nums"
                        >
                          {e.work_order.work_order_number}
                        </Link>
                      ) : (
                        <span className="text-[12px] text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[12px] text-muted-foreground line-clamp-1 max-w-[280px]">
                        {e.description ?? '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
