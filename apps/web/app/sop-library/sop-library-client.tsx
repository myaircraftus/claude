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

/**
 * Module → category mapping for color-coding the cards. New modules
 * fall through to 'system' (neutral slate). Keeps the visual taxonomy
 * stable as the library grows.
 */
const CATEGORY: Record<string, { label: string; tint: string; bar: string }> = {
  dashboard: { label: 'Operations', tint: 'text-sky-300', bar: 'bg-sky-500/60' },
  'aircraft-master': { label: 'Aircraft', tint: 'text-teal-300', bar: 'bg-teal-500/60' },
  squawks: { label: 'Operations', tint: 'text-sky-300', bar: 'bg-sky-500/60' },
  estimates: { label: 'Commercial', tint: 'text-emerald-300', bar: 'bg-emerald-500/60' },
  'work-orders': { label: 'Operations', tint: 'text-sky-300', bar: 'bg-sky-500/60' },
  invoicing: { label: 'Commercial', tint: 'text-emerald-300', bar: 'bg-emerald-500/60' },
  logbook: { label: 'Compliance', tint: 'text-amber-300', bar: 'bg-amber-500/60' },
  reports: { label: 'Insights', tint: 'text-fuchsia-300', bar: 'bg-fuchsia-500/60' },
  parts: { label: 'Inventory', tint: 'text-orange-300', bar: 'bg-orange-500/60' },
  workforce: { label: 'People', tint: 'text-violet-300', bar: 'bg-violet-500/60' },
  taxonomy: { label: 'Reference', tint: 'text-cyan-300', bar: 'bg-cyan-500/60' },
  'owner-portal': { label: 'Customer', tint: 'text-rose-300', bar: 'bg-rose-500/60' },
  platform: { label: 'Platform', tint: 'text-indigo-300', bar: 'bg-indigo-500/60' },
}

function categoryFor(module: string) {
  // Allow a couple of legacy aliases mapping to the canonical key.
  const key = module
  return CATEGORY[key] ?? { label: 'System', tint: 'text-slate-300', bar: 'bg-slate-600/60' }
}

/**
 * Client-side filter across title + module + FAA refs + excerpt. With
 * ~13 SOPs we don't need debouncing, Fuse.js, or virtualization — a
 * naive substring scan runs in microseconds.
 */
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
    <div className="px-8 py-8 max-w-7xl mx-auto">
      <SOPCommandPalette index={searchIndex} />

      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold text-white tracking-tight">SOP Library</h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Source of law for every workflow in the app.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/sop-library/compliance"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-200 hover:text-white bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-md px-3 py-2 transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            SOC2 Matrix
          </Link>
          <Link
            href="/sop-library/simulator"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-md px-3 py-2 transition-colors"
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
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          id="sop-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search SOPs by title, module, or FAA reference…"
          className="w-full bg-[#0f172a] border border-slate-800 rounded-lg pl-10 pr-16 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
          aria-label="Search SOPs"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wider text-slate-500 border border-slate-800 bg-slate-900 rounded px-1.5 py-0.5">
          ⌘K
        </kbd>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-[#0f172a] p-12 text-center">
          <BookOpen className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No SOPs matched &quot;{query}&quot;.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((sop) => (
            <SopCard key={sop.slug} sop={sop} />
          ))}
        </div>
      )}
    </div>
  )
}

function SopCard({ sop }: { sop: SopCardData }) {
  const cat = categoryFor(sop.module)
  return (
    <Link
      href={`/sop-library/${sop.slug}`}
      className="group relative block rounded-lg border border-slate-800 bg-[#0f172a] hover:bg-[#131c2e] hover:border-slate-700 transition-colors p-5 overflow-hidden"
    >
      {/* Category color bar along the top */}
      <div className={`absolute left-0 top-0 h-0.5 w-full ${cat.bar}`} aria-hidden />

      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold">
            § {String(sop.order).padStart(2, '0')}
          </div>
          <div className={`text-[9px] uppercase tracking-[0.15em] font-semibold ${cat.tint}`}>
            {cat.label}
          </div>
        </div>
        <StatusBadge status={sop.status} />
      </div>

      <h2 className="text-base font-semibold text-white mb-2 leading-snug">{sop.title}</h2>

      {sop.faaRefs.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {sop.faaRefs.map((ref) => (
            <span
              key={ref}
              className="text-[10px] font-medium text-slate-300 bg-slate-800/60 border border-slate-700/50 rounded px-1.5 py-0.5"
            >
              {ref}
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400 leading-relaxed line-clamp-3 mb-4">{sop.excerpt}</p>

      <div className="flex items-center justify-between text-[10px] text-slate-500">
        <span>
          v{sop.version} · {sop.lastUpdated}
        </span>
        <span className="inline-flex items-center gap-1 text-slate-300 group-hover:text-white transition-colors">
          View SOP
          <ArrowRight className="w-3 h-3" />
        </span>
      </div>
    </Link>
  )
}

function StatusBadge({ status }: { status: 'active' | 'draft' | 'deprecated' }) {
  const styles = {
    active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    draft: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    deprecated: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  }[status]
  return (
    <span className={`text-[9px] uppercase font-semibold tracking-wider rounded border px-1.5 py-0.5 ${styles}`}>
      {status}
    </span>
  )
}
