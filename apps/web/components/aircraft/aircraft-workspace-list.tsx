'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from '@/components/shared/tenant-link'
import { AircraftSilhouette } from '@/components/aircraft/aircraft-silhouette'
import {
  formatHours,
  formatWorkspaceStatus,
  inferSilhouetteStyle,
  type AircraftSilhouetteStyle,
} from '@/lib/aircraft/workspace'
import {
  AlertTriangle,
  Clock3,
  Filter,
  Gauge,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface AircraftListItem {
  id: string
  tail_number: string
  make?: string | null
  model?: string | null
  year?: number | null
  serial_number?: string | null
  base_airport?: string | null
  home_base?: string | null
  operator_name?: string | null
  operation_type?: string | null
  operation_types?: string[] | null
  aircraft_workspace_status?: string | null
  aircraft_category?: string | null
  aircraft_class?: string | null
  taxonomy_aircraft_kind?: string | null
  taxonomy_engine_type?: string | null
  taxonomy_engine_count?: number | null
  engine_type?: string | null
  engine_count?: number | null
  silhouette_style?: AircraftSilhouetteStyle | string | null
  primary_photo_url?: string | null
  total_time_hours?: number | null
  document_count?: number | null
  time_snapshot?: {
    verified_tach?: number | null
    verified_hobbs?: number | null
    verified_total_time?: number | null
    estimated_tach?: number | null
    estimated_hobbs?: number | null
  } | null
  risk_counts?: {
    due?: number
    active_work_orders?: number
    open_squawks?: number
    unpaid_invoices?: number
    high_risk?: number
  }
}

const statusOptions = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'in_maintenance', label: 'In Maintenance' },
  { value: 'grounded', label: 'Grounded' },
  { value: 'needs_review', label: 'Needs Review' },
]

function riskChip(label: string, value: number | undefined, tone: 'red' | 'amber' | 'blue' | 'slate') {
  if (!value) return null
  const tones = {
    red: 'border-red-200 bg-red-50 text-red-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>
      {value} {label}
    </span>
  )
}

export function AircraftWorkspaceList() {
  const [aircraft, setAircraft] = useState<AircraftListItem[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadAircraft() {
      try {
        setLoading(true)
        const res = await fetch('/api/aircraft', { cache: 'no-store' })
        const payload = await res.json().catch(() => null)
        if (!res.ok) throw new Error(payload?.error ?? 'Unable to load aircraft')
        if (!cancelled) setAircraft(Array.isArray(payload) ? payload : [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load aircraft')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadAircraft()
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return aircraft.filter((item) => {
      const workspaceStatus = item.aircraft_workspace_status ?? 'active'
      if (status !== 'all' && workspaceStatus !== status) return false
      if (!query) return true
      return [
        item.tail_number,
        item.make,
        item.model,
        item.serial_number,
        item.operator_name,
        item.base_airport,
        item.home_base,
        workspaceStatus,
      ].filter(Boolean).join(' ').toLowerCase().includes(query)
    })
  }, [aircraft, search, status])

  const stats = useMemo(() => {
    return {
      total: aircraft.length,
      active: aircraft.filter((item) => (item.aircraft_workspace_status ?? 'active') === 'active').length,
      maintenance: aircraft.filter((item) => item.aircraft_workspace_status === 'in_maintenance').length,
      review: aircraft.filter((item) => item.aircraft_workspace_status === 'needs_review').length,
      risk: aircraft.reduce((sum, item) => sum + (item.risk_counts?.high_risk ?? 0), 0),
    }
  }, [aircraft])

  const statCards: Array<{ label: string; value: number; icon: LucideIcon }> = [
    { label: 'Fleet', value: stats.total, icon: ShieldCheck },
    { label: 'Active', value: stats.active, icon: Gauge },
    { label: 'In maintenance', value: stats.maintenance, icon: Wrench },
    { label: 'Needs review', value: stats.review, icon: AlertTriangle },
    { label: 'Open risk', value: stats.risk, icon: Clock3 },
  ]

  return (
    <main className="mx-auto w-full max-w-[1380px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">Aircraft</h1>
          <p className="mt-1 text-sm text-slate-600">
            Fleet list with generated silhouettes, verified time, risk, and aircraft-scoped navigation.
          </p>
        </div>
        <Link
          href="/aircraft/new"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-800"
        >
          <Plus className="h-4 w-4" />
          Add Aircraft
        </Link>
      </div>

      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {statCards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>{label}</span>
              <Icon className="h-4 w-4" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-950">{value}</div>
          </div>
        ))}
      </section>

      <section className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 md:flex-row">
        <label className="flex min-h-10 flex-1 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tail, make, model, serial, owner, base..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </label>
        <label className="flex min-h-10 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 md:w-64">
          <Filter className="h-4 w-4 text-slate-500" />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </section>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Loading aircraft...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="text-base font-semibold text-slate-900">No aircraft found</div>
          <p className="mt-1 text-sm text-slate-500">Add an aircraft or adjust the search/filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const style = (item.silhouette_style === 'unknown' || !item.silhouette_style)
              ? inferSilhouetteStyle(item)
              : item.silhouette_style
            const snapshot = item.time_snapshot
            const verifiedTach = snapshot?.verified_tach ?? null
            const verifiedHobbs = snapshot?.verified_hobbs ?? null
            const verifiedTotal = snapshot?.verified_total_time ?? item.total_time_hours ?? null
            const statusLabel = formatWorkspaceStatus(item.aircraft_workspace_status)

            return (
              <Link
                key={item.id}
                href={`/aircraft/${item.id}`}
                className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 transition hover:border-blue-200 hover:shadow-sm lg:grid-cols-[220px_1fr_auto]"
              >
                {item.primary_photo_url ? (
                  <Image
                    src={item.primary_photo_url}
                    alt={`${item.tail_number} aircraft`}
                    width={440}
                    height={256}
                    unoptimized
                    className="h-36 w-full rounded-lg object-cover lg:h-32"
                  />
                ) : (
                  <AircraftSilhouette
                    tailNumber={item.tail_number}
                    style={style}
                    className="h-36 w-full lg:h-32"
                  />
                )}

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-mono text-xl font-bold tracking-tight text-blue-700">{item.tail_number}</h2>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      {statusLabel}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {[item.year, item.make, item.model].filter(Boolean).join(' ') || 'Aircraft details need review'}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                    <span>S/N {item.serial_number || 'Needs review'}</span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {item.home_base || item.base_airport || 'Base not set'}
                    </span>
                    <span>{item.operator_name || 'No operator set'}</span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="text-xs font-semibold uppercase text-slate-500">Verified Tach</div>
                      <div className="mt-1 text-base font-bold text-slate-950">{formatHours(verifiedTach)}</div>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="text-xs font-semibold uppercase text-slate-500">Verified Hobbs</div>
                      <div className="mt-1 text-base font-bold text-slate-950">{formatHours(verifiedHobbs)}</div>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="text-xs font-semibold uppercase text-slate-500">Total Time</div>
                      <div className="mt-1 text-base font-bold text-slate-950">{formatHours(verifiedTotal)}</div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-row flex-wrap gap-2 lg:w-48 lg:flex-col lg:items-end">
                  {riskChip('due', item.risk_counts?.due, 'amber')}
                  {riskChip('open WO', item.risk_counts?.active_work_orders, 'blue')}
                  {riskChip('squawk', item.risk_counts?.open_squawks, 'red')}
                  {riskChip('invoice', item.risk_counts?.unpaid_invoices, 'slate')}
                  <span className="mt-auto text-xs font-medium text-slate-500">
                    {item.document_count ?? 0} documents
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}
