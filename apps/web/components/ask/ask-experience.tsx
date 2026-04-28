'use client'

import dynamic from 'next/dynamic'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Send, Loader2, Plane, Clock, Sparkles, FileText, BookOpen, ChevronDown, ClipboardList, Package, ExternalLink, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AnswerBlock } from '@/components/ask/answer-block'
import { DocumentViewerBoundary } from '@/components/ask/document-viewer-boundary'
import { MechanicToolsPanel } from '@/components/ask/mechanic-tools-panel'
import { useAppContext } from '@/components/redesign/AppContext'
import { useTenantRouter } from '@/components/shared/tenant-link'
import { formatDateTime } from '@/lib/utils'
import type { Aircraft, AnswerCitation, QueryConfidence, OrgRole } from '@/types'

// ── Artifact types (mirrors /api/ask Artifact interface) ──────────────────────
interface Artifact {
  type: 'logbook_draft' | 'checklist' | 'parts_results' | 'logbook_entries'
  title: string
  data: any
  aircraft_id?: string
  action_url?: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  confidence?: QueryConfidence
  citations?: AnswerCitation[]
  warningFlags?: string[]
  followUpQuestions?: string[]
  artifacts?: Artifact[]
  timestamp: Date
}

interface AircraftOption {
  id: string
  tail_number: string
  make: string
  model: string
}

function buildAircraftIdentityKey(option: AircraftOption) {
  return `${option.tail_number.trim().toUpperCase()}::${option.make.trim().toUpperCase()}::${option.model.trim().toUpperCase()}`
}

function dedupeAircraftOptions(
  options: AircraftOption[],
  documentCounts: Map<string, number>,
  preferredAircraftId?: string
) {
  const byIdentity = new Map<string, AircraftOption>()

  for (const option of options) {
    const identityKey = buildAircraftIdentityKey(option)
    const existing = byIdentity.get(identityKey)

    if (!existing) {
      byIdentity.set(identityKey, option)
      continue
    }

    const existingCount = documentCounts.get(existing.id) ?? 0
    const nextCount = documentCounts.get(option.id) ?? 0

    const keepNext =
      nextCount > existingCount ||
      (nextCount === existingCount &&
        preferredAircraftId != null &&
        option.id === preferredAircraftId &&
        existing.id !== preferredAircraftId)

    if (keepNext) {
      byIdentity.set(identityKey, option)
    }
  }

  return Array.from(byIdentity.values())
}

const OWNER_PROMPTS = [
  'When was the last annual inspection?',
  'Show oil change history',
  'What does my engine logbook say about the last overhaul?',
  'What inspections are coming due for this aircraft?',
  'Summarize the most recent maintenance performed on this aircraft.',
  'Do my documents show any open AD or compliance concerns?',
]

const MECHANIC_PROMPTS = [
  'Draft a logbook entry for the oil change I just did',
  'Generate an annual inspection checklist',
  'Find magneto parts for my aircraft',
  'Search the logbook for the last overhaul entry.',
  'What does the maintenance manual say about this discrepancy?',
  'Generate an AD compliance checklist for this aircraft.',
]

const MECHANIC_PERSONA_ROLES: readonly OrgRole[] = ['owner', 'admin', 'mechanic']
const RECENT_QUERY_STORAGE_KEY_PREFIX = 'ask_recent_queries'
const OWNER_SELECTED_AIRCRAFT_STORAGE_KEY = 'owner_selected_aircraft_id'

type AskPersona = 'owner' | 'mechanic'

/**
 * Build a deeplink to the full-page document viewer that lands directly on
 * the cited page with the cited passage highlighted. Used so citation pills
 * support cmd-click → new tab and right-click → copy link.
 *
 * The query params are read by /documents/[id]/page.tsx, which reconstructs
 * the citation and passes it to the same DocumentViewer the in-page side
 * panel uses — so the user lands on the exact entry, not the document start.
 */
function buildCitationHref(c: AnswerCitation): string | null {
  // Defensive: if the citation has no documentId we cannot deeplink — the
  // caller falls back to the in-page side panel preview only.
  if (!c.documentId) return null
  const params = new URLSearchParams()
  if (typeof c.pageNumber === 'number' && c.pageNumber > 0) {
    params.set('page', String(c.pageNumber))
  }
  if (c.chunkId) params.set('chunk', c.chunkId)
  // Prefer quotedText (exact extracted span) over snippet (RAG context window)
  // — the PDF search plugin uses this to highlight the precise passage.
  const passage = c.quotedText ?? c.snippet ?? ''
  if (passage) {
    // Cap to keep URLs short; the viewer only needs enough to anchor highlighting.
    params.set('snippet', passage.slice(0, 240))
  }
  const qs = params.toString()
  return qs ? `/documents/${c.documentId}?${qs}` : `/documents/${c.documentId}`
}

const DocumentViewer = dynamic(
  () => import('@/components/ask/document-viewer').then((mod) => mod.DocumentViewer),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-center">Loading source preview…</p>
      </div>
    ),
  }
)

function createMessageId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function getRecentQueryStorageKey(persona: AskPersona) {
  return `${RECENT_QUERY_STORAGE_KEY_PREFIX}:${persona}`
}

function loadPersistedAircraftSelection() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(OWNER_SELECTED_AIRCRAFT_STORAGE_KEY)
  } catch {
    return null
  }
}

function loadRecentQueries(persona: AskPersona): Array<{ id: string; question: string; created_at: string }> {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(getRecentQueryStorageKey(persona))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry: any) => ({
        id: typeof entry?.id === 'string' ? entry.id : createMessageId(),
        question: typeof entry?.question === 'string' ? entry.question : '',
        created_at: typeof entry?.created_at === 'string' ? entry.created_at : new Date().toISOString(),
      }))
      .filter((entry) => entry.question.trim().length > 0)
      .slice(0, 20)
  } catch {
    return []
  }
}

function persistRecentQueries(
  persona: AskPersona,
  queries: Array<{ id: string; question: string; created_at: string }>
) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(getRecentQueryStorageKey(persona), JSON.stringify(queries.slice(0, 20)))
  } catch {
    // ignore storage failures
  }
}

// ── Artifact card renderer ────────────────────────────────────────────────────

function formatLogbookDate(value: unknown): string {
  if (!value) return 'Date unknown'
  const d = typeof value === 'string' || typeof value === 'number' ? new Date(value) : null
  if (!d || Number.isNaN(d.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(d)
}

interface LogbookArtifactEntry {
  id?: string
  entry_date?: string
  entry_text?: string
  description?: string
  entry_type?: string
  logbook_type?: string
  total_time_after?: number | string | null
  total_time?: number | string | null
  tach_time?: number | string | null
  hobbs_time?: number | string | null
  hobbs_out?: number | string | null
  work_order_id?: string | null
  work_order_ref?: string | null
  aircraft?: { id?: string } | null
  aircraft_id?: string
}

/**
 * Renders the entries returned by the search_logbook tool as a list of
 * individually clickable cards. Each card:
 *  - shows the real entry text (entry_text alias, falling back to description)
 *  - expands inline to reveal the full text + tach/total time + WO ref
 *  - links to the aircraft detail page deep-anchored at the entry id
 *    (#logbook-<id>) so the user lands on the specific entry, not a generic
 *    profile page
 *
 * Replaces the previous design where every entry was a static <li> with a
 * blank description (caused by reading e.description instead of the aliased
 * e.entry_text) and the only navigation was a single "Use This" button that
 * dumped the user on /aircraft/<id>.
 */
function LogbookEntriesArtifact({
  entries,
  aircraftId,
}: {
  entries: LogbookArtifactEntry[]
  aircraftId?: string
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  if (!entries || entries.length === 0) {
    return <p className="text-muted-foreground">No matching logbook entries found.</p>
  }

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
      {entries.map((e, i) => {
        const id = e.id ?? String(i)
        const isOpen = expanded.has(id)
        const text = e.entry_text ?? e.description ?? ''
        const acId = aircraftId ?? e.aircraft?.id ?? e.aircraft_id
        const tach = e.tach_time ?? null
        const total = e.total_time_after ?? e.total_time ?? null
        const hobbs = e.hobbs_time ?? e.hobbs_out ?? null
        const woRef = e.work_order_ref ?? null
        // Per-entry deep link to the dedicated logbook entry detail page.
        // This previously pointed at /aircraft/<id>#logbook-<entryId>, but
        // the AircraftDetail page doesn't render those anchors so the
        // browser just dumped users on the aircraft profile. The new
        // /logbook-entries/[id] route opens the specific entry directly.
        const sourceHref = e.id ? `/logbook-entries/${e.id}` : undefined

        return (
          <li key={id} className="border border-border/60 rounded-lg bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(id)}
              className="w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className="text-[11px] font-semibold text-foreground">
                  {formatLogbookDate(e.entry_date)}
                </span>
                {e.entry_type && (
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                    {e.entry_type}
                  </span>
                )}
                {e.logbook_type && (
                  <span className="text-[10px] bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded">
                    {e.logbook_type}
                  </span>
                )}
                {tach != null && (
                  <span className="text-[10px] text-muted-foreground">tach {tach}</span>
                )}
                {total != null && (
                  <span className="text-[10px] text-muted-foreground">tt {total}</span>
                )}
                <ChevronDown
                  className={`w-3 h-3 ml-auto text-muted-foreground/60 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </div>
              <p className={`text-[11px] text-foreground/80 leading-relaxed ${isOpen ? '' : 'line-clamp-2'}`}>
                {text || <span className="italic text-muted-foreground">(no description)</span>}
              </p>
            </button>
            {isOpen && (
              <div className="px-3 pb-2 pt-1 border-t border-border/60 bg-muted/20 flex items-center gap-3 flex-wrap text-[11px]">
                {hobbs != null && <span className="text-muted-foreground">Hobbs {hobbs}</span>}
                {woRef && <span className="text-muted-foreground">WO {woRef}</span>}
                {sourceHref && (
                  <a
                    href={sourceHref}
                    className="inline-flex items-center gap-1 text-primary hover:text-primary/80 ml-auto"
                    style={{ fontWeight: 500 }}
                  >
                    Open entry <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function ArtifactCard({ artifact, onUse }: { artifact: Artifact; onUse: (url: string) => void }) {
  const iconMap = {
    logbook_draft: <Sparkles className="w-4 h-4 text-primary" />,
    checklist: <ClipboardList className="w-4 h-4 text-primary" />,
    parts_results: <Package className="w-4 h-4 text-primary" />,
    logbook_entries: <BookOpen className="w-4 h-4 text-primary" />,
  }

  const data = artifact.data as any

  // Logbook entries are addressable individually — hide the misleading
  // top-level "Use This" CTA (which sent users to the aircraft profile page)
  // and let the user click directly into a specific entry instead.
  const showHeaderCta = artifact.action_url && artifact.type !== 'logbook_entries'

  return (
    <div className="mt-3 rounded-xl border border-primary/20 bg-primary/3 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-primary/10 bg-primary/5">
        <div className="flex items-center gap-2">
          {iconMap[artifact.type]}
          <span className="text-[12px] font-semibold text-foreground">{artifact.title}</span>
        </div>
        {showHeaderCta && (
          <button
            onClick={() => onUse(artifact.action_url!)}
            className="flex items-center gap-1 text-[11px] text-primary font-semibold hover:underline"
          >
            Use This <ExternalLink className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="p-3 text-[12px] text-foreground space-y-2">
        {/* Logbook draft */}
        {artifact.type === 'logbook_draft' && data?.description && (
          <>
            <p className="leading-relaxed">{data.description}</p>
            {data.entry_type && (
              <span className="inline-block bg-primary/10 text-primary px-2 py-0.5 rounded text-[11px] font-medium">
                {data.entry_type}
              </span>
            )}
            {Array.isArray(data.parts_used) && data.parts_used.length > 0 && (
              <div>
                <p className="font-semibold text-muted-foreground text-[11px] uppercase mb-1">Parts</p>
                {data.parts_used.map((p: any, i: number) => (
                  <p key={i} className="text-[11px] text-muted-foreground">{p.part_number} — {p.description} (qty {p.quantity})</p>
                ))}
              </div>
            )}
          </>
        )}

        {/* Checklist */}
        {artifact.type === 'checklist' && Array.isArray(data?.items) && (
          <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {data.items.slice(0, 12).map((item: any, i: number) => (
              <li key={i} className="flex items-start gap-2">
                <span className={`mt-1 h-1.5 w-1.5 rounded-full flex-shrink-0 ${item.required ? 'bg-destructive' : 'bg-muted-foreground/40'}`} />
                <div>
                  <span className="font-medium text-foreground">{item.title}</span>
                  {item.reference && <span className="ml-1.5 text-[10px] text-primary font-mono">{item.reference}</span>}
                </div>
              </li>
            ))}
            {data.items.length > 12 && (
              <li className="text-[11px] text-muted-foreground pl-3.5">+{data.items.length - 12} more items</li>
            )}
          </ul>
        )}

        {/* Parts results */}
        {artifact.type === 'parts_results' && (
          <>
            {Array.isArray(data?.results) && data.results.length > 0 ? (
              <ul className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {data.results.slice(0, 6).map((p: any, i: number) => (
                  <li key={i} className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-medium text-foreground">{p.part_number ?? p.title ?? 'Part'}</span>
                      {p.description && <p className="text-[11px] text-muted-foreground">{p.description}</p>}
                    </div>
                    {p.price != null && (
                      <span className="text-[11px] font-semibold text-emerald-600 flex-shrink-0">${p.price}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No parts found. Try the parts library for a broader search.</p>
            )}
          </>
        )}

        {/* Logbook entries — each entry is its own clickable link */}
        {artifact.type === 'logbook_entries' && (
          <LogbookEntriesArtifact entries={Array.isArray(data?.entries) ? data.entries : []} aircraftId={artifact.aircraft_id} />
        )}
      </div>
    </div>
  )
}

export function AskExperience() {
  const searchParams = useSearchParams()
  const router = useTenantRouter()
  const { persona, setPersona, currentUserRole } = useAppContext()
  const aircraftParam = searchParams.get('aircraft')?.trim() ?? ''
  const initialQuestionFromQuery = searchParams.get('q')?.trim() ?? ''
  const [aircraft, setAircraft] = useState<AircraftOption[]>([])
  const [selectedAircraftId, setSelectedAircraftId] = useState<string>(
    aircraftParam || loadPersistedAircraftSelection() || 'all'
  )
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState(initialQuestionFromQuery)
  const [isLoading, setIsLoading] = useState(false)
  const [activeCitation, setActiveCitation] = useState<AnswerCitation | null>(null)
  const [previousQueries, setPreviousQueries] = useState<Array<{ id: string; question: string; created_at: string }>>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const autoAskedQueryRef = useRef<string | null>(null)
  const canUseMechanicPersona = currentUserRole != null && MECHANIC_PERSONA_ROLES.includes(currentUserRole)
  const suggestedPrompts = persona === 'mechanic' ? MECHANIC_PROMPTS : OWNER_PROMPTS
  const emptyStateDescription = persona === 'mechanic'
    ? 'Use mechanic mode for maintenance workflows, parts lookup, checklists, and draft entries.'
    : 'Use owner mode for records, inspections, compliance, history, and source-backed aircraft answers.'
  const inputPlaceholder = persona === 'mechanic'
    ? 'Ask about maintenance actions, parts, manuals, or draft entries...'
    : 'Ask about records, inspections, compliance, or aircraft history...'

  useEffect(() => {
    let cancelled = false

    async function loadAircraftOptions() {
      try {
        const response = await fetch('/api/aircraft', { cache: 'no-store' })
        if (!response.ok) {
          if (!cancelled) setAircraft([])
          return
        }

        const payload = await response.json()
        const aircraftRows = Array.isArray(payload?.aircraft)
          ? payload.aircraft
          : Array.isArray(payload)
          ? payload
          : []

        if (!Array.isArray(aircraftRows) || cancelled) {
          if (!cancelled) setAircraft([])
          return
        }

        const normalizedRows = aircraftRows
          .map((row: any) => ({
            id: String(row.id ?? ''),
            tail_number: String(row.tail_number ?? '').trim(),
            make: String(row.make ?? '').trim(),
            model: String(row.model ?? '').trim(),
          }))
          .filter((row) => row.id && row.tail_number)

        const dedupedRows = dedupeAircraftOptions(normalizedRows, new Map(), aircraftParam || undefined)
          .sort((a, b) => a.tail_number.localeCompare(b.tail_number))

        if (cancelled) return
        setAircraft(dedupedRows)

        const persistedAircraftId = loadPersistedAircraftSelection()
        const fallbackSelection = aircraftParam || persistedAircraftId || dedupedRows[0]?.id || 'all'

        if (!aircraftParam && fallbackSelection !== 'all') {
          setSelectedAircraftId((current) => (current === fallbackSelection ? current : fallbackSelection))
          const params = new URLSearchParams(searchParams.toString())
          params.set('aircraft', fallbackSelection)
          router.replace(`/ask?${params.toString()}`, { scroll: false })
          return
        }

        if (!aircraftParam) return

        const matchedOriginal = normalizedRows.find((row) => row.id === aircraftParam)
        if (!matchedOriginal) return

        const canonicalMatch = dedupedRows.find(
          (row) => buildAircraftIdentityKey(row) === buildAircraftIdentityKey(matchedOriginal)
        )

        if (canonicalMatch && canonicalMatch.id !== aircraftParam) {
          const params = new URLSearchParams(searchParams.toString())
          params.set('aircraft', canonicalMatch.id)
          router.replace(`/ask?${params.toString()}`, { scroll: false })
        }
      } catch {
        if (!cancelled) {
          setAircraft([])
        }
        return
      }
    }

    void loadAircraftOptions()

    return () => {
      cancelled = true
    }
  }, [aircraftParam, router, searchParams])

  useEffect(() => {
    const nextSelection = aircraftParam || 'all'
    setSelectedAircraftId((current) => (current === nextSelection ? current : nextSelection))
  }, [aircraftParam])

  useEffect(() => {
    if (!canUseMechanicPersona && persona === 'mechanic') {
      setPersona('owner')
    }
  }, [canUseMechanicPersona, persona, setPersona])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    setMessages([])
    setQuestion('')
    setActiveCitation(null)
    autoAskedQueryRef.current = null
    setPreviousQueries(loadRecentQueries(persona))
  }, [persona])

  const handleAsk = useCallback(async (questionText?: string) => {
    const q = questionText ?? question.trim()
    if (!q || isLoading) return

    setQuestion('')
    setIsLoading(true)

    const userMsg: Message = {
      id: createMessageId(),
      role: 'user',
      content: q,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])

    try {
      const history = messages
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          aircraft_id: selectedAircraftId === 'all' ? undefined : selectedAircraftId,
          persona,
          conversation_history: history,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setMessages(prev => [...prev, {
          id: createMessageId(),
          role: 'assistant',
          content: data.error ?? 'An error occurred. Please try again.',
          confidence: 'insufficient_evidence',
          citations: [],
          warningFlags: [],
          followUpQuestions: [],
          timestamp: new Date(),
        }])
        return
      }

      const assistantMsg: Message = {
        id: createMessageId(),
        role: 'assistant',
        content: data.answer,
        confidence: data.confidence,
        citations: data.citations ?? [],
        warningFlags: data.warning_flags ?? [],
        followUpQuestions: data.follow_up_questions ?? [],
        artifacts: data.artifacts ?? [],
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, assistantMsg])
      setPreviousQueries((prev) => {
        const next = [
          {
            id: data.query_id ?? createMessageId(),
            question: q,
            created_at: new Date().toISOString(),
          },
          ...prev.filter((item) => item.question !== q),
        ]

        const trimmed = next.slice(0, 20)
        persistRecentQueries(persona, trimmed)
        return trimmed
      })
    } catch {
      setMessages(prev => [...prev, {
        id: createMessageId(),
        role: 'assistant',
        content: 'Network error. Please check your connection and try again.',
        confidence: 'insufficient_evidence',
        citations: [],
        warningFlags: [],
        followUpQuestions: [],
        timestamp: new Date(),
      }])
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }, [isLoading, messages, persona, question, selectedAircraftId])

  useEffect(() => {
    const queryQuestion = searchParams.get('q')?.trim() ?? ''
    if (!queryQuestion) return
    if (autoAskedQueryRef.current === queryQuestion) return
    if (messages.length > 0 || isLoading) return

    autoAskedQueryRef.current = queryQuestion
    setQuestion(queryQuestion)
    void handleAsk(queryQuestion)
  }, [handleAsk, isLoading, messages.length, searchParams])

  function handleCitationSelect(citation: AnswerCitation) {
    setActiveCitation(citation)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAsk()
    }
  }

  function handleAircraftChange(nextAircraftId: string) {
    setSelectedAircraftId(nextAircraftId)

    if (typeof window !== 'undefined' && nextAircraftId !== 'all') {
      window.localStorage.setItem(OWNER_SELECTED_AIRCRAFT_STORAGE_KEY, nextAircraftId)
    }

    const params = new URLSearchParams(searchParams.toString())
    if (nextAircraftId === 'all') {
      params.delete('aircraft')
    } else {
      params.set('aircraft', nextAircraftId)
    }

    const next = params.toString()
    router.replace(next ? `/ask?${next}` : '/ask', { scroll: false })
  }

  return (
    <div className="h-full flex">
      {/* ── Mobile citation modal (full-screen on small screens) ─────────────── */}
      {activeCitation && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center justify-between p-3 border-b border-border gap-3">
            <span className="text-sm font-semibold">Source Preview</span>
            <div className="flex items-center gap-3">
              {(() => {
                const href = buildCitationHref(activeCitation)
                return href ? (
                  <a
                    href={href}
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors"
                    style={{ fontWeight: 500 }}
                  >
                    <ExternalLink className="w-3 h-3" /> Open full page
                  </a>
                ) : null
              })()}
              <button
                onClick={() => setActiveCitation(null)}
                className="p-1 rounded hover:bg-muted transition-colors"
                aria-label="Close citation viewer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <DocumentViewerBoundary
              resetKey={`${activeCitation.documentId}:${activeCitation.chunkId}:${activeCitation.pageNumber}`}
            >
              <DocumentViewer
                citation={activeCitation}
                documentId={activeCitation.documentId}
                onClose={() => setActiveCitation(null)}
              />
            </DocumentViewerBoundary>
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-6 border-b border-border bg-white">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-primary" />
              <div>
                <h1 className="text-[18px] text-foreground" style={{ fontWeight: 700 }}>Ask Your Aircraft</h1>
                <p className="text-[12px] text-muted-foreground">
                  {persona === 'mechanic' ? 'Mechanic mode' : 'Owner mode'}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 flex-wrap">
              <div className="inline-flex items-center rounded-lg border border-border bg-muted/30 p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={persona === 'owner' ? 'default' : 'ghost'}
                  className="h-8 px-3 text-[12px]"
                  onClick={() => setPersona('owner')}
                >
                  Owner
                </Button>
                {canUseMechanicPersona && (
                  <Button
                    type="button"
                    size="sm"
                    variant={persona === 'mechanic' ? 'default' : 'ghost'}
                    className="h-8 px-3 text-[12px]"
                    onClick={() => setPersona('mechanic')}
                  >
                    Mechanic
                  </Button>
                )}
              </div>

              <Select value={selectedAircraftId} onValueChange={handleAircraftChange}>
                <SelectTrigger className="flex items-center gap-2 bg-muted/50 border border-border rounded-lg px-3 py-1.5 text-[13px] w-[220px]" style={{ fontWeight: 500 }}>
                  <Plane className="w-4 h-4 text-primary" />
                  <SelectValue placeholder="All aircraft" />
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Aircraft</SelectItem>
                  {aircraft.map(ac => (
                    <SelectItem key={ac.id} value={ac.id}>
                      <div className="flex items-center gap-2">
                        <Plane className="h-3.5 w-3.5" />
                        <span className="font-mono text-sm">{ac.tail_number}</span>
                        <span className="text-muted-foreground text-xs">{ac.make} {ac.model}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {messages.length === 0 ? (
            <div className="max-w-2xl mx-auto text-center pt-16">
              <div className="w-16 h-16 rounded-2xl bg-primary/8 flex items-center justify-center mx-auto mb-5">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-[20px] text-foreground mb-2" style={{ fontWeight: 700 }}>
                {persona === 'mechanic' ? 'What maintenance help do you need?' : 'What would you like to know?'}
              </h2>
              <p className="text-[14px] text-muted-foreground mb-8">
                {emptyStateDescription}
              </p>
              <div className="grid grid-cols-2 gap-2 max-w-lg mx-auto">
                {suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleAsk(prompt)}
                    className="text-left text-[12px] bg-white border border-border rounded-xl px-4 py-3 hover:border-primary/30 hover:bg-primary/3 transition-all"
                    style={{ fontWeight: 500 }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-4">
              {messages.map((msg) => (
                <div key={msg.id}>
                  {msg.role === 'user' ? (
                    <div className="flex justify-end">
                      <div className="bg-primary text-white rounded-2xl rounded-br-md px-4 py-3 max-w-md text-[13px]">
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl rounded-bl-md border border-border p-5 space-y-4">
                      <div className="text-[13px] text-foreground leading-relaxed">
                        <AnswerBlock
                          answer={msg.content}
                          confidence={msg.confidence ?? 'high'}
                          citations={msg.citations ?? []}
                          warningFlags={msg.warningFlags ?? []}
                          followUpQuestions={msg.followUpQuestions ?? []}
                          onCitationClick={handleCitationSelect}
                          onFollowUp={handleAsk}
                        />
                      </div>
                      {/* Artifact cards */}
                      {(msg.artifacts?.length ?? 0) > 0 && (
                        <div className="space-y-2">
                          {msg.artifacts!.map((artifact, i) => (
                            <ArtifactCard
                              key={i}
                              artifact={artifact}
                              onUse={(url) => router.push(url)}
                            />
                          ))}
                        </div>
                      )}
                      {(msg.citations?.length ?? 0) > 0 && (
                        <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-border">
                          <span className="text-[11px] text-muted-foreground" style={{ fontWeight: 600 }}>Sources:</span>
                          {msg.citations!.map((c, i) => {
                            const href = buildCitationHref(c)
                            const baseClass = 'inline-flex items-center gap-1 text-[11px] bg-primary/8 text-primary px-2.5 py-1 rounded-full hover:bg-primary/15 transition-colors'
                            // If the citation has no resolvable documentId we
                            // can still open the side-panel preview, but we
                            // render a button (no dead /documents/undefined href).
                            if (!href) {
                              return (
                                <button
                                  key={c.chunkId || `cite-${i}`}
                                  type="button"
                                  onClick={() => handleCitationSelect(c)}
                                  className={`${baseClass} cursor-pointer`}
                                  style={{ fontWeight: 500 }}
                                  title={`${c.documentTitle ?? 'Source'} p.${c.pageNumber ?? '?'}`}
                                >
                                  <BookOpen className="w-3 h-3" />
                                  {i + 1}. {c.documentTitle ?? 'Source'}
                                </button>
                              )
                            }
                            return (
                              <a
                                key={c.chunkId || `cite-${i}`}
                                href={href}
                                onClick={(e) => {
                                  // Plain left-click: preview in side panel.
                                  // Modifier-click / middle-click / right-click: let the browser
                                  // handle (new tab, copy link, etc.) using the real href.
                                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                                  e.preventDefault()
                                  handleCitationSelect(c)
                                }}
                                className={`${baseClass} cursor-pointer`}
                                style={{ fontWeight: 500 }}
                                title={`Open ${c.documentTitle ?? 'source'} p.${c.pageNumber ?? '?'} (⌘-click for new tab)`}
                              >
                                <BookOpen className="w-3 h-3" />
                                {i + 1}. {c.documentTitle ?? 'Source'}
                              </a>
                            )
                          })}
                          {msg.confidence && (
                            <span className="text-[11px] bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full" style={{ fontWeight: 600 }}>
                              {msg.confidence === 'high' ? 'High' : msg.confidence === 'medium' ? 'Medium' : 'Low'} confidence
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Working on it…</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border bg-white">
          <div className="max-w-2xl mx-auto flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-muted/30 border border-border rounded-xl px-4 py-3">
              <Input
                ref={inputRef}
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={inputPlaceholder}
                className="bg-transparent text-[13px] outline-none flex-1 border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                maxLength={2000}
              />
            </div>
            <button
              onClick={() => handleAsk()}
              disabled={!question.trim() || isLoading}
              className="bg-primary text-white px-4 rounded-xl hover:bg-primary/90 transition-colors"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Right sidebar: mechanic tools + history or source preview */}
      <div className={`hidden lg:block border-l border-border bg-white transition-all duration-200 ${activeCitation ? 'w-[40%]' : 'w-[320px]'}`}>
        {activeCitation ? (
          <div className="h-full flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between gap-2">
              <h3 className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>Source Preview</h3>
              <div className="flex items-center gap-3">
                {(() => {
                  const href = buildCitationHref(activeCitation)
                  return href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors"
                      style={{ fontWeight: 500 }}
                    >
                      <ExternalLink className="w-3 h-3" /> Open full page
                    </a>
                  ) : null
                })()}
                <button
                  onClick={() => setActiveCitation(null)}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <DocumentViewerBoundary
                resetKey={`${activeCitation.documentId}:${activeCitation.chunkId}:${activeCitation.pageNumber}`}
              >
                <DocumentViewer
                  citation={activeCitation}
                  documentId={activeCitation.documentId}
                  onClose={() => setActiveCitation(null)}
                />
              </DocumentViewerBoundary>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {persona === 'mechanic' && (
              <MechanicToolsPanel userRole={currentUserRole} aircraft={aircraft} />
            )}

            <div>
              <h3 className="text-[13px] text-foreground mb-3" style={{ fontWeight: 600 }}>Query History</h3>
              <div className="space-y-2">
                {previousQueries.map(q => (
                  <button
                    key={q.id}
                    onClick={() => handleAsk(q.question)}
                    className="w-full text-left bg-muted/30 rounded-lg px-3 py-2.5 hover:bg-muted/50 transition-colors"
                  >
                    <div className="text-[12px] text-foreground truncate" style={{ fontWeight: 500 }}>{q.question}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" /> {formatDateTime(q.created_at)}
                    </div>
                  </button>
                ))}
                {previousQueries.length === 0 && (
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    No recent questions yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
