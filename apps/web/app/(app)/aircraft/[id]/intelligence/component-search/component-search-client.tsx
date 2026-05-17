'use client'

/**
 * Component History Search — client surface.
 *
 * A real-time search box over this aircraft's uploaded records. Unlike the
 * report modules there is no cache and no "generate" flow — each query hits
 * POST /api/intelligence/component-search live. Supports a search-mode toggle
 * (smart / exact / semantic), doc-type + date-range filters, per-aircraft
 * recent searches in localStorage, and inline term highlighting.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from '@/components/shared/tenant-link'
import { toast } from 'sonner'
import {
  Search, Loader2, FileSearch, FileText, Upload, ExternalLink,
  Calendar, Gauge, X, SlidersHorizontal, History,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { AircraftRecordSearchHit } from '@/lib/intelligence/types'

type SearchMode = 'smart' | 'exact' | 'semantic'

const MODES: Array<{ id: SearchMode; label: string; hint: string }> = [
  { id: 'smart', label: 'Smart Search', hint: 'We pick the best strategy' },
  { id: 'exact', label: 'Exact Match', hint: 'Keyword / part-number match' },
  { id: 'semantic', label: 'Semantic', hint: 'Meaning-based match' },
]

// Common record categories — sent as the doc_types filter.
const DOC_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'logbook', label: 'Logbooks' },
  { value: 'form_337', label: 'Form 337' },
  { value: 'stc', label: 'STC' },
  { value: 'ad_compliance', label: 'AD Compliance' },
  { value: 'service_bulletin', label: 'Service Bulletins' },
  { value: 'work_order', label: 'Work Orders' },
  { value: 'invoice', label: 'Invoices' },
  { value: 'poh', label: 'POH / AFM' },
  { value: 'miscellaneous', label: 'Miscellaneous' },
]

const RECENT_LIMIT = 5

function recentKey(aircraftId: string) {
  return `intelligence:component-search:recent:${aircraftId}`
}

function loadRecent(aircraftId: string): string[] {
  try {
    const raw = window.localStorage.getItem(recentKey(aircraftId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((q): q is string => typeof q === 'string').slice(0, RECENT_LIMIT)
      : []
  } catch {
    return []
  }
}

/** Split text on the query terms so each match can be wrapped in <mark>. */
function highlight(text: string, query: string): React.ReactNode {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 2)
  if (terms.length === 0) return text
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts = text.split(re)
  return parts.map((part, i) =>
    re.test(part) ? (
      <mark key={i} className="rounded-sm bg-amber-100 px-0.5 text-foreground">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  )
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function ComponentSearchClient({
  aircraftId,
  aircraftTail,
  hasDocuments,
}: {
  aircraftId: string
  aircraftTail: string
  hasDocuments: boolean
}) {
  const [queryInput, setQueryInput] = useState('')
  const [mode, setMode] = useState<SearchMode>('smart')
  const [docTypes, setDocTypes] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<AircraftRecordSearchHit[] | null>(null)
  const [searchedTerm, setSearchedTerm] = useState('')
  const [recent, setRecent] = useState<string[]>([])

  useEffect(() => {
    setRecent(loadRecent(aircraftId))
  }, [aircraftId])

  const activeFilterCount = useMemo(
    () => docTypes.length + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0),
    [docTypes, dateFrom, dateTo],
  )

  function rememberSearch(term: string) {
    setRecent((prev) => {
      const next = [term, ...prev.filter((q) => q.toLowerCase() !== term.toLowerCase())].slice(
        0,
        RECENT_LIMIT,
      )
      try {
        window.localStorage.setItem(recentKey(aircraftId), JSON.stringify(next))
      } catch {
        // localStorage unavailable — recent searches are best-effort only.
      }
      return next
    })
  }

  const runSearch = useCallback(
    async (rawTerm: string) => {
      const term = rawTerm.trim()
      if (!term) {
        toast.error('Enter something to search for.')
        return
      }
      setLoading(true)
      setSearchedTerm(term)
      try {
        const res = await fetch('/api/intelligence/component-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            aircraft_id: aircraftId,
            query: term,
            mode,
            filters: {
              doc_types: docTypes.length > 0 ? docTypes : undefined,
              date_from: dateFrom || undefined,
              date_to: dateTo || undefined,
            },
          }),
        })
        if (!res.ok) throw new Error('request failed')
        const json = (await res.json()) as { results: AircraftRecordSearchHit[] }
        setResults(Array.isArray(json.results) ? json.results : [])
        rememberSearch(term)
      } catch {
        toast.error('Search failed. Please try again.')
        setResults(null)
      } finally {
        setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aircraftId, mode, docTypes, dateFrom, dateTo],
  )

  function toggleDocType(value: string) {
    setDocTypes((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    )
  }

  function clearFilters() {
    setDocTypes([])
    setDateFrom('')
    setDateTo('')
  }

  function chipSearch(term: string) {
    setQueryInput(term)
    void runSearch(term)
  }

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Search className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-[20px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
              Component History Search
            </h1>
            <p className="text-[12px] text-muted-foreground">
              Search every uploaded record for {aircraftTail} — parts, systems, and topics.
            </p>
          </div>
        </div>

        {/* No documents — nothing to search */}
        {!hasDocuments ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-white py-16 px-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
              <FileSearch className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-foreground" style={{ fontWeight: 600 }}>
              No documents uploaded for this aircraft
            </p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Component History Search reads {aircraftTail}&apos;s uploaded logbooks and
              records. Upload documents to start searching.
            </p>
            <Link href={`/aircraft/${aircraftId}/documents`}>
              <Button size="sm" variant="outline">
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Upload Documents
              </Button>
            </Link>
          </div>
        ) : (
          <>
            {/* Search bar */}
            <div className="rounded-xl border border-border bg-white p-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={queryInput}
                    onChange={(e) => setQueryInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void runSearch(queryInput)
                      }
                    }}
                    placeholder="Search part numbers, systems, or topics — e.g. 'alternator', 'P/N 69620', 'left brake'"
                    className="pl-9"
                  />
                </div>
                <Button onClick={() => void runSearch(queryInput)} disabled={loading}>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-1.5" />
                      Search
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowFilters((s) => !s)}
                  aria-pressed={showFilters}
                >
                  <SlidersHorizontal className="h-4 w-4 mr-1.5" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 text-[10.5px] text-primary tabular-nums">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </div>

              {/* Mode toggle */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {MODES.map((m) => {
                  const active = mode === m.id
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMode(m.id)}
                      title={m.hint}
                      className={
                        'rounded-md border px-2.5 py-1 text-[11.5px] transition-colors ' +
                        (active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-white text-muted-foreground hover:text-foreground')
                      }
                      style={{ fontWeight: active ? 600 : 500 }}
                    >
                      {m.label}
                    </button>
                  )
                })}
              </div>

              {/* Recent searches */}
              {recent.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <History className="h-3 w-3" />
                    Recent
                  </span>
                  {recent.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => chipSearch(term)}
                      className="rounded-full border border-border bg-muted/30 px-2.5 py-0.5 text-[11.5px] text-foreground hover:bg-muted transition-colors"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Filter panel */}
            {showFilters && (
              <div className="mt-3 rounded-xl border border-border bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>
                    Filters
                  </h2>
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                      Clear all
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Doc type */}
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5" style={{ fontWeight: 600 }}>
                      Document Type
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {DOC_TYPE_OPTIONS.map((opt) => {
                        const checked = docTypes.includes(opt.value)
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => toggleDocType(opt.value)}
                            aria-pressed={checked}
                            className={
                              'rounded-md border px-2 py-1 text-[11.5px] transition-colors ' +
                              (checked
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border bg-white text-muted-foreground hover:text-foreground')
                            }
                            style={{ fontWeight: checked ? 600 : 500 }}
                          >
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Date range */}
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5" style={{ fontWeight: 600 }}>
                      Entry Date Range
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="date"
                        value={dateFrom}
                        max={dateTo || undefined}
                        onChange={(e) => setDateFrom(e.target.value)}
                        aria-label="Date from"
                      />
                      <span className="text-[12px] text-muted-foreground">to</span>
                      <Input
                        type="date"
                        value={dateTo}
                        min={dateFrom || undefined}
                        onChange={(e) => setDateTo(e.target.value)}
                        aria-label="Date to"
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Records without an entry date are excluded when a range is set.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="mt-4 flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-white py-16 px-6 text-center">
                <Loader2 className="h-7 w-7 text-primary animate-spin" />
                <p className="text-sm text-foreground" style={{ fontWeight: 600 }}>
                  Searching {aircraftTail}&apos;s records…
                </p>
              </div>
            )}

            {/* Results */}
            {!loading && results !== null && (
              <div className="mt-4">
                {results.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-white py-16 px-6 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
                      <FileSearch className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-foreground" style={{ fontWeight: 600 }}>
                      No records found for &ldquo;{searchedTerm}&rdquo; in {aircraftTail}&apos;s
                      uploaded documents
                    </p>
                    <p className="text-xs text-muted-foreground max-w-sm">
                      Try a broader term — search for the system (e.g. &ldquo;electrical&rdquo;)
                      rather than a specific part number, or clear active filters.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="mb-2.5 text-[12px] text-muted-foreground">
                      {results.length} {results.length === 1 ? 'record' : 'records'} for{' '}
                      <span className="text-foreground" style={{ fontWeight: 600 }}>
                        &ldquo;{searchedTerm}&rdquo;
                      </span>
                    </div>
                    <div className="space-y-3">
                      {results.map((hit) => (
                        <ResultCard key={hit.chunk_id} hit={hit} query={searchedTerm} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Idle — no search run yet */}
            {!loading && results === null && (
              <div className="mt-4 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-white/50 py-14 px-6 text-center">
                <Search className="h-6 w-6 text-muted-foreground" />
                <p className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>
                  Search {aircraftTail}&apos;s component history
                </p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Enter a part number, system, or topic above to search every uploaded
                  logbook and record in real time.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// --- Result card -----------------------------------------------------------

function ResultCard({ hit, query }: { hit: AircraftRecordSearchHit; query: string }) {
  const date = formatDate(hit.entry_date)
  return (
    <section className="rounded-xl border border-border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-primary shrink-0" />
            <span className="text-[13.5px] text-foreground truncate" style={{ fontWeight: 700 }}>
              {hit.doc_name}
            </span>
            {hit.page_number != null && (
              <span className="text-[11.5px] text-muted-foreground shrink-0">
                · p.{hit.page_number}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="rounded-sm bg-muted px-1.5 py-0.5 capitalize">
              {hit.doc_type.replace(/_/g, ' ')}
            </span>
            {date && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {date}
              </span>
            )}
            {hit.tach != null && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Gauge className="h-3 w-3" />
                Tach {hit.tach}
              </span>
            )}
          </div>
        </div>
        <Link
          href={`/documents/${hit.document_id}`}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11.5px] text-foreground hover:bg-muted transition-colors shrink-0"
          style={{ fontWeight: 600 }}
        >
          <ExternalLink className="h-3 w-3" />
          View Document
        </Link>
      </div>
      <p className="mt-2.5 text-[12.5px] text-foreground/90 leading-relaxed whitespace-pre-wrap">
        {highlight(hit.excerpt, query)}
      </p>
    </section>
  )
}
