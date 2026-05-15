'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, BookOpen, ArrowRight } from 'lucide-react'

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
}

/**
 * Client-side filter across title + FAA refs + excerpt. Cheap enough
 * for 9 records that we don't need debouncing or virtualization.
 */
export function SopLibraryClient({ sops }: Props) {
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
      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-white tracking-tight">SOP Library</h1>
        <p className="mt-1.5 text-sm text-slate-400">
          Source of law for every workflow in the app.
        </p>
      </header>

      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search SOPs by title, module, or FAA reference…"
          className="w-full bg-[#0f172a] border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
          aria-label="Search SOPs"
        />
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
  return (
    <Link
      href={`/sop-library/${sop.slug}`}
      className="group block rounded-lg border border-slate-800 bg-[#0f172a] hover:bg-[#131c2e] hover:border-slate-700 transition-colors p-5"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold">
          § {String(sop.order).padStart(2, '0')}
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
