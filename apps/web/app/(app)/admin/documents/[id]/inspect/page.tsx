/**
 * /admin/documents/[id]/inspect — Pipeline Inspector for one document.
 *
 * Lets a platform admin see the actual *content* produced at every stage of
 * the ingestion pipeline for a single document, not just stage timings.
 * Built for debugging: "what text did OCR produce? how many chunks? where
 * did they split? what Wave-2 context blurb was added? do embeddings exist?"
 *
 * Tab navigation is plain ?tab= query-string so each tab is a fresh server
 * render — no client state, no API surface to maintain, easy to link to.
 *
 * Auth: the /admin layout already gates on is_platform_admin. We re-check
 * cheaply for defense in depth.
 */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Topbar } from '@/components/shared/topbar'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { confidenceBand, AUTO_RESOLVE_THRESHOLD } from '@/lib/ocr/rescore'
import { AlertTriangle, CheckCircle2, FileText, Layers } from 'lucide-react'
import { InspectPdfPane } from '@/components/admin/inspect-pdf-pane'
import type { UserProfile } from '@/types'

export const metadata = { title: 'Pipeline Inspector · Admin' }
export const dynamic = 'force-dynamic'

type Tab = 'summary' | 'ocr' | 'chunks' | 'canonical' | 'events'
const TAB_LABELS: Record<Tab, string> = {
  summary: 'Summary',
  ocr: 'OCR',
  chunks: 'Chunks',
  canonical: 'Canonical + Context',
  events: 'Extracted events',
}

function asTab(value: string | string[] | undefined): Tab {
  const v = Array.isArray(value) ? value[0] : value
  if (v === 'ocr' || v === 'chunks' || v === 'canonical' || v === 'events') return v
  return 'summary'
}

function asPositiveInt(value: string | string[] | undefined, fallback: number): number {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return fallback
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/**
 * Build the inspector URL preserving the current tab. Used by per-item "→ p.N"
 * jump links so clicking a chunk navigates the PDF pane without leaving the
 * current tab or losing scroll position. Always include tab so the URL is
 * self-contained and shareable.
 */
function inspectHref(docId: string, tab: Tab, page: number, chunkId?: string): string {
  const params = new URLSearchParams()
  params.set('tab', tab)
  params.set('page', String(page))
  if (chunkId) params.set('chunk', chunkId)
  return `/admin/documents/${docId}/inspect?${params.toString()}`
}

function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return '—'
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`
  return `${Math.round(ms / 86_400_000)}d ago`
}

function bandTone(score: number | null): string {
  if (score === null) return 'bg-slate-100 text-slate-600 border-slate-200'
  const band = confidenceBand(score)
  if (band === 'auto') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (band === 'low') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (band === 'medium') return 'bg-orange-50 text-orange-700 border-orange-200'
  return 'bg-red-50 text-red-700 border-red-200'
}

interface InspectPageProps {
  params: { id: string }
  searchParams: Record<string, string | string[] | undefined>
}

export default async function InspectPage({ params, searchParams }: InspectPageProps) {
  const tab = asTab(searchParams.tab)
  const activePage = asPositiveInt(searchParams.page, 1)
  const activeChunk = (Array.isArray(searchParams.chunk) ? searchParams.chunk[0] : searchParams.chunk) ?? null

  // Profile for the topbar. /admin layout already enforced is_platform_admin
  // but we re-verify here so a misconfigured route can never leak.
  const authClient = createServerSupabase()
  const {
    data: { user },
  } = await authClient.auth.getUser()
  if (!user) redirect('/login')
  const { data: profileRow } = await authClient
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  const profile = (profileRow ?? {}) as UserProfile
  if (!profile?.is_platform_admin) redirect('/dashboard')

  const service = createServiceSupabase()
  const { data: docRow } = await service
    .from('documents')
    .select(
      `id, title, file_name, doc_type, page_count, aircraft_id, organization_id,
       parsing_status, parse_error, parse_started_at, uploaded_at, updated_at,
       needs_human_review, human_review_reason, processing_state,
       organizations(name), aircraft:aircraft_id(tail_number, make, model)`,
    )
    .eq('id', params.id)
    .maybeSingle()
  if (!docRow) notFound()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Document Pipeline', href: '/admin/documents' },
          { label: 'Inspect' },
        ]}
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1600px] mx-auto space-y-4">
          <DocHeader doc={docRow as any} />
          <TabNav active={tab} docId={params.id} />
          {/* Two-column: tab content left, PDF source right. The PDF stays
              sticky so the user can scroll a long chunk list while keeping
              the source page visible. On narrow viewports the columns stack. */}
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
            <div className="min-w-0">
              {tab === 'summary' && <SummaryTab docId={params.id} doc={docRow as any} />}
              {tab === 'ocr' && (
                <OcrTab docId={params.id} activeTab={tab} activePage={activePage} />
              )}
              {tab === 'chunks' && (
                <ChunksTab docId={params.id} activeTab={tab} activePage={activePage} />
              )}
              {tab === 'canonical' && (
                <CanonicalTab docId={params.id} activeTab={tab} activePage={activePage} />
              )}
              {tab === 'events' && (
                <EventsTab docId={params.id} activeTab={tab} activePage={activePage} />
              )}
            </div>
            <div className="xl:sticky xl:top-4 xl:self-start xl:h-[calc(100vh-9rem)] min-h-[36rem]">
              <InspectPdfPane
                documentId={params.id}
                documentTitle={(docRow as any).title ?? (docRow as any).file_name ?? 'Document'}
                docType={((docRow as any).doc_type as string | null) ?? null}
                pageNumber={activePage}
                chunkId={activeChunk}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

// ─── Header strip ──────────────────────────────────────────────────────────

function DocHeader({ doc }: { doc: any }) {
  const orgName = Array.isArray(doc.organizations)
    ? doc.organizations[0]?.name
    : doc.organizations?.name
  const aircraft = Array.isArray(doc.aircraft) ? doc.aircraft[0] : doc.aircraft
  const tail = aircraft?.tail_number
  const status = doc.parsing_status ?? 'unknown'

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
        <FileText className="h-5 w-5 text-blue-600" />
        {doc.title || doc.file_name || '(untitled)'}
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        {orgName ?? '—'}
        {tail ? ` · ${tail}` : ''}
        {doc.doc_type ? ` · ${doc.doc_type}` : ''}
        {doc.page_count ? ` · ${doc.page_count} pages` : ''}
        {' · status '}
        <span className="font-mono">{status}</span>
        {' · uploaded '}
        {fmtAgo(doc.uploaded_at)}
      </p>
      {doc.parse_error && (
        <pre className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 whitespace-pre-wrap break-words">
          {doc.parse_error}
        </pre>
      )}
      {doc.needs_human_review && (
        <div className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 flex gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            <strong>Needs human review.</strong> {doc.human_review_reason ?? ''}
          </span>
        </div>
      )}
    </div>
  )
}

function TabNav({ active, docId }: { active: Tab; docId: string }) {
  const tabs: Tab[] = ['summary', 'ocr', 'chunks', 'canonical', 'events']
  return (
    <div className="border-b border-border flex items-center gap-1">
      {tabs.map((t) => (
        <Link
          key={t}
          href={`/admin/documents/${docId}/inspect?tab=${t}`}
          className={
            'px-3 py-2 text-sm border-b-2 -mb-px transition-colors ' +
            (active === t
              ? 'border-blue-600 text-foreground font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground')
          }
        >
          {TAB_LABELS[t]}
        </Link>
      ))}
    </div>
  )
}

// ─── Summary tab ──────────────────────────────────────────────────────────

async function SummaryTab({ docId, doc }: { docId: string; doc: any }) {
  const service = createServiceSupabase()
  // Embedding count needs canonical chunk ids (PostgREST can't do subqueries),
  // so it runs sequentially after the parallel fan-out below.
  const [progressRes, pagesRes, chunksRes, canonicalRes, eventsRes] = await Promise.all([
    service
      .from('ingestion_progress')
      .select('stage, stage_started_at, stage_completed_at, error_message')
      .eq('document_id', docId)
      .order('stage_started_at', { ascending: true }),
    service
      .from('document_pages')
      .select('page_number, ocr_confidence', { count: 'exact' })
      .eq('document_id', docId),
    service
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', docId),
    service
      .from('canonical_document_chunks')
      .select('id, context_text', { count: 'exact' })
      .eq('document_id', docId),
    service
      .from('ocr_extracted_events')
      .select('id, review_status', { count: 'exact' })
      .eq('document_id', docId),
  ])

  const canonicalIds = ((canonicalRes.data ?? []) as Array<{ id: string }>).map((r) => r.id)
  let embCount = 0
  if (canonicalIds.length > 0) {
    const { count } = await service
      .from('canonical_document_embeddings')
      .select('chunk_id', { count: 'exact', head: true })
      .in('chunk_id', canonicalIds)
    embCount = count ?? 0
  }

  const pages = (pagesRes.data ?? []) as Array<{ page_number: number; ocr_confidence: number | null }>
  const avgConf = pages.length
    ? pages.reduce((a, p) => a + (p.ocr_confidence ?? 0), 0) / pages.length
    : null
  const lowConfPages = pages.filter((p) => (p.ocr_confidence ?? 1) < AUTO_RESOLVE_THRESHOLD).length

  const canonicalRows = (canonicalRes.data ?? []) as Array<{ id: string; context_text: string | null }>
  const contextualizedCount = canonicalRows.filter((r) => !!r.context_text).length

  const events = (eventsRes.data ?? []) as Array<{ id: string; review_status: string | null }>
  const approvedEvents = events.filter((e) => e.review_status === 'approved').length
  const pendingEvents = events.filter((e) => e.review_status === 'pending').length

  return (
    <div className="space-y-4">
      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="OCR pages" value={pages.length} />
        <Stat
          label="Avg OCR confidence"
          value={avgConf === null ? '—' : avgConf.toFixed(2)}
          sub={lowConfPages > 0 ? `${lowConfPages} below ${AUTO_RESOLVE_THRESHOLD}` : 'all above threshold'}
        />
        <Stat label="document_chunks" value={chunksRes.count ?? 0} />
        <Stat
          label="canonical_chunks"
          value={canonicalRes.count ?? 0}
          sub={`${contextualizedCount} with context_text`}
        />
        <Stat
          label="canonical embeddings"
          value={embCount}
          sub={
            (canonicalRes.count ?? 0) > 0 && embCount < (canonicalRes.count ?? 0)
              ? `⚠ ${(canonicalRes.count ?? 0) - embCount} missing`
              : 'all chunks embedded'
          }
        />
        <Stat
          label="Extracted events"
          value={events.length}
          sub={`${approvedEvents} approved · ${pendingEvents} pending`}
        />
        <Stat
          label="Doc type"
          value={(doc.doc_type as string | null) ?? '—'}
        />
        <Stat
          label="Aircraft-scoped"
          value={doc.aircraft_id ? 'yes' : 'reference (org)'}
        />
      </div>

      {/* Pipeline stage timeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-600" /> Pipeline stages
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(progressRes.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No per-stage progress recorded for this document.
            </p>
          ) : (
            <ol className="space-y-2">
              {((progressRes.data ?? []) as Array<{
                stage: string
                stage_started_at: string
                stage_completed_at: string | null
                error_message: string | null
              }>).map((s, i) => {
                const completed = !!s.stage_completed_at
                const err = !!s.error_message
                return (
                  <li key={`${s.stage}-${i}`} className="flex items-start gap-2 text-sm">
                    {err ? (
                      <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                    ) : completed ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <span className="inline-block h-4 w-4 rounded-full border-2 border-blue-500 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-foreground">{s.stage}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {fmtAgo(s.stage_started_at)}
                        {s.stage_completed_at ? ` → ${fmtAgo(s.stage_completed_at)}` : ' · in progress'}
                      </span>
                      {s.error_message && (
                        <pre className="mt-1 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-1.5 whitespace-pre-wrap break-words">
                          {s.error_message}
                        </pre>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xl font-bold text-foreground tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

/**
 * Tiny pill link that navigates the side PDF pane to a specific page.
 * `scroll={false}` keeps the inspector's scroll position so the user can
 * keep clicking through chunks without jumping to the top each time.
 * The active page gets an emerald tint so the user can tell which chunk
 * corresponds to the page they're currently looking at on the right.
 */
function JumpToPage({
  docId,
  tab,
  page,
  active,
  chunkId,
}: {
  docId: string
  tab: Tab
  page: number
  active: boolean
  chunkId?: string
}) {
  const tone = active
    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold'
    : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
  return (
    <Link
      href={inspectHref(docId, tab, page, chunkId)}
      scroll={false}
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border ${tone}`}
      title={active ? 'Currently shown in the PDF pane' : `Show page ${page} in the PDF pane`}
    >
      → p.{page}
    </Link>
  )
}

// ─── OCR tab ───────────────────────────────────────────────────────────────

async function OcrTab({
  docId,
  activeTab,
  activePage,
}: {
  docId: string
  activeTab: Tab
  activePage: number
}) {
  const service = createServiceSupabase()

  // document_pages is the lean per-page row written by every ingestion path
  // (text-native + OCR). ocr_page_jobs is the richer multi-engine record
  // written only when OCR actually ran — engines tried, arbitration verdict,
  // page image path, classification. Treat ocr_page_jobs as best-effort and
  // merge per page_number; many docs (text-native PDFs, reference manuals)
  // never get a job row at all.
  //
  // IMPORTANT: surface query errors as a card. A silent error here looks
  // identical to "no rows" and we already shipped one such bug.
  const [pagesRes, jobsRes] = await Promise.all([
    service
      .from('document_pages')
      .select('page_number, page_text, ocr_confidence, word_count, char_count')
      .eq('document_id', docId)
      .order('page_number', { ascending: true }),
    service
      .from('ocr_page_jobs')
      .select(
        'page_number, ocr_raw_text, ocr_confidence, page_classification, page_image_path, arbitration_confidence, arbitration_status, engines_run, extraction_status, needs_human_review',
      )
      .eq('document_id', docId)
      .order('page_number', { ascending: true }),
  ])

  if (pagesRes.error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm">
          <p className="text-red-700 font-semibold mb-1">document_pages query failed</p>
          <pre className="text-xs bg-red-50 border border-red-200 rounded p-2 whitespace-pre-wrap">
            {pagesRes.error.message}
          </pre>
        </CardContent>
      </Card>
    )
  }

  type PageRow = {
    page_number: number
    page_text: string | null
    ocr_confidence: number | null
    word_count: number | null
    char_count: number | null
  }
  type JobRow = {
    page_number: number
    ocr_raw_text: string | null
    ocr_confidence: number | null
    page_classification: string | null
    page_image_path: string | null
    arbitration_confidence: number | null
    arbitration_status: string | null
    engines_run: string[] | null
    extraction_status: string | null
    needs_human_review: boolean | null
  }

  const pages = (pagesRes.data ?? []) as PageRow[]
  const jobByPage = new Map<number, JobRow>(
    ((jobsRes.data ?? []) as JobRow[]).map((j) => [j.page_number, j]),
  )

  if (pages.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          No <code>document_pages</code> rows for this document yet. If you can see chunks
          in the <strong>Chunks</strong> tab, those came from a text-native PDF that
          skipped both OCR and the per-page row write — odd but not an error.
        </CardContent>
      </Card>
    )
  }

  const enrichedCount = pages.filter((p) => jobByPage.has(p.page_number)).length

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {pages.length} OCR page{pages.length === 1 ? '' : 's'}
        {enrichedCount > 0
          ? ` · ${enrichedCount} enriched from ocr_page_jobs (engine, classification, arbitration)`
          : ' · no ocr_page_jobs rows (text-native PDF or older ingestion path)'}.
        Confidence colour bands match the review-queue rescore: ≥{AUTO_RESOLVE_THRESHOLD} auto-pass ·
        0.6–{AUTO_RESOLVE_THRESHOLD} low · 0.3–0.6 medium · &lt;0.3 critical.
      </p>
      <div className="space-y-2">
        {pages.map((p) => {
          const job = jobByPage.get(p.page_number)
          // Prefer ocr_raw_text from the job (the multi-engine arbitrated
          // string) and fall back to page_text from document_pages.
          const text = job?.ocr_raw_text ?? p.page_text ?? ''
          const conf = p.ocr_confidence ?? job?.ocr_confidence ?? null
          return (
            <details
              key={p.page_number}
              className={
                'rounded-xl border bg-card ' +
                (p.page_number === activePage
                  ? 'border-emerald-300 ring-1 ring-emerald-200'
                  : 'border-border')
              }
            >
              <summary className="cursor-pointer px-4 py-3 flex items-center gap-3 text-sm list-none">
                <span className="font-mono text-xs text-muted-foreground w-12 shrink-0">
                  p.{p.page_number}
                </span>
                <JumpToPage
                  docId={docId}
                  tab={activeTab}
                  page={p.page_number}
                  active={p.page_number === activePage}
                />
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${bandTone(conf)}`}
                >
                  conf {conf === null ? '—' : conf.toFixed(2)}
                </span>
                {job?.page_classification && (
                  <span className="text-[11px] text-muted-foreground">
                    {job.page_classification}
                  </span>
                )}
                {job?.engines_run && job.engines_run.length > 0 && (
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {job.engines_run.join('+')}
                  </span>
                )}
                {job?.needs_human_review && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border bg-amber-50 text-amber-700 border-amber-200">
                    review
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground">{text.length} chars</span>
                <span className="ml-auto text-xs text-muted-foreground truncate max-w-[36rem]">
                  {text.slice(0, 120).replace(/\s+/g, ' ')}
                </span>
              </summary>
              <div className="px-4 pb-4 border-t border-border space-y-2">
                {job && (
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] mt-2">
                    {job.arbitration_status && (
                      <>
                        <dt className="text-muted-foreground">arbitration_status</dt>
                        <dd className="font-mono">{job.arbitration_status}</dd>
                      </>
                    )}
                    {job.arbitration_confidence != null && (
                      <>
                        <dt className="text-muted-foreground">arbitration_confidence</dt>
                        <dd className="font-mono">{Number(job.arbitration_confidence).toFixed(2)}</dd>
                      </>
                    )}
                    {job.extraction_status && (
                      <>
                        <dt className="text-muted-foreground">extraction_status</dt>
                        <dd className="font-mono">{job.extraction_status}</dd>
                      </>
                    )}
                    {(p.word_count != null || p.char_count != null) && (
                      <>
                        <dt className="text-muted-foreground">word / char count</dt>
                        <dd className="font-mono">
                          {p.word_count ?? '?'} / {p.char_count ?? '?'}
                        </dd>
                      </>
                    )}
                    {job.page_image_path && (
                      <>
                        <dt className="text-muted-foreground">image</dt>
                        <dd className="font-mono break-all">{job.page_image_path}</dd>
                      </>
                    )}
                  </dl>
                )}
                <pre className="text-xs bg-slate-50 border border-slate-200 rounded p-2 whitespace-pre-wrap break-words max-h-96 overflow-auto">
                  {text || '(no OCR text)'}
                </pre>
              </div>
            </details>
          )
        })}
      </div>
    </div>
  )
}

// ─── Chunks tab ───────────────────────────────────────────────────────────

async function ChunksTab({
  docId,
  activeTab,
  activePage,
}: {
  docId: string
  activeTab: Tab
  activePage: number
}) {
  const service = createServiceSupabase()
  // PostgREST 1000-row default cap — page through all chunks so the inspector
  // doesn't silently truncate on large scans. Same pagination as ingestion.
  const all: Array<{
    id: string
    page_number: number
    page_number_end: number | null
    chunk_index: number
    section_title: string | null
    chunk_text: string | null
    token_count: number | null
    char_count: number | null
    metadata_json: any
  }> = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data } = await service
      .from('document_chunks')
      .select(
        'id, page_number, page_number_end, chunk_index, section_title, chunk_text, token_count, char_count, metadata_json',
      )
      .eq('document_id', docId)
      .order('chunk_index', { ascending: true })
      .range(from, from + PAGE - 1)
    if (!data || data.length === 0) break
    all.push(...(data as any[]))
    if (data.length < PAGE) break
  }

  if (all.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          No <code>document_chunks</code> for this document. If the pipeline reached the
          chunking stage successfully, something is wrong upstream.
        </CardContent>
      </Card>
    )
  }

  const tokens = all.map((c) => c.token_count ?? 0).filter((n) => n > 0)
  const avgTok = tokens.length ? Math.round(tokens.reduce((a, b) => a + b, 0) / tokens.length) : null
  const minTok = tokens.length ? Math.min(...tokens) : null
  const maxTok = tokens.length ? Math.max(...tokens) : null

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Chunks" value={all.length} />
        <Stat label="Avg tokens" value={avgTok ?? '—'} />
        <Stat label="Min tokens" value={minTok ?? '—'} />
        <Stat label="Max tokens" value={maxTok ?? '—'} />
      </div>
      <p className="text-xs text-muted-foreground">
        Page-break markers (▸) appear where the splitter crossed onto a new page. Inspect those
        boundaries to verify the splitter didn’t cut mid-sentence or merge unrelated sections.
      </p>
      <div className="space-y-2">
        {all.map((c, i) => {
          const prev = i > 0 ? all[i - 1] : null
          const pageBreak = prev && prev.page_number !== c.page_number
          return (
            <details
              key={c.id}
              className={
                'rounded-xl border bg-card ' +
                (c.page_number === activePage
                  ? 'border-emerald-300 ring-1 ring-emerald-200'
                  : 'border-border')
              }
            >
              <summary className="cursor-pointer px-4 py-2.5 flex items-center gap-3 text-sm list-none">
                <span className="font-mono text-xs text-muted-foreground w-16 shrink-0">
                  #{c.chunk_index}
                </span>
                <JumpToPage
                  docId={docId}
                  tab={activeTab}
                  page={c.page_number}
                  active={c.page_number === activePage}
                  chunkId={c.id}
                />
                <span className="text-[11px] text-muted-foreground">
                  p.{c.page_number}
                  {c.page_number_end && c.page_number_end !== c.page_number
                    ? `–${c.page_number_end}`
                    : ''}
                </span>
                {pageBreak && (
                  <span className="text-[11px] text-blue-600">▸ new page</span>
                )}
                <span className="text-[11px] text-muted-foreground">
                  {c.token_count ?? '?'} tok · {c.char_count ?? c.chunk_text?.length ?? 0} chars
                </span>
                {c.section_title && (
                  <span className="text-[11px] text-foreground italic truncate max-w-[20rem]">
                    {c.section_title}
                  </span>
                )}
                <span className="ml-auto text-xs text-muted-foreground truncate max-w-[32rem]">
                  {(c.chunk_text ?? '').slice(0, 120).replace(/\s+/g, ' ')}
                </span>
              </summary>
              <div className="px-4 pb-3 border-t border-border">
                <pre className="mt-2 text-xs bg-slate-50 border border-slate-200 rounded p-2 whitespace-pre-wrap break-words max-h-72 overflow-auto">
                  {c.chunk_text || '(empty)'}
                </pre>
              </div>
            </details>
          )
        })}
      </div>
    </div>
  )
}

// ─── Canonical + Context tab ─────────────────────────────────────────────

async function CanonicalTab({
  docId,
  activeTab,
  activePage,
}: {
  docId: string
  activeTab: Tab
  activePage: number
}) {
  const service = createServiceSupabase()

  // Page through canonical chunks — same 1000-row PostgREST safety as Chunks tab.
  type CanonicalRow = {
    id: string
    page_number: number
    chunk_index: number
    section_title: string | null
    chunk_text: string | null
    context_text: string | null
    created_at: string | null
  }
  const all: CanonicalRow[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data } = await service
      .from('canonical_document_chunks')
      .select(
        'id, page_number, chunk_index, section_title, chunk_text, context_text, created_at',
      )
      .eq('document_id', docId)
      .order('chunk_index', { ascending: true })
      .range(from, from + PAGE - 1)
    if (!data || data.length === 0) break
    all.push(...(data as CanonicalRow[]))
    if (data.length < PAGE) break
  }

  // Raw chunks count for the "promoted X of Y" stat.
  const { count: rawCount } = await service
    .from('document_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', docId)

  // Which canonical chunks have embeddings (1 row per chunk_id).
  const ids = all.map((c) => c.id)
  const embPresent = new Set<string>()
  if (ids.length > 0) {
    const { data: embRows } = await service
      .from('canonical_document_embeddings')
      .select('chunk_id')
      .in('chunk_id', ids)
    for (const r of (embRows ?? []) as Array<{ chunk_id: string }>) {
      embPresent.add(r.chunk_id)
    }
  }

  if (all.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          No <code>canonical_document_chunks</code> for this document. Either canonicalization
          hasn’t run, or every chunk was filtered out (e.g. OCR confidence below the threshold
          and no human approval).
          {rawCount ? (
            <span className="block mt-2">
              The raw layer has <strong>{rawCount}</strong> chunks — they’re visible in the
              <Link href="?tab=chunks" className="text-blue-600 hover:underline ml-1">
                Chunks
              </Link>{' '}
              tab but won’t participate in vector retrieval.
            </span>
          ) : null}
        </CardContent>
      </Card>
    )
  }

  const contextualized = all.filter((c) => !!c.context_text).length
  const embedded = all.filter((c) => embPresent.has(c.id)).length
  const promoted = rawCount && rawCount > 0 ? `${all.length} of ${rawCount}` : `${all.length}`

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Promoted to canonical" value={promoted} />
        <Stat
          label="With context_text (Wave 2)"
          value={contextualized}
          sub={
            contextualized < all.length
              ? `⚠ ${all.length - contextualized} missing — contextualizeCanonicalDocument may have skipped or failed`
              : 'all contextualized'
          }
        />
        <Stat
          label="With embeddings"
          value={embedded}
          sub={
            embedded < all.length
              ? `⚠ ${all.length - embedded} missing — vector search will miss these`
              : 'all embedded'
          }
        />
        <Stat label="Doc" value={all.length} sub="canonical chunks" />
      </div>
      <p className="text-xs text-muted-foreground">
        Vector retrieval queries this table’s embeddings (Wave 2 contextual ones, regenerated over{' '}
        <code>context_text || chunk_text</code>). The verbatim <code>chunk_text</code> is what’s
        cited in answers; the <code>context_text</code> only steers retrieval. If a chunk is
        missing either, the system can’t find or can’t cite it.
      </p>
      <div className="space-y-2">
        {all.map((c) => {
          const hasCtx = !!c.context_text
          const hasEmb = embPresent.has(c.id)
          return (
            <details
              key={c.id}
              className={
                'rounded-xl border bg-card ' +
                (c.page_number === activePage
                  ? 'border-emerald-300 ring-1 ring-emerald-200'
                  : 'border-border')
              }
            >
              <summary className="cursor-pointer px-4 py-2.5 flex items-center gap-3 text-sm list-none">
                <span className="font-mono text-xs text-muted-foreground w-16 shrink-0">
                  #{c.chunk_index}
                </span>
                <JumpToPage
                  docId={docId}
                  tab={activeTab}
                  page={c.page_number}
                  active={c.page_number === activePage}
                  chunkId={c.id}
                />
                <span className="text-[11px] text-muted-foreground">p.{c.page_number}</span>
                <span
                  className={
                    'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ' +
                    (hasCtx
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200')
                  }
                >
                  {hasCtx ? 'ctx' : 'no ctx'}
                </span>
                <span
                  className={
                    'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ' +
                    (hasEmb
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-red-50 text-red-700 border-red-200')
                  }
                >
                  {hasEmb ? 'emb' : 'no emb'}
                </span>
                {c.section_title && (
                  <span className="text-[11px] text-foreground italic truncate max-w-[20rem]">
                    {c.section_title}
                  </span>
                )}
                <span className="ml-auto text-xs text-muted-foreground truncate max-w-[32rem]">
                  {(c.chunk_text ?? '').slice(0, 120).replace(/\s+/g, ' ')}
                </span>
              </summary>
              <div className="px-4 pb-3 border-t border-border space-y-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mt-2">
                    context_text (Wave 2 blurb)
                  </p>
                  <pre className="mt-1 text-xs bg-blue-50 border border-blue-200 rounded p-2 whitespace-pre-wrap break-words">
                    {c.context_text ?? '(none — not contextualized)'}
                  </pre>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                    chunk_text (verbatim, cited in answers)
                  </p>
                  <pre className="mt-1 text-xs bg-slate-50 border border-slate-200 rounded p-2 whitespace-pre-wrap break-words max-h-72 overflow-auto">
                    {c.chunk_text || '(empty)'}
                  </pre>
                </div>
              </div>
            </details>
          )
        })}
      </div>
    </div>
  )
}

// ─── Events tab (extracted maintenance events) ───────────────────────────

async function EventsTab({
  docId,
  activeTab,
  activePage,
}: {
  docId: string
  activeTab: Tab
  activePage: number
}) {
  const service = createServiceSupabase()
  const { data: rows } = await service
    .from('ocr_extracted_events')
    .select(
      `id, event_type, event_date, tach_time, airframe_tt, work_description,
       mechanic_name, mechanic_cert_number, ia_number, ad_references, part_numbers,
       confidence_overall, confidence_date, confidence_tach, confidence_mechanic,
       review_status, page_number`,
    )
    .eq('document_id', docId)
    .order('page_number', { ascending: true })

  const events = (rows ?? []) as Array<any>

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          No <code>ocr_extracted_events</code> for this document. Field extraction either hasn’t
          run or this doc type doesn’t produce maintenance events (e.g. POH / parts catalog).
        </CardContent>
      </Card>
    )
  }

  const byStatus = events.reduce(
    (acc, e) => {
      const s = e.review_status ?? 'unknown'
      acc[s] = (acc[s] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Events extracted" value={events.length} />
        <Stat label="Approved" value={byStatus.approved ?? 0} />
        <Stat label="Pending" value={byStatus.pending ?? 0} />
        <Stat label="Rejected" value={byStatus.rejected ?? 0} />
      </div>
      <p className="text-xs text-muted-foreground">
        Each <code>approved</code> event becomes both a <code>logbook_entries</code> row
        (owner-visible historical) and a <code>maintenance_events</code> row (intelligence
        layer) via the <code>promote_approved_event_to_logbook</code> trigger.
      </p>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">p.</th>
              <th className="text-left px-3 py-2 font-semibold">Date</th>
              <th className="text-left px-3 py-2 font-semibold">Type</th>
              <th className="text-left px-3 py-2 font-semibold">Tach</th>
              <th className="text-left px-3 py-2 font-semibold">TT</th>
              <th className="text-left px-3 py-2 font-semibold">Mechanic</th>
              <th className="text-left px-3 py-2 font-semibold">Conf</th>
              <th className="text-left px-3 py-2 font-semibold">Status</th>
              <th className="text-left px-3 py-2 font-semibold">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {events.map((e) => {
              const isActive = typeof e.page_number === 'number' && e.page_number === activePage
              return (
              <tr key={e.id} className={'align-top ' + (isActive ? 'bg-emerald-50/40' : '')}>
                <td className="px-3 py-1.5 font-mono">
                  {typeof e.page_number === 'number' ? (
                    <JumpToPage
                      docId={docId}
                      tab={activeTab}
                      page={e.page_number}
                      active={isActive}
                    />
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-1.5">{e.event_date ?? '—'}</td>
                <td className="px-3 py-1.5">{e.event_type ?? '—'}</td>
                <td className="px-3 py-1.5 font-mono">{e.tach_time ?? '—'}</td>
                <td className="px-3 py-1.5 font-mono">{e.airframe_tt ?? '—'}</td>
                <td className="px-3 py-1.5">
                  {e.mechanic_name ?? '—'}
                  {e.mechanic_cert_number ? ` (${e.mechanic_cert_number})` : ''}
                  {e.ia_number ? ` · IA ${e.ia_number}` : ''}
                </td>
                <td className="px-3 py-1.5">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${bandTone(e.confidence_overall ?? null)}`}
                  >
                    {e.confidence_overall == null ? '—' : Number(e.confidence_overall).toFixed(2)}
                  </span>
                </td>
                <td className="px-3 py-1.5 font-mono">{e.review_status ?? '—'}</td>
                <td className="px-3 py-1.5 max-w-md truncate" title={e.work_description ?? ''}>
                  {e.work_description ?? '—'}
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
