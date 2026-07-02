'use client'

import dynamic from 'next/dynamic'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Send, Loader2, Plane, Sparkles, FileText, BookOpen, ChevronDown, ClipboardList, Package, ExternalLink, X, Plus, Trash2, MessageSquare, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { AnswerBlock, type PerAircraftAnswer } from '@/components/ask/answer-block'
import { DocumentViewerBoundary } from '@/components/ask/document-viewer-boundary'
import { MechanicToolsPanel } from '@/components/ask/mechanic-tools-panel'
import { VoiceButton } from '@/components/voice/VoiceButton'
import { useAppContext } from '@/components/redesign/AppContext'
import { useTenantRouter } from '@/components/shared/tenant-link'
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
  /** Present only for fanned-out "All Aircraft" answers — one section per aircraft. */
  perAircraft?: PerAircraftAnswer[]
  /** The aircraft scope the question was asked under (e.g. "N12345" or "All aircraft"). */
  scopeLabel?: string
  timestamp: Date
}

interface AircraftOption {
  id: string
  tail_number: string
  make: string
  model: string
}

/** A persisted Ask AI conversation (from GET /api/ask/threads). */
interface AskThreadSummary {
  id: string
  title: string
  aircraft_id: string | null
  persona: string | null
  updated_at: string
}

/** Compact relative time for the conversation list (e.g. "2h ago", "Yesterday"). */
function relativeTime(dateStr: string): string {
  const t = new Date(dateStr).getTime()
  if (Number.isNaN(t)) return ''
  const min = Math.floor((Date.now() - t) / 60000)
  if (min < 1) return 'Just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day === 1) return 'Yesterday'
  if (day < 7) return `${day}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Bucket conversations into recency groups (most-recent first within each). */
function groupThreadsByRecency(
  threads: AskThreadSummary[],
): Array<{ label: string; items: AskThreadSummary[] }> {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const DAY = 86_400_000
  const groups = [
    { label: 'Today', items: [] as AskThreadSummary[] },
    { label: 'Yesterday', items: [] as AskThreadSummary[] },
    { label: 'Previous 7 days', items: [] as AskThreadSummary[] },
    { label: 'Older', items: [] as AskThreadSummary[] },
  ]
  const sorted = [...threads].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  )
  for (const t of sorted) {
    const ts = new Date(t.updated_at).getTime()
    if (ts >= startOfToday) groups[0].items.push(t)
    else if (ts >= startOfToday - DAY) groups[1].items.push(t)
    else if (ts >= startOfToday - 7 * DAY) groups[2].items.push(t)
    else groups[3].items.push(t)
  }
  return groups.filter((g) => g.items.length > 0)
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
const OWNER_SELECTED_AIRCRAFT_STORAGE_KEY = 'owner_selected_aircraft_id'

/** Human labels for the streamed progress stages emitted by /api/ask. */
const STREAM_STATUS_LABELS: Record<string, string> = {
  thinking: 'Thinking…',
  searching: 'Searching your documents…',
  drafting: 'Preparing…',
  working: 'Working on it…',
  writing: 'Writing answer…',
}

// Phase 18 mig 119 — mechanic merged into shop. AskExperience exposes the
// two operational personas (owner / shop) that have curated suggested
// prompts. Admin / view-as falls back to the owner prompt set.
type AskPersona = 'owner' | 'shop'

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

function loadPersistedAircraftSelection() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(OWNER_SELECTED_AIRCRAFT_STORAGE_KEY)
  } catch {
    return null
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
  // Narrow the AppContext persona (now `'owner' | 'mechanic' | 'shop'` per Spec
  // 0.2) to the AskPersona shape /ask supports. Shop falls back to owner-mode
  // here — the shop-foreman /ask experience is reserved for Phase 5.
  const { persona: rawPersona, setPersona: setRawPersona, currentUserRole } = useAppContext()
  // Phase 18: 'shop' (and the legacy 'mechanic' value that should never appear
  // post mig 119 but is defended against) maps to the maintenance-side prompts.
  const persona: AskPersona =
    rawPersona === 'shop' || (rawPersona as string) === 'mechanic' ? 'shop' : 'owner'
  const setPersona = setRawPersona as (p: AskPersona) => void
  const aircraftParam = searchParams.get('aircraft')?.trim() ?? ''
  const initialQuestionFromQuery = searchParams.get('q')?.trim() ?? ''
  const [aircraft, setAircraft] = useState<AircraftOption[]>([])
  // Initialize from SERVER-STABLE values only (query param, else 'all'). The
  // persisted localStorage selection is restored in an effect after mount —
  // reading localStorage in this initializer diverges from the server-rendered
  // HTML and trips a hydration mismatch on the selector label.
  const [selectedAircraftId, setSelectedAircraftId] = useState<string>(
    aircraftParam || 'all'
  )
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState(initialQuestionFromQuery)
  const [isLoading, setIsLoading] = useState(false)
  // Coarse progress label while a streamed answer is in flight (thinking →
  // searching → writing). null when idle or once the answer is complete.
  const [streamStatus, setStreamStatus] = useState<string | null>(null)
  const [activeCitation, setActiveCitation] = useState<AnswerCitation | null>(null)
  // Persisted conversations + the active thread id (null = unsaved/new chat).
  const [threads, setThreads] = useState<AskThreadSummary[]>([])
  const [threadId, setThreadId] = useState<string | null>(null)
  // True until the first conversations fetch resolves — drives the sidebar
  // skeleton so we don't flash "No conversations yet" while loading.
  const [threadsLoading, setThreadsLoading] = useState(true)
  // True while a saved conversation's messages are being fetched — drives the
  // chat-area skeleton when you open a thread.
  const [threadOpening, setThreadOpening] = useState(false)
  // Below lg the Conversations rail is hidden; this drives the slide-over
  // drawer that gives phones + tablets access to history / new chat.
  const [mobileConvOpen, setMobileConvOpen] = useState(false)
  // Per-aircraft uploaded-document counts — drives the "no documents
  // uploaded" empty state when a specific aircraft is selected.
  const [documentCounts, setDocumentCounts] = useState<Map<string, number>>(new Map())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const autoAskedQueryRef = useRef<string | null>(null)

  // Restore the persisted aircraft selection AFTER hydration (localStorage is
  // client-only). Runs once on mount; an explicit ?aircraft= query param wins.
  useEffect(() => {
    if (aircraftParam) return
    const persisted = loadPersistedAircraftSelection()
    if (persisted) setSelectedAircraftId(persisted)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canUseMechanicPersona = currentUserRole != null && MECHANIC_PERSONA_ROLES.includes(currentUserRole)
  const suggestedPrompts = persona === 'shop' ? MECHANIC_PROMPTS : OWNER_PROMPTS
  const emptyStateDescription = persona === 'shop'
    ? 'Use mechanic mode for maintenance workflows, parts lookup, checklists, and draft entries.'
    : 'Use owner mode for records, inspections, compliance, history, and source-backed aircraft answers.'
  const inputPlaceholder = persona === 'shop'
    ? 'Ask about maintenance actions, parts, manuals, or draft entries...'
    : 'Ask about records, inspections, compliance, or aircraft history...'
  // When a specific aircraft is selected, check whether any documents have
  // been uploaded for it. A strict 0 (not undefined) means counts have
  // loaded and the aircraft genuinely has no documents.
  const selectedAircraft = selectedAircraftId !== 'all'
    ? aircraft.find((a) => a.id === selectedAircraftId) ?? null
    : null
  const noDocumentsForAircraft =
    selectedAircraft != null && documentCounts.get(selectedAircraftId) === 0

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

        // Default to "All Aircraft" on first load — previous behavior
        // auto-redirected to the persisted aircraft id, which surprised
        // users who expected the dropdown to show "All" by default and
        // returned only one aircraft's results when they later clicked
        // "All" (because the URL still carried the persisted aircraft).
        // Persistence is now opt-in via the dropdown only.
        if (!aircraftParam) {
          setSelectedAircraftId('all')
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

  // Load per-aircraft document counts so we can warn when a selected
  // aircraft has no owner-uploaded documents.
  useEffect(() => {
    let cancelled = false
    async function loadDocumentCounts() {
      try {
        const res = await fetch('/api/documents/aircraft-counts', { cache: 'no-store' })
        if (!res.ok) return
        const payload = await res.json()
        if (cancelled || !payload?.counts) return
        setDocumentCounts(new Map(Object.entries(payload.counts as Record<string, number>)))
      } catch {
        // non-fatal — the empty state simply won't trigger
      }
    }
    void loadDocumentCounts()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    // Demote to owner ONLY once the role has actually loaded and is genuinely
    // not mechanic-capable. `currentUserRole` is null while /api/team is in
    // flight (or when it fails) — treating that as "not allowed" made this
    // effect race the fetch and silently PERSIST persona='owner' to the
    // membership row (setPersona POSTs /api/me/persona) on every Ask mount.
    // That was the source of the owner/shop persona flip-flapping.
    if (currentUserRole != null && !MECHANIC_PERSONA_ROLES.includes(currentUserRole) && persona === 'shop') {
      setPersona('owner')
    }
  }, [currentUserRole, persona, setPersona])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Phase 2 — auto-grow the composer textarea up to a cap as the user types,
  // so long squawk descriptions aren't crammed into a single line.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    const content = el.scrollHeight
    // Floor at ~2 lines (68px) so the composer opens roomy, grows to 160px.
    el.style.height = `${Math.min(Math.max(content, 68), 160)}px`
    // Only show a scrollbar once we've actually hit the max height; at the
    // floor, height == scrollHeight and the textarea's default overflow
    // would otherwise render a spurious scrollbar.
    el.style.overflowY = content > 160 ? 'auto' : 'hidden'
  }, [question])

  useEffect(() => {
    // Switching persona starts a fresh, unsaved conversation view.
    setMessages([])
    setQuestion('')
    setActiveCitation(null)
    setThreadId(null)
    autoAskedQueryRef.current = null
  }, [persona])

  // Load the user's saved conversations for the sidebar.
  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch('/api/ask/threads', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      if (Array.isArray(data?.threads)) setThreads(data.threads as AskThreadSummary[])
    } catch {
      // non-fatal — the sidebar simply shows no history
    } finally {
      setThreadsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadThreads()
  }, [loadThreads])

  const handleAsk = useCallback(async (questionText?: string) => {
    const q = questionText ?? question.trim()
    if (!q || isLoading) return

    setQuestion('')
    setIsLoading(true)

    const userMsg: Message = {
      id: createMessageId(),
      role: 'user',
      content: q,
      scopeLabel: selectedAircraftId === 'all'
        ? 'All aircraft'
        : (aircraft.find(a => a.id === selectedAircraftId)?.tail_number ?? 'This aircraft'),
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])

    try {
      // Conversation history is loaded server-side from the persisted thread —
      // the client only sends the thread id (null for a new conversation).
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          aircraft_id: selectedAircraftId === 'all' ? null : selectedAircraftId,
          persona,
          thread_id: threadId,
          // Opt into token streaming. The server streams NDJSON for a single
          // aircraft and returns JSON for "All Aircraft"; we branch on the
          // response Content-Type below so both work.
          stream: true,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}) as any)
        setMessages(prev => [...prev, {
          id: createMessageId(),
          role: 'assistant',
          content: errData.error ?? 'An error occurred. Please try again.',
          confidence: 'insufficient_evidence',
          citations: [],
          warningFlags: [],
          followUpQuestions: [],
          timestamp: new Date(),
        }])
        return
      }

      const contentType = res.headers.get('content-type') ?? ''
      const isStream = contentType.includes('application/x-ndjson') && !!res.body

      // Phase 2 — citations no longer auto-open. Opening the source preview is
      // an explicit user action (clicking a citation), so an answer never
      // hijacks the right-hand panel or reflows the conversation.

      if (isStream) {
        // ── Streamed answer (NDJSON). The assistant message is appended lazily
        //    on the first meta/token, so the "searching…" phase shows the bottom
        //    status spinner rather than an empty answer card. ──
        let assistantId: string | null = null
        const ensureMessage = () => {
          if (assistantId) return
          assistantId = createMessageId()
          setMessages(prev => [...prev, {
            id: assistantId!,
            role: 'assistant',
            content: '',
            confidence: undefined,
            citations: [],
            warningFlags: [],
            followUpQuestions: [],
            artifacts: [],
            timestamp: new Date(),
          }])
        }
        const patch = (p: Partial<Message>) =>
          setMessages(prev => prev.map(m => (m.id === assistantId ? { ...m, ...p } : m)))

        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        let doneEvent: any = null

        const processEvent = (evt: any) => {
          switch (evt.type) {
            case 'thread_id':
              if (typeof evt.thread_id === 'string') setThreadId(evt.thread_id)
              break
            case 'status':
              setStreamStatus(typeof evt.stage === 'string' ? evt.stage : null)
              break
            case 'meta':
              ensureMessage()
              patch({
                citations: evt.citations ?? [],
                confidence: evt.confidence,
                followUpQuestions: evt.follow_up_questions ?? [],
                artifacts: evt.artifacts ?? [],
              })
              break
            case 'token':
              ensureMessage()
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: m.content + (evt.text ?? '') } : m))
              break
            case 'reset':
              if (assistantId) patch({ content: '' })
              break
            case 'error':
              ensureMessage()
              patch({
                content: evt.message ?? 'An error occurred. Please try again.',
                confidence: 'insufficient_evidence',
              })
              break
            case 'done':
              doneEvent = evt
              break
          }
        }

        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? '' // keep the trailing partial line for the next read
          for (const rawLine of lines) {
            const line = rawLine.trim()
            if (!line) continue
            try { processEvent(JSON.parse(line)) } catch { /* skip malformed line */ }
          }
        }
        // Defensive: flush a final line that arrived without a trailing newline.
        const tail = buf.trim()
        if (tail) { try { processEvent(JSON.parse(tail)) } catch { /* ignore */ } }

        // The done event carries the authoritative bundle — replace whatever
        // streamed in with it (covers any token/render drift).
        if (doneEvent) {
          ensureMessage()
          patch({
            content: doneEvent.answer ?? '',
            citations: doneEvent.citations ?? [],
            confidence: doneEvent.confidence,
            followUpQuestions: doneEvent.follow_up_questions ?? [],
            warningFlags: doneEvent.warning_flags ?? [],
            artifacts: doneEvent.artifacts ?? [],
            perAircraft: Array.isArray(doneEvent.per_aircraft) ? doneEvent.per_aircraft : undefined,
          })
          if (typeof doneEvent.thread_id === 'string') {
            setThreadId(doneEvent.thread_id)
            void loadThreads()
          }
        }
      } else {
        // ── JSON answer ("All Aircraft", or any non-streaming response). ──
        const data = await res.json()
        const assistantMsg: Message = {
          id: createMessageId(),
          role: 'assistant',
          content: data.answer,
          confidence: data.confidence,
          citations: data.citations ?? [],
          warningFlags: data.warning_flags ?? [],
          followUpQuestions: data.follow_up_questions ?? [],
          artifacts: data.artifacts ?? [],
          // Only present for fanned-out "All Aircraft" answers; undefined otherwise.
          perAircraft: Array.isArray(data.per_aircraft) ? data.per_aircraft : undefined,
          timestamp: new Date(),
        }
        setMessages(prev => [...prev, assistantMsg])
        // Capture the (possibly newly-created) thread id so follow-ups continue
        // it, and refresh the sidebar so a new conversation shows up.
        if (typeof data.thread_id === 'string') {
          setThreadId(data.thread_id)
          void loadThreads()
        }
      }
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
      setStreamStatus(null)
      inputRef.current?.focus()
    }
  }, [isLoading, persona, question, selectedAircraftId, threadId, loadThreads])

  useEffect(() => {
    const queryQuestion = searchParams.get('q')?.trim() ?? ''
    if (!queryQuestion) return
    if (autoAskedQueryRef.current === queryQuestion) return
    if (messages.length > 0 || isLoading) return

    autoAskedQueryRef.current = queryQuestion
    setQuestion(queryQuestion)
    void handleAsk(queryQuestion)
  }, [handleAsk, isLoading, messages.length, searchParams])

  // Start a fresh, unsaved conversation (clears the in-view transcript; the
  // next message creates a new thread server-side).
  const startNewConversation = useCallback(() => {
    setMobileConvOpen(false)
    setMessages([])
    setThreadId(null)
    setActiveCitation(null)
    setQuestion('')
    inputRef.current?.focus()
  }, [])

  // Reopen a saved conversation: rehydrate the transcript (answer text,
  // citations, artifacts, per-aircraft sections) from persisted metadata and
  // restore the thread's aircraft scope.
  const openThread = useCallback(async (id: string) => {
    if (isLoading) return
    setMobileConvOpen(false)
    setThreadOpening(true)
    try {
      const res = await fetch(`/api/ask/threads/${id}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      const stored = Array.isArray(data?.messages) ? data.messages : []
      const rebuilt: Message[] = stored
        .map((m: any) => {
          const meta = (m?.metadata ?? {}) as Record<string, any>
          return {
            id: typeof m?.id === 'string' ? m.id : createMessageId(),
            role: m?.role === 'assistant' ? 'assistant' : 'user',
            content: typeof m?.content === 'string' ? m.content : '',
            confidence: meta.confidence ?? undefined,
            citations: Array.isArray(meta.citations) ? meta.citations : [],
            warningFlags: Array.isArray(meta.warning_flags) ? meta.warning_flags : [],
            followUpQuestions: Array.isArray(meta.follow_up_questions) ? meta.follow_up_questions : [],
            artifacts: Array.isArray(meta.artifacts) ? meta.artifacts : [],
            perAircraft: Array.isArray(meta.per_aircraft) ? meta.per_aircraft : undefined,
            timestamp: m?.created_at ? new Date(m.created_at) : new Date(),
          } as Message
        })
        // A failed turn persists an empty-content assistant row — skip it.
        .filter((m: Message) => m.role === 'user' || (m.content?.trim().length ?? 0) > 0)

      setMessages(rebuilt)
      setThreadId(id)
      setActiveCitation(null)
      const acId = data?.thread?.aircraft_id
      setSelectedAircraftId(typeof acId === 'string' && acId ? acId : 'all')
    } catch {
      // non-fatal — leave the current view untouched
    } finally {
      setThreadOpening(false)
    }
  }, [isLoading])

  // Soft-delete (archive) a saved conversation.
  const deleteThread = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/ask/threads/${id}`, { method: 'DELETE' })
      if (!res.ok) return
      setThreads((prev) => prev.filter((t) => t.id !== id))
      if (id === threadId) startNewConversation()
    } catch {
      // non-fatal
    }
  }, [threadId, startNewConversation])

  function handleCitationSelect(citation: AnswerCitation) {
    setActiveCitation(citation)
  }

  // Phase 3 — copy an answer's text to the clipboard.
  async function copyAnswer(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Answer copied')
    } catch {
      toast.error('Could not copy')
    }
  }

  // Enter sends; Shift+Enter inserts a newline (the composer is a textarea now).
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
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

  // Phase 1 — switching persona clears the in-view conversation (owner and
  // mechanic have different prompts + scope, and a thread is persona-scoped).
  // It used to do this silently; now we confirm when there's a conversation on
  // screen. The cleared thread is still saved server-side and reachable from
  // the Conversations list, so this guards against accidental loss, not data
  // loss. No prompt when the view is already empty.
  function requestPersonaSwitch(next: AskPersona) {
    if (next === persona) return
    if (messages.length > 0) {
      const label = next === 'shop' ? 'Mechanic' : 'Owner'
      const ok = window.confirm(
        `Switch to ${label} mode? This conversation is saved in your history; the view will clear for a fresh ${label.toLowerCase()} chat.`
      )
      if (!ok) return
    }
    setPersona(next)
  }

  // Conversation list shared by the desktop left rail and the mobile slide-over
  // drawer — one source of truth so the two stay in sync.
  const conversationsPanel = (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {persona === 'shop' && (
        <MechanicToolsPanel userRole={currentUserRole} aircraft={aircraft} />
      )}

      <div>
        {/* Full-width flat "New chat" button — reads clearly as the primary
            action (the old inline text link looked like stray text). */}
        <button
          onClick={startNewConversation}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 py-2 mb-3 text-[13px] text-primary hover:bg-primary/10 hover:border-primary/30 transition-colors"
          style={{ fontWeight: 600 }}
        >
          <Plus className="w-4 h-4" /> New chat
        </button>
        <h3 className="mb-2 text-[13px] text-foreground" style={{ fontWeight: 600 }}>Conversations</h3>
        {threadsLoading ? (
          /* Skeleton placeholder rows while the first fetch is in flight.
             Deterministic widths (no Math.random) to stay hydration-safe. */
          <div className="space-y-1" aria-hidden>
            {['78%', '62%', '70%', '55%', '66%'].map((w, i) => (
              <div key={i} className="px-3 py-1.5">
                <div className="h-3 rounded bg-muted animate-pulse" style={{ width: w }} />
                <div className="mt-1.5 h-2 w-1/3 rounded bg-muted/60 animate-pulse" />
              </div>
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div className="text-xs text-muted-foreground/70 flex items-center gap-2 px-1 py-2">
            <MessageSquare className="w-4 h-4" />
            No conversations yet.
          </div>
        ) : (
          <div className="space-y-3">
            {groupThreadsByRecency(threads).map((group) => (
              <div key={group.label}>
                <div className="px-1 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((t) => {
                    const isActive = t.id === threadId
                    const scope = t.aircraft_id == null
                      ? 'All aircraft'
                      : (aircraft.find((a) => a.id === t.aircraft_id)?.tail_number ?? null)
                    return (
                      <div
                        key={t.id}
                        className={`group relative flex items-start gap-1.5 rounded-lg pl-3 pr-1.5 py-1.5 transition-colors ${isActive ? 'bg-primary/10' : 'hover:bg-muted/50'}`}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary" />
                        )}
                        <button
                          onClick={() => openThread(t.id)}
                          className="flex-1 text-left min-w-0"
                        >
                          <div className={`text-[12px] truncate ${isActive ? 'text-primary' : 'text-foreground'}`} style={{ fontWeight: 500 }}>
                            {t.title || 'Conversation'}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground min-w-0">
                            {scope && (
                              <span className="inline-flex items-center gap-0.5 min-w-0 shrink">
                                <Plane className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate">{scope}</span>
                              </span>
                            )}
                            {scope && <span className="text-muted-foreground/40 shrink-0">·</span>}
                            <span className="shrink-0">{relativeTime(t.updated_at)}</span>
                          </div>
                        </button>
                        <button
                          onClick={() => deleteThread(t.id)}
                          className="self-center shrink-0 text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                          aria-label="Delete conversation"
                          title="Delete conversation"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

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

      {/* ── Mobile Conversations drawer (slide-over) ─────────────────────────
          Below lg the left rail is hidden, so this drawer is the only way to
          reach history / start a new chat on phones + tablets. Shares the same
          `conversationsPanel` as the desktop rail. */}
      {mobileConvOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileConvOpen(false)}
            aria-hidden
          />
          <aside className="relative flex flex-col w-[300px] max-w-[85%] bg-white border-r border-border shadow-xl">
            <div className="flex items-center justify-end p-2 border-b border-border shrink-0">
              <button
                onClick={() => setMobileConvOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                aria-label="Close conversations"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {conversationsPanel}
          </aside>
        </div>
      )}

      {/* Left panel: Conversations (+ mechanic tools for shop). The Ask page
          reads [collapsed nav] · [Conversations] · [chat], freeing the right
          side for the source preview. lg-only; below lg the drawer above
          surfaces the same list. */}
      <aside className="hidden lg:flex flex-col w-[300px] border-r border-border bg-white shrink-0">
        {conversationsPanel}
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 sm:px-6 py-3 sm:py-3.5 border-b border-border bg-white flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <Sparkles className="w-5 h-5 text-primary shrink-0" />
            <h1 className="text-[15px] text-foreground truncate" style={{ fontWeight: 700 }}>Ask Your Aircraft</h1>
          </div>
          {/* Mobile/tablet: history + new chat as icon buttons on the right
              (the desktop Conversations rail holds these on lg+). */}
          <div className="lg:hidden flex items-center gap-1 shrink-0">
            <button
              onClick={() => setMobileConvOpen(true)}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
              aria-label="Open conversations"
              title="Conversations"
            >
              <MessageSquare className="w-5 h-5" />
            </button>
            <button
              onClick={startNewConversation}
              className="p-1.5 rounded-lg text-primary hover:bg-primary/5 transition-colors"
              aria-label="New conversation"
              title="New conversation"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 sm:p-6">
          {threadOpening ? (
            /* Skeleton while a saved conversation's messages are fetched —
               mirrors the user-bubble + assistant-card layout. */
            <div className="max-w-2xl mx-auto space-y-4" aria-hidden>
              <div className="flex justify-end">
                <div className="h-9 w-2/5 rounded-2xl rounded-br-md bg-muted animate-pulse" />
              </div>
              <div className="bg-white rounded-2xl rounded-bl-md border border-border p-5 space-y-3">
                {['100%', '92%', '84%', '68%'].map((w, i) => (
                  <div key={i} className="h-3 rounded bg-muted animate-pulse" style={{ width: w }} />
                ))}
              </div>
              <div className="flex justify-end">
                <div className="h-9 w-1/3 rounded-2xl rounded-br-md bg-muted animate-pulse" />
              </div>
              <div className="bg-white rounded-2xl rounded-bl-md border border-border p-5 space-y-3">
                {['96%', '88%', '60%'].map((w, i) => (
                  <div key={i} className="h-3 rounded bg-muted animate-pulse" style={{ width: w }} />
                ))}
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="max-w-2xl mx-auto text-center pt-16">
              {noDocumentsForAircraft ? (
                /* Selected aircraft has zero uploaded documents — the AI has
                   nothing to read, so guide the user instead of inviting
                   questions that can't be answered. */
                <>
                  <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-5">
                    <FileText className="w-8 h-8 text-amber-500" />
                  </div>
                  <h2 className="text-[20px] text-foreground mb-2" style={{ fontWeight: 700 }}>
                    No documents uploaded for {selectedAircraft?.tail_number ?? 'this aircraft'}
                  </h2>
                  <p className="text-[14px] text-muted-foreground mb-6 max-w-md mx-auto">
                    The AI answers from uploaded records, and there are none for{' '}
                    {selectedAircraft?.tail_number ?? 'this aircraft'} yet. Upload its
                    documents, or ask across your whole fleet.
                  </p>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <button
                      onClick={() => router.push('/documents')}
                      className="inline-flex items-center gap-1.5 bg-primary text-white text-[13px] px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors"
                      style={{ fontWeight: 500 }}
                    >
                      <FileText className="w-4 h-4" /> Upload documents
                    </button>
                    <button
                      onClick={() => handleAircraftChange('all')}
                      className="inline-flex items-center gap-1.5 bg-white border border-border text-foreground text-[13px] px-4 py-2 rounded-xl hover:bg-muted/50 transition-colors"
                      style={{ fontWeight: 500 }}
                    >
                      <Plane className="w-4 h-4 text-primary" /> Ask across all aircraft
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-primary/8 flex items-center justify-center mx-auto mb-5">
                    <Sparkles className="w-8 h-8 text-primary" />
                  </div>
                  <h2 className="text-[20px] text-foreground mb-2" style={{ fontWeight: 700 }}>
                    {persona === 'shop' ? 'What maintenance help do you need?' : 'What would you like to know?'}
                  </h2>
                  <p className="text-[14px] text-muted-foreground mb-8">
                    {emptyStateDescription}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg mx-auto">
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
                </>
              )}
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-4" aria-live="polite">
              {messages.map((msg, mi) => {
                const isLast = mi === messages.length - 1
                // While streaming, an assistant message with no text yet is
                // represented by the composing bubble below — skip its empty card.
                if (msg.role === 'assistant' && isLoading && isLast && !msg.content) return null
                return (
                <div key={msg.id}>
                  {msg.role === 'user' ? (
                    <div className="flex flex-col items-end gap-1">
                      <div className="bg-primary text-white rounded-2xl rounded-br-md px-4 py-3 max-w-md text-[13px]">
                        {msg.content}
                      </div>
                      {msg.scopeLabel && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground pr-1">
                          <Plane className="w-2.5 h-2.5" /> {msg.scopeLabel}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl rounded-bl-md border border-border p-5 space-y-4">
                      <div className="text-[13px] text-foreground leading-relaxed">
                        <AnswerBlock
                          answer={msg.content}
                          confidence={msg.confidence}
                          citations={msg.citations ?? []}
                          warningFlags={msg.warningFlags ?? []}
                          followUpQuestions={msg.followUpQuestions ?? []}
                          perAircraft={msg.perAircraft}
                          onCitationClick={handleCitationSelect}
                          onFollowUp={handleAsk}
                          streaming={isLoading && isLast}
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
                            const isActive = activeCitation?.chunkId === c.chunkId && !!c.chunkId
                            const baseClass = isActive
                              ? 'inline-flex items-center gap-1 text-[11px] bg-primary text-white px-2.5 py-1 rounded-full ring-2 ring-primary/40 transition-colors'
                              : 'inline-flex items-center gap-1 text-[11px] bg-primary/8 text-primary px-2.5 py-1 rounded-full hover:bg-primary/15 transition-colors'
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
                        </div>
                      )}
                      {/* Phase 3 — answer footer: timestamp + copy. */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-muted-foreground/70">
                          {msg.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </span>
                        <button
                          onClick={() => copyAnswer(msg.content)}
                          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Copy answer"
                        >
                          <Copy className="w-3 h-3" /> Copy
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                )
              })}

              {/* Composing bubble — shown while the assistant has no visible text
                  yet (thinking / searching / before the first token). Replaces the
                  old detached spinner; once tokens stream, the answer card with its
                  blinking caret takes over. */}
              {isLoading && (() => {
                const last = messages[messages.length - 1]
                if (last && last.role === 'assistant' && last.content) return null
                return (
                  <div className="flex">
                    <div className="inline-flex items-center gap-2.5 bg-white rounded-2xl rounded-bl-md border border-border px-4 py-3">
                      <span className="flex items-center gap-1" aria-hidden>
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" />
                      </span>
                      <span className="text-[13px] text-muted-foreground">
                        {(streamStatus && STREAM_STATUS_LABELS[streamStatus]) ?? 'Working on it…'}
                      </span>
                    </div>
                  </div>
                )
              })()}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Floating composer — the input is an elevated rounded card (not a
            bordered bottom bar), with the aircraft scope + persona toggle inline
            (moved out of the header) so the controls sit at the point of action. */}
        <div className="px-4 pb-4 pt-2 bg-background">
          {/* Phase 2 — keep a compact suggestion row reachable after the first
              message (the full prompt grid only shows on the empty state). */}
          {messages.length > 0 && (
            <div className="max-w-2xl mx-auto mb-2 flex gap-1.5 overflow-x-auto no-scrollbar">
              {suggestedPrompts.slice(0, 4).map((p) => (
                <button
                  key={p}
                  onClick={() => handleAsk(p)}
                  disabled={isLoading}
                  className="shrink-0 text-[11px] text-muted-foreground bg-white border border-border rounded-full px-3 py-1 hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          <div className="max-w-2xl mx-auto rounded-2xl border border-border bg-white shadow-lg">
            <textarea
              ref={inputRef}
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={inputPlaceholder}
              rows={1}
              className="block w-full bg-transparent text-[14px] outline-none border-0 shadow-none resize-none overflow-hidden max-h-40 leading-relaxed px-4 pt-3.5 pb-2 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground"
              maxLength={2000}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 pb-2.5">
              {/* Scope + persona — moved out of the header to the point of action. */}
              <div className="flex items-center gap-1.5 min-w-0">
                <Select value={selectedAircraftId} onValueChange={handleAircraftChange}>
                  <SelectTrigger className="h-8 w-auto max-w-[180px] min-w-0 gap-1.5 bg-muted/50 border border-border rounded-lg px-2.5 text-[12px]" style={{ fontWeight: 500 }}>
                    <Plane className="w-3.5 h-3.5 text-primary shrink-0" />
                    {/* Compact trigger label — just the tail (or "All aircraft"); the
                        rich make/model detail stays in the dropdown items. The
                        SelectTrigger renders its own chevron, so we don't add one. */}
                    <span className="truncate">
                      {selectedAircraftId === 'all'
                        ? 'All aircraft'
                        : (aircraft.find((a) => a.id === selectedAircraftId)?.tail_number ?? 'Aircraft')}
                    </span>
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
                {canUseMechanicPersona && (
                  <div className="inline-flex items-center rounded-lg border border-border bg-muted/30 p-0.5 shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      variant={persona === 'owner' ? 'default' : 'ghost'}
                      className="h-7 px-2.5 text-[11px]"
                      onClick={() => requestPersonaSwitch('owner')}
                    >
                      Owner
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={persona === 'shop' ? 'default' : 'ghost'}
                      className="h-7 px-2.5 text-[11px]"
                      onClick={() => requestPersonaSwitch('shop')}
                    >
                      Mechanic
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-auto">
                {/* Dictate into the box (fills the textarea; the user reviews, then sends). */}
                <VoiceButton
                  variant="inline"
                  classifyIntent={false}
                  onResult={({ transcript }) => {
                    const t = (transcript ?? '').trim()
                    if (!t) return
                    setQuestion(prev => (prev.trim() ? `${prev.trim()} ${t}` : t))
                    inputRef.current?.focus()
                  }}
                />
                <button
                  onClick={() => handleAsk()}
                  disabled={!question.trim() || isLoading}
                  aria-label={isLoading ? "Sending question…" : "Send question"}
                  title={isLoading ? "Sending…" : "Send (Enter)"}
                  className="bg-primary text-white h-8 w-8 flex items-center justify-center rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
          <p className="max-w-2xl mx-auto mt-2 text-[11px] text-muted-foreground/60 text-center">
            AI-generated from your records — not FAA compliance advice. Verify with a certified A&P or FSDO for airworthiness determinations.
          </p>
        </div>
      </div>

      {/* Right side: source preview, shown on demand when a citation is clicked.
          Conversations moved to the left panel, so this panel is source-only and
          only mounts while a citation is open. */}
      {activeCitation && (
        <div className="hidden lg:flex flex-col w-[38%] min-w-[320px] max-w-[480px] border-l border-border bg-white">
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
      )}
    </div>
  )
}
