'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { FileText, Plus, Search, Plane } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const STATUS_COLOR: Record<string, string> = {
  draft:    'bg-slate-100 text-slate-600 border-slate-200',
  sent:     'bg-blue-50 text-blue-700 border-blue-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  expired:  'bg-amber-50 text-amber-700 border-amber-200',
}

interface EstimateItem {
  id: string
  estimate_number: string
  status: string
  total: number | null
  service_type: string | null
  valid_until: string | null
  created_at: string
  aircraft: { id: string; tail_number: string; make: string | null; model: string | null } | null
  customer: { id: string; name: string | null; company: string | null } | null
}

export function EstimatesListView({ estimates }: { estimates: EstimateItem[] }) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return estimates.filter((e) => {
      if (!needle) return true
      return (
        e.estimate_number.toLowerCase().includes(needle) ||
        (e.aircraft?.tail_number ?? '').toLowerCase().includes(needle) ||
        (e.customer?.name ?? '').toLowerCase().includes(needle)
      )
    })
  }, [estimates, q])

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <div className="px-6 py-4 border-b border-border bg-white flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-lg px-3 py-2 flex-1 max-w-md">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by estimate #, tail, or customer..."
            className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground/50"
          />
        </div>
        <Button disabled className="opacity-50">
          <Plus className="h-3.5 w-3.5 mr-1" />
          New Estimate
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <FileText className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No estimates yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create one from a work order or directly from an aircraft.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  {['Estimate #', 'Status', 'Aircraft', 'Customer', 'Total', 'Valid Until', 'Created'].map((h) => (
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
                    onClick={() => (window.location.href = `/estimates/${e.id}`)}
                  >
                    <td className="px-4 py-3">
                      <Link href={`/estimates/${e.id}`} className="text-[13px] text-primary tabular-nums" style={{ fontWeight: 700 }}>
                        {e.estimate_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded text-[10px] border',
                        STATUS_COLOR[e.status] ?? STATUS_COLOR.draft,
                      )} style={{ fontWeight: 600 }}>
                        {e.status.charAt(0).toUpperCase() + e.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {e.aircraft ? (
                        <span className="flex items-center gap-1 text-[13px] text-foreground">
                          <Plane className="h-3 w-3 text-muted-foreground" />
                          {e.aircraft.tail_number}
                        </span>
                      ) : (
                        <span className="text-[12px] text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[12px] text-foreground">{e.customer?.name ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-[13px] text-foreground tabular-nums" style={{ fontWeight: 600 }}>
                        ${Number(e.total ?? 0).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] text-muted-foreground">
                        {e.valid_until ? formatDate(e.valid_until) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] text-muted-foreground">{formatDate(e.created_at)}</span>
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
