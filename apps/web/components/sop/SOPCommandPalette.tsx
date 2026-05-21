'use client'

/**
 * Cmd+K command palette for the SOP library.
 *
 * Opens via ⌘K / Ctrl+K from anywhere on a /sop-library/* page. Shows a
 * fuzzy-matched list of section results across the entire SOP corpus —
 * each result deep-links to the section anchor.
 *
 * The search index is built server-side and handed to the client as a
 * single JSON blob (see lib/sop/search.ts). With ~15 SOPs the payload
 * is ~80 KB and search latency on each keystroke is <50 ms.
 *
 * White theme — matches the rest of the SOP surfaces.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, ArrowRight, Sparkles } from 'lucide-react'
import {
  searchSopIndex,
  type SopSearchEntry,
  type SopSearchIndex,
} from '@/lib/sop/search'

interface Props {
  index: SopSearchIndex
}

export function SOPCommandPalette({ index }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Global ⌘K / Ctrl+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (open) {
      setQuery('')
      setHighlight(0)
      // Focus next tick so the input is mounted
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  const results = useMemo<SopSearchEntry[]>(() => {
    if (!query.trim()) return []
    return searchSopIndex(index, query)
  }, [index, query])

  const navigate = useCallback(
    (entry: SopSearchEntry) => {
      const path = entry.anchor
        ? `/sop-library/${entry.sopSlug}#${entry.anchor}`
        : `/sop-library/${entry.sopSlug}`
      setOpen(false)
      router.push(path)
    },
    [router],
  )

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="SOP search"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setHighlight(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setHighlight((h) => Math.min(h + 1, Math.max(0, results.length - 1)))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setHighlight((h) => Math.max(h - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                const entry = results[highlight]
                if (entry) navigate(entry)
              }
            }}
            placeholder="Search SOPs — titles, sections, body text…"
            className="flex-1 bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-slate-400 hover:text-slate-700 p-1"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Empty state — pre-search */}
        {!query.trim() && (
          <div className="px-4 py-10 text-center">
            <Sparkles className="w-6 h-6 text-violet-600 mx-auto mb-2" />
            <p className="text-xs text-slate-600 mb-3">
              Search across every SOP, every section, every paragraph.
            </p>
            <p className="text-[11px] text-slate-500">
              Try: <span className="text-slate-700 font-medium">annual inspection</span> ·{' '}
              <span className="text-slate-700 font-medium">RLS</span> ·{' '}
              <span className="text-slate-700 font-medium">owner approval</span>
            </p>
          </div>
        )}

        {/* No results */}
        {query.trim() && results.length === 0 && (
          <div className="px-4 py-10 text-center text-xs text-slate-500">
            No matches for &ldquo;{query}&rdquo;.
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <ul className="max-h-[60vh] overflow-y-auto">
            {results.map((entry, i) => {
              const isHi = i === highlight
              return (
                <li key={`${entry.sopSlug}-${entry.anchor}-${i}`}>
                  <button
                    type="button"
                    onClick={() => navigate(entry)}
                    onMouseEnter={() => setHighlight(i)}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
                      isHi ? 'bg-violet-50' : 'hover:bg-slate-50'
                    } ${i > 0 ? 'border-t border-slate-100' : ''}`}
                  >
                    <div className="text-[10px] uppercase tracking-[0.15em] font-semibold text-violet-700 mt-0.5 shrink-0">
                      {entry.sopSlug.split('-')[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {entry.sectionTitle}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {entry.sopTitle}
                      </div>
                      {entry.excerpt && (
                        <div className="text-[11px] text-slate-600 mt-1 line-clamp-2">
                          {entry.excerpt}
                        </div>
                      )}
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 mt-1 shrink-0" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-[10px] text-slate-500">
          <span>
            <kbd className="border border-slate-300 bg-white rounded px-1 py-0.5 mr-1 text-slate-700">↑↓</kbd>
            navigate
          </span>
          <span>
            <kbd className="border border-slate-300 bg-white rounded px-1 py-0.5 mr-1 text-slate-700">↵</kbd>
            open
          </span>
          <span>
            <kbd className="border border-slate-300 bg-white rounded px-1 py-0.5 mr-1 text-slate-700">esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>
  )
}
