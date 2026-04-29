import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Link from '@/components/shared/tenant-link'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { docTypesForPersona, type Persona } from '@/lib/documents/persona-scope'
import { Topbar } from '@/components/shared/topbar'
import { DocumentsTable } from '@/components/documents/documents-table'
import { Button } from '@/components/ui/button'
import { Upload, FileText, CheckCircle2, Loader2 } from 'lucide-react'
import { DOC_TYPE_LABELS, PARSING_STATUS_LABELS } from '@/lib/utils'
import { RECORD_FAMILY_LABELS, TRUTH_ROLE_LABELS, type RecordFamily, type TruthRole } from '@/lib/documents/classification'
import { reconcileOrganizationStaleDocuments } from '@/lib/documents/processing-health'
import { tenantAppHref } from '@/lib/auth/server-tenant'
import type { Document, UserProfile, DocType, ParsingStatus } from '@/types'

export const metadata = { title: 'Documents' }

const PAGE_SIZE = 25

// ─── Search params type ────────────────────────────────────────────────────────

interface DocumentsSearchParams {
  aircraft?: string
  doc_type?: string
  status?: string
  record_family?: string
  truth_role?: string
  view?: string
  q?: string
  page?: string
}

type SmartViewId =
  | 'all'
  | 'needs_review'
  | 'pending_ocr'
  | 'needs_classification'
  | 'logbooks'
  | 'manuals'
  | 'faa_docs'
  | 'reminder_drivers'
  | 'ad_evidence'

interface DocumentMetaRow {
  parsing_status: ParsingStatus
  doc_type: DocType
  document_group_id?: string | null
  document_detail_id?: string | null
  record_family?: string | null
  truth_role?: string | null
  reminder_relevance?: boolean | null
  ad_relevance?: boolean | null
}

const SMART_VIEWS: Array<{ id: SmartViewId; label: string; description: string }> = [
  { id: 'all', label: 'All documents', description: 'Everything in the organization vault' },
  { id: 'needs_review', label: 'Needs review', description: 'Failures, OCR-required items, or review-only cases' },
  { id: 'pending_ocr', label: 'Pending OCR / indexing', description: 'Queued, OCR, parse, chunk, or embedding work in progress' },
  { id: 'needs_classification', label: 'Needs classification', description: 'Missing taxonomy or truth-role assignment' },
  { id: 'logbooks', label: 'Logbooks', description: 'Airframe, engine, prop, and permanent record history' },
  { id: 'manuals', label: 'Manuals & references', description: 'POH, AFM, manuals, and checklist references' },
  { id: 'faa_docs', label: 'FAA / compliance docs', description: '337s, 8130s, ADs, and authority-driven material' },
  { id: 'reminder_drivers', label: 'Reminder-driving', description: 'Documents eligible to drive due items' },
  { id: 'ad_evidence', label: 'AD evidence', description: 'Documents that can satisfy AD evidence workflows' },
]

function matchesSmartView(row: DocumentMetaRow, view: SmartViewId) {
  switch (view) {
    case 'all':
      return true
    case 'needs_review':
      return (
        row.parsing_status === 'failed' ||
        row.parsing_status === 'needs_ocr' ||
        row.truth_role === 'needs_review'
      )
    case 'pending_ocr':
      return ['queued', 'parsing', 'chunking', 'embedding', 'needs_ocr', 'ocr_processing'].includes(row.parsing_status)
    case 'needs_classification':
      return !row.document_group_id || !row.document_detail_id || !row.record_family || !row.truth_role
    case 'logbooks':
      return row.record_family === 'logbooks_permanent_records'
    case 'manuals':
      return (
        row.document_group_id === 'flight_crew_and_operating_documents' ||
        row.document_group_id === 'maintenance_program_and_inspection_records' ||
        row.document_group_id === 'checklists_and_cockpit_references'
      )
    case 'faa_docs':
      return (
        row.document_group_id === 'airworthiness_and_certification' ||
        row.document_group_id === 'ad_sb_and_service_information' ||
        row.document_group_id === 'faa_government_authority_correspondence' ||
        row.doc_type === 'form_337' ||
        row.doc_type === 'form_8130' ||
        row.doc_type === 'airworthiness_directive'
      )
    case 'reminder_drivers':
      return Boolean(row.reminder_relevance)
    case 'ad_evidence':
      return Boolean(row.ad_relevance)
    default:
      return true
  }
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: number
  color: string
}) {
  return (
    <div className={`flex items-center gap-3 p-4 rounded-xl border border-border bg-card`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-xl font-bold text-foreground leading-none">{value.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// ─── Filter bar (client island not needed — plain form with searchParams) ─────

function FilterBar({
  aircraftList,
  searchParams,
}: {
  aircraftList: { id: string; tail_number: string }[]
  searchParams: DocumentsSearchParams
}) {
  // We use regular <form> + GET to keep this a server component
  return (
    <form method="GET" className="flex flex-wrap gap-2">
      <input type="hidden" name="view" value={searchParams.view ?? 'all'} />
      {/* Aircraft filter */}
      <div className="w-44">
        <select
          name="aircraft"
          defaultValue={searchParams.aircraft ?? ''}
          className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All aircraft</option>
          {aircraftList.map((ac) => (
            <option key={ac.id} value={ac.id}>
              {ac.tail_number}
            </option>
          ))}
        </select>
      </div>

      {/* Doc type filter */}
      <div className="w-48">
        <select
          name="doc_type"
          defaultValue={searchParams.doc_type ?? ''}
          className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All types</option>
          {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Status filter */}
      <div className="w-44">
        <select
          name="status"
          defaultValue={searchParams.status ?? ''}
          className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All statuses</option>
          {Object.entries(PARSING_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="w-52">
        <select
          name="record_family"
          defaultValue={searchParams.record_family ?? ''}
          className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All record families</option>
          {Object.entries(RECORD_FAMILY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="w-48">
        <select
          name="truth_role"
          defaultValue={searchParams.truth_role ?? ''}
          className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All truth roles</option>
          {Object.entries(TRUTH_ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Search input */}
      <div className="flex-1 min-w-48">
        <input
          name="q"
          type="search"
          defaultValue={searchParams.q ?? ''}
          placeholder="Search titles…"
          className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <button
        type="submit"
        className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium shadow-sm hover:bg-primary/90 transition-colors"
      >
        Filter
      </button>

      {(searchParams.aircraft || searchParams.doc_type || searchParams.status || searchParams.record_family || searchParams.truth_role || searchParams.q || (searchParams.view && searchParams.view !== 'all')) && (
        <a
          href={tenantAppHref('/documents')}
          className="h-9 px-3 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground flex items-center transition-colors"
        >
          Clear
        </a>
      )}
    </form>
  )
}

function SmartViewBar({
  counts,
  searchParams,
}: {
  counts: Record<SmartViewId, number>
  searchParams: DocumentsSearchParams
}) {
  const activeView = (searchParams.view as SmartViewId | undefined) ?? 'all'

  function buildHref(view: SmartViewId) {
    const params = new URLSearchParams()
    if (searchParams.aircraft) params.set('aircraft', searchParams.aircraft)
    if (searchParams.doc_type) params.set('doc_type', searchParams.doc_type)
    if (searchParams.status) params.set('status', searchParams.status)
    if (searchParams.record_family) params.set('record_family', searchParams.record_family)
    if (searchParams.truth_role) params.set('truth_role', searchParams.truth_role)
    if (searchParams.q) params.set('q', searchParams.q)
    if (view !== 'all') params.set('view', view)
    return tenantAppHref(`/documents${params.toString() ? `?${params.toString()}` : ''}`)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {SMART_VIEWS.map((view) => {
          const active = activeView === view.id
          return (
            <a
              key={view.id}
              href={buildHref(view.id)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                active
                  ? 'border-brand-200 bg-brand-50 text-brand-700'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              <span className="font-medium">{view.label}</span>
              <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] text-muted-foreground border border-border/70">
                {counts[view.id] ?? 0}
              </span>
            </a>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {SMART_VIEWS.find((view) => view.id === activeView)?.description}
      </p>
    </div>
  )
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  searchParams,
}: {
  page: number
  totalPages: number
  searchParams: DocumentsSearchParams
}) {
  function buildHref(p: number) {
    const params = new URLSearchParams()
    if (searchParams.aircraft) params.set('aircraft', searchParams.aircraft)
    if (searchParams.doc_type) params.set('doc_type', searchParams.doc_type)
    if (searchParams.status) params.set('status', searchParams.status)
    if (searchParams.record_family) params.set('record_family', searchParams.record_family)
    if (searchParams.truth_role) params.set('truth_role', searchParams.truth_role)
    if (searchParams.view && searchParams.view !== 'all') params.set('view', searchParams.view)
    if (searchParams.q) params.set('q', searchParams.q)
    params.set('page', String(p))
    return tenantAppHref(`/documents?${params.toString()}`)
  }

  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-end gap-2 pt-2">
      {page > 1 && (
        <a
          href={buildHref(page - 1)}
          className="h-8 px-3 rounded-md border border-border text-sm hover:bg-muted transition-colors flex items-center"
        >
          Previous
        </a>
      )}
      <span className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      {page < totalPages && (
        <a
          href={buildHref(page + 1)}
          className="h-8 px-3 rounded-md border border-border text-sm hover:bg-muted transition-colors flex items-center"
        >
          Next
        </a>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: DocumentsSearchParams
}) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileRes, membershipRes] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('organization_memberships')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single(),
  ])

  const profile = profileRes.data as UserProfile
  if (!profile) redirect('/login')

  const membership = membershipRes.data
  if (!membership) redirect('/onboarding')

  const orgId = membership.organization_id
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10))
  const offset = (page - 1) * PAGE_SIZE
  const serviceClient = createServiceSupabase()

  await reconcileOrganizationStaleDocuments(serviceClient, orgId)

  // ── Fetch aircraft for filter bar ──────────────────────────────────────────
  const { data: aircraftRows } = await supabase
    .from('aircraft')
    .select('id, tail_number')
    .eq('organization_id', orgId)
    .eq('is_archived', false)
    .order('tail_number')

  const aircraftList = (aircraftRows ?? []) as { id: string; tail_number: string }[]

  // ── Build documents query with filters ────────────────────────────────────
  let query = supabase
    .from('documents')
    .select(
      `
      *,
      aircraft:aircraft_id (
        id,
        tail_number,
        make,
        model
      )
    `,
      { count: 'exact' }
    )
    .eq('organization_id', orgId)

  // Persona scope — the AppContext mirrors the active UI persona to a cookie
  // (ui_persona). Mechanic persona only sees shop reference docs; owner sees
  // everything. We default to owner if the cookie is missing so the page
  // doesn't accidentally hide records on first load.
  const personaCookie = cookies().get('ui_persona')?.value
  const activePersona: Persona = personaCookie === 'mechanic' ? 'mechanic' : 'owner'
  if (activePersona === 'mechanic') {
    query = query.in('doc_type', docTypesForPersona('mechanic'))
  }

  if (searchParams.aircraft) {
    query = query.eq('aircraft_id', searchParams.aircraft)
  }
  if (searchParams.doc_type) {
    query = query.eq('doc_type', searchParams.doc_type as DocType)
  }
  if (searchParams.status) {
    query = query.eq('parsing_status', searchParams.status as ParsingStatus)
  }
  if (searchParams.record_family) {
    query = query.eq('record_family', searchParams.record_family as RecordFamily)
  }
  if (searchParams.truth_role) {
    query = query.eq('truth_role', searchParams.truth_role as TruthRole)
  }
  const smartView = ((searchParams.view as SmartViewId | undefined) ?? 'all')
  if (smartView === 'needs_review') {
    query = query.or('parsing_status.eq.failed,parsing_status.eq.needs_ocr,truth_role.eq.needs_review')
  } else if (smartView === 'pending_ocr') {
    query = query.in('parsing_status', ['queued', 'parsing', 'chunking', 'embedding', 'needs_ocr', 'ocr_processing'])
  } else if (smartView === 'needs_classification') {
    query = query.or('document_group_id.is.null,document_detail_id.is.null,record_family.is.null,truth_role.is.null')
  } else if (smartView === 'logbooks') {
    query = query.eq('record_family', 'logbooks_permanent_records')
  } else if (smartView === 'manuals') {
    query = query.in('document_group_id', [
      'flight_crew_and_operating_documents',
      'maintenance_program_and_inspection_records',
      'checklists_and_cockpit_references',
    ])
  } else if (smartView === 'faa_docs') {
    query = query.or(
      'document_group_id.eq.airworthiness_and_certification,document_group_id.eq.ad_sb_and_service_information,document_group_id.eq.faa_government_authority_correspondence,doc_type.eq.form_337,doc_type.eq.form_8130,doc_type.eq.airworthiness_directive'
    )
  } else if (smartView === 'reminder_drivers') {
    query = query.eq('reminder_relevance', true)
  } else if (smartView === 'ad_evidence') {
    query = query.eq('ad_relevance', true)
  }
  if (searchParams.q) {
    query = query.ilike('title', `%${searchParams.q}%`)
  }

  const { data: docRows, count } = await query
    .order('uploaded_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  const documents = (docRows ?? []) as (Document & {
    aircraft: { id: string; tail_number: string; make: string; model: string } | null
  })[]

  const totalCount = count ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  // ── Stats ──────────────────────────────────────────────────────────────────
  let statsQuery = supabase
    .from('documents')
    .select('parsing_status, doc_type, document_group_id, document_detail_id, record_family, truth_role, reminder_relevance, ad_relevance')
    .eq('organization_id', orgId)
  if (activePersona === 'mechanic') {
    statsQuery = statsQuery.in('doc_type', docTypesForPersona('mechanic'))
  }
  if (searchParams.aircraft) {
    statsQuery = statsQuery.eq('aircraft_id', searchParams.aircraft)
  }
  if (searchParams.doc_type) {
    statsQuery = statsQuery.eq('doc_type', searchParams.doc_type as DocType)
  }
  if (searchParams.status) {
    statsQuery = statsQuery.eq('parsing_status', searchParams.status as ParsingStatus)
  }
  if (searchParams.record_family) {
    statsQuery = statsQuery.eq('record_family', searchParams.record_family as RecordFamily)
  }
  if (searchParams.truth_role) {
    statsQuery = statsQuery.eq('truth_role', searchParams.truth_role as TruthRole)
  }
  const { data: statsRows } = await statsQuery

  const allStatuses = (statsRows ?? []) as DocumentMetaRow[]
  const totalDocs = allStatuses.length
  const indexedDocs = allStatuses.filter((r) => r.parsing_status === 'completed').length
  const processingDocs = allStatuses.filter((r) =>
    ['queued', 'parsing', 'chunking', 'embedding', 'needs_ocr', 'ocr_processing'].includes(
      r.parsing_status
    )
  ).length
  const smartViewCounts = SMART_VIEWS.reduce((acc, view) => {
    acc[view.id] = allStatuses.filter((row) => matchesSmartView(row, view.id)).length
    return acc
  }, {} as Record<SmartViewId, number>)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[{ label: 'Documents' }]}
        actions={
          <Button size="sm" asChild>
            <Link href="/documents/upload">
              <Upload className="mr-1.5 h-4 w-4" />
              Upload
            </Link>
          </Button>
        }
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">

          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-foreground">Documents</h1>
            <p className="text-muted-foreground text-sm">
              Your organization&apos;s document library
            </p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              icon={<FileText className="h-4 w-4 text-brand-600" />}
              label="Total documents"
              value={totalDocs}
              color="bg-brand-50"
            />
            <StatCard
              icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}
              label="Indexed"
              value={indexedDocs}
              color="bg-green-50"
            />
            <StatCard
              icon={<Loader2 className="h-4 w-4 text-blue-600" />}
              label="Processing"
              value={processingDocs}
              color="bg-blue-50"
            />
          </div>

          {/* Filter bar */}
          <SmartViewBar counts={smartViewCounts} searchParams={searchParams} />

          {/* Filter bar */}
          <FilterBar aircraftList={aircraftList} searchParams={searchParams} />

          {/* Table + detail slideover */}
          <DocumentsTable
            documents={documents}
            totalCount={totalCount}
            currentUserId={user.id}
            currentUserRole={membership.role}
          />

          {/* Pagination */}
          <Pagination page={page} totalPages={totalPages} searchParams={searchParams} />
        </div>
      </main>
    </div>
  )
}
