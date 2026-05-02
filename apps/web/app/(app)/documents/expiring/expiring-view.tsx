'use client'

/**
 * ExpiringDocsView (Spec 2.6.2)
 *
 *   Tabs: All · Owner · Mechanic · Shop  — persona filter
 *   Look-ahead select (30 / 60 / 90 / 180 days)
 *   Status pills: green | amber | red
 *   "Track expiring document" button → ExpiringDocForm (metadata-only).
 *
 *   For acceptance clause "edit the expiration → reminders re-enqueue
 *   idempotently", clicking a row opens the same form pre-filled, and
 *   PATCH /api/documents/[id]/expiration replaces the reminder set.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarClock, Plus, Search, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ExpiringDocForm } from './expiring-doc-form'
import type { Document, ExpirationPersona, ExpirationStatus } from '@/types'

type Tab = 'all' | ExpirationPersona

const STATUS_TONE: Record<ExpirationStatus, string> = {
  current: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'expiring-soon': 'bg-amber-50 text-amber-700 border-amber-200',
  expired: 'bg-red-50 text-red-700 border-red-200',
}

const STATUS_LABEL: Record<ExpirationStatus, string> = {
  current: 'Current',
  'expiring-soon': 'Expiring soon',
  expired: 'Expired',
}

export function ExpiringDocsView({ aircraftId }: { aircraftId?: string | null } = {}) {
  const [tab, setTab] = useState<Tab>('all')
  const [lookAhead, setLookAhead] = useState<number>(60)
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchQ, setSearchQ] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (tab !== 'all') params.set('persona', tab)
      params.set('lookAhead', String(lookAhead))
      if (aircraftId) params.set('aircraft_id', aircraftId)
      const res = await fetch(`/api/documents/expiring?${params.toString()}`)
      if (!res.ok) return
      const data = await res.json()
      setDocs((data.documents ?? []) as Document[])
    } finally {
      setLoading(false)
    }
  }, [tab, lookAhead, aircraftId])

  useEffect(() => { void reload() }, [reload])

  const filtered = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    if (!q) return docs
    return docs.filter((d) =>
      (d.title ?? '').toLowerCase().includes(q) ||
      (d.expiration_category ?? '').toLowerCase().includes(q) ||
      (d.issued_by ?? '').toLowerCase().includes(q) ||
      (d.document_number ?? '').toLowerCase().includes(q),
    )
  }, [docs, searchQ])

  const expiredCount = docs.filter((d) => d.expiration_status === 'expired').length
  const expiringCount = docs.filter((d) => d.expiration_status === 'expiring-soon').length

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: 'all',      label: 'All' },
    { id: 'owner',    label: 'Owner' },
    { id: 'mechanic', label: 'Mechanic' },
    { id: 'shop',     label: 'Shop' },
  ]

  const editingDoc = editingId ? docs.find((d) => d.id === editingId) ?? null : null

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-6 py-4 border-b border-border bg-white shrink-0 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Expiring documents
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Registration, certificates, insurance — anything with an expiration. Reminders fan out to the org.
          </p>
        </div>
        <Button onClick={() => { setEditingId(null); setShowForm(true) }}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Track expiring document
        </Button>
      </div>

      <div className="px-6 pt-3 pb-3 border-b border-border bg-white shrink-0 flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex gap-1 bg-muted/40 rounded-lg p-1">
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-[12px] transition-colors',
                  active ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
                style={{ fontWeight: active ? 600 : 500 }}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[11px] text-muted-foreground">Window</label>
          <select
            value={lookAhead}
            onChange={(e) => setLookAhead(parseInt(e.target.value, 10) || 60)}
            className="text-[12px] border border-border rounded-md px-2 py-1 bg-white"
          >
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
            <option value={180}>180 days</option>
            <option value={365}>1 year</option>
          </select>
        </div>

        <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-lg px-3 py-1.5 max-w-md flex-1">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Title, category, issuer…"
            className="bg-transparent text-[12px] outline-none flex-1 placeholder:text-muted-foreground/50"
          />
        </div>

        <div className="flex items-center gap-2 text-[11px]">
          {expiredCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200" style={{ fontWeight: 700 }}>
              <AlertTriangle className="h-3 w-3" />
              {expiredCount} expired
            </span>
          )}
          {expiringCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200" style={{ fontWeight: 700 }}>
              {expiringCount} expiring
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="text-center py-20 text-[12px] text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <CalendarClock className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">
              No {tab !== 'all' ? `${tab} ` : ''}documents expiring in the next {lookAhead} days
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Click "Track expiring document" to add a registration, certificate, or insurance policy.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-border overflow-hidden max-w-6xl mx-auto m-6">
            <table className="w-full text-[12.5px]">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  {['Title', 'Category', 'Persona', 'Expires', 'Status'].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((d) => {
                  const status = (d.expiration_status ?? 'current') as ExpirationStatus
                  return (
                    <tr key={d.id} className={cn('hover:bg-muted/20', status === 'expired' && 'bg-red-50/30')}>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => { setEditingId(d.id); setShowForm(true) }}
                          className="text-foreground hover:underline text-left"
                          style={{ fontWeight: 600 }}
                        >
                          {d.title ?? '(untitled)'}
                        </button>
                        {d.document_number && (
                          <div className="text-[11px] text-muted-foreground font-mono">#{d.document_number}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {d.expiration_category ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground capitalize">
                        {d.target_persona ?? '—'}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{d.expiration_date ?? '—'}</td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            'inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border',
                            STATUS_TONE[status]
                          )}
                          style={{ fontWeight: 700 }}
                        >
                          {STATUS_LABEL[status]}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="px-3 py-2 bg-muted/20 border-t border-border text-[11px] text-muted-foreground flex items-center justify-between">
              <span>Showing {filtered.length} document{filtered.length === 1 ? '' : 's'}</span>
              <Link href="/documents" className="hover:underline">All documents →</Link>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <ExpiringDocForm
          doc={editingDoc}
          presetAircraftId={aircraftId ?? null}
          onClose={() => { setShowForm(false); setEditingId(null) }}
          onSaved={() => { setShowForm(false); setEditingId(null); void reload() }}
        />
      )}
    </div>
  )
}
