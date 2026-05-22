'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, BookOpen, ArrowRight, Sparkles, ShieldCheck } from 'lucide-react'
import { SOPAIQueryBar } from '@/components/sop/SOPAIQueryBar'
import { SOPCommandPalette } from '@/components/sop/SOPCommandPalette'
import type { SopSearchIndex } from '@/lib/sop/search'

export interface SopCardData {
  slug: string
  title: string
  module: string
  order: number
  faaRefs: string[]
  version: string
  lastUpdated: string
  status: 'active' | 'draft' | 'deprecated'
  excerpt: string
}

interface Props {
  sops: SopCardData[]
  searchIndex: SopSearchIndex
}

/** Module → category mapping for color-coding the cards. */
const CATEGORY: Record<string, { label: string; tint: string; bar: string }> = {
  conventions: { label: 'Reference', tint: 'text-slate-700 bg-slate-100', bar: 'bg-slate-400' },
  dashboard: { label: 'Operations', tint: 'text-sky-700 bg-sky-50', bar: 'bg-sky-400' },
  'aircraft-master': { label: 'Aircraft', tint: 'text-teal-700 bg-teal-50', bar: 'bg-teal-400' },
  squawks: { label: 'Operations', tint: 'text-sky-700 bg-sky-50', bar: 'bg-sky-400' },
  estimates: { label: 'Commercial', tint: 'text-emerald-700 bg-emerald-50', bar: 'bg-emerald-400' },
  'work-orders': { label: 'Operations', tint: 'text-sky-700 bg-sky-50', bar: 'bg-sky-400' },
  invoicing: { label: 'Commercial', tint: 'text-emerald-700 bg-emerald-50', bar: 'bg-emerald-400' },
  logbook: { label: 'Compliance', tint: 'text-amber-700 bg-amber-50', bar: 'bg-amber-400' },
  reports: { label: 'Insights', tint: 'text-fuchsia-700 bg-fuchsia-50', bar: 'bg-fuchsia-400' },
  parts: { label: 'Inventory', tint: 'text-orange-700 bg-orange-50', bar: 'bg-orange-400' },
  workforce: { label: 'People', tint: 'text-violet-700 bg-violet-50', bar: 'bg-violet-400' },
  taxonomy: { label: 'Reference', tint: 'text-cyan-700 bg-cyan-50', bar: 'bg-cyan-400' },
  'owner-portal': { label: 'Customer', tint: 'text-rose-700 bg-rose-50', bar: 'bg-rose-400' },
  platform: { label: 'Platform', tint: 'text-indigo-700 bg-indigo-50', bar: 'bg-indigo-400' },
  'document-persona': { label: 'Security', tint: 'text-red-700 bg-red-50', bar: 'bg-red-400' },
  marketplace: { label: 'Commercial', tint: 'text-emerald-700 bg-emerald-50', bar: 'bg-emerald-400' },
}

function categoryFor(module: string) {
  return CATEGORY[module] ?? { label: 'System', tint: 'text-slate-700 bg-slate-100', bar: 'bg-slate-300' }
}

export function SopLibraryClient({ sops, searchIndex }: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sops
    return sops.filter((s) => {
      const hay = [s.title, s.module, ...s.faaRefs, s.excerpt].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [query, sops])

  return (
    <div className="bg-white min-h-screen text-slate-900">
      <SOPCommandPalette index={searchIndex} />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">SOP Library</h1>
            <p className="mt-1.5 text-sm text-slate-600">
              Source of law for every workflow in the app.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/sop-library/compliance"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md px-3 py-2 transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              SOC2 Matrix
            </Link>
            <Link
              href="/sop-library/simulator"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-md px-3 py-2 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Open AI Simulator
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </header>

        {/* AI Query Bar — natural-language Q&A across the whole library */}
        <SOPAIQueryBar />

        <div className="mb-6 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            id="sop-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter SOPs by title, module, or FAA reference… (or press ⌘K for global search)"
            className="w-full bg-white border border-slate-300 rounded-lg pl-10 pr-16 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            aria-label="Search SOPs"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wider text-slate-500 border border-slate-300 bg-slate-50 rounded px-1.5 py-0.5">
            ⌘K
          </kbd>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-12 text-center">
            <BookOpen className="w-10 h-10 text-slate-400 mx-auto mb-3" />
            <p className="text-sm text-slate-600">No SOPs matched &quot;{query}&quot;.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((sop) => (
              <SopCard key={sop.slug} sop={sop} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SopCard({ sop }: { sop: SopCardData }) {
  const cat = categoryFor(sop.module)
  return (
    <Link
      href={`/sop-library/${sop.slug}`}
      className="group relative block rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm transition-all p-5 overflow-hidden"
    >
      <div className={`absolute left-0 top-0 h-1 w-full ${cat.bar}`} aria-hidden />

      <div className="flex items-start justify-between mb-3 mt-1">
        <div className="flex items-center gap-2">
          <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold">
            § {String(sop.order).padStart(2, '0')}
          </div>
          <div className={`text-[9px] uppercase tracking-[0.15em] font-semibold rounded px-1.5 py-0.5 ${cat.tint}`}>
            {cat.label}
          </div>
        </div>
        <StatusBadge status={sop.status} />
      </div>

      <h2 className="text-base font-semibold text-slate-900 mb-2 leading-snug">{sop.title}</h2>

      {sop.faaRefs.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {sop.faaRefs.map((ref) => (
            <span
              key={ref}
              className="text-[10px] font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5"
            >
              {ref}
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-600 leading-relaxed line-clamp-3 mb-4">{sop.excerpt}</p>

      <div className="flex items-center justify-between text-[10px] text-slate-500">
        <span>
          v{sop.version} · {sop.lastUpdated}
        </span>
        <span className="inline-flex items-center gap-1 text-slate-700 group-hover:text-violet-700 transition-colors font-medium">
          View SOP
          <ArrowRight className="w-3 h-3" />
        </span>
      </div>
    </Link>
  )
}

function StatusBadge({ status }: { status: 'active' | 'draft' | 'deprecated' }) {
  const styles = {
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    draft: 'bg-amber-50 text-amber-700 border-amber-200',
    deprecated: 'bg-rose-50 text-rose-700 border-rose-200',
  }[status]
  return (
    <span className={`text-[9px] uppercase font-semibold tracking-wider rounded border px-1.5 py-0.5 ${styles}`}>
      {status}
    </span>
  )
}
