import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import { DocumentsTable } from '@/components/documents/documents-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Upload, FileText, CheckCircle2, Loader2 } from 'lucide-react'
import { DOC_TYPE_LABELS, PARSING_STATUS_LABELS } from '@/lib/utils'
import type { Document, UserProfile, DocType, ParsingStatus } from '@/types'

export const metadata = { title: 'Documents' }

const PAGE_SIZE = 25

// ─── Search params type ────────────────────────────────────────────────────────

interface DocumentsSearchParams {
  aircraft?: string
  doc_type?: string
  status?: string
  q?: string
  page?: string
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

      {(searchParams.aircraft || searchParams.doc_type || searchParams.status || searchParams.q) && (
        <a
          href="/documents"
          className="h-9 px-3 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground flex items-center transition-colors"
        >
          Clear
        </a>
      )}
    </form>
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
    if (searchParams.q) params.set('q', searchParams.q)
    params.set('page', String(p))
    return `/documents?${params.toString()}`
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

  if (searchParams.aircraft) {
    query = query.eq('aircraft_id', searchParams.aircraft)
  }
  if (searchParams.doc_type) {
    query = query.eq('doc_type', searchParams.doc_type as DocType)
  }
  if (searchParams.status) {
    query = query.eq('parsing_status', searchParams.status as ParsingStatus)
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
  const { data: statsRows } = await supabase
    .from('documents')
    .select('parsing_status')
    .eq('organization_id', orgId)

  const allStatuses = (statsRows ?? []) as { parsing_status: ParsingStatus }[]
  const totalDocs = allStatuses.length
  const indexedDocs = allStatuses.filter((r) => r.parsing_status === 'completed').length
  const processingDocs = allStatuses.filter((r) =>
    ['queued', 'parsing', 'chunking', 'embedding', 'needs_ocr', 'ocr_processing'].includes(
      r.parsing_status
    )
  ).length

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
              Your organization's document library
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
          <FilterBar aircraftList={aircraftList} searchParams={searchParams} />

          {/* Table + detail slideover */}
          <DocumentsTable
            documents={documents}
            totalCount={totalCount}
          />

          {/* Pagination */}
          <Pagination page={page} totalPages={totalPages} searchParams={searchParams} />
        </div>
      </main>
    </div>
  )
}
