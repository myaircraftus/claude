import { redirect } from 'next/navigation'
import Link from '@/components/shared/tenant-link'
import {
  Building2,
  Users,
  FileText,
  AlertTriangle,
  MessageSquare,
  Clock,
  HardDrive,
  Loader2,
  ChevronRight,
  ExternalLink,
} from 'lucide-react'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  StuckDocumentsCard,
  type StuckDocument,
} from '@/components/admin/stuck-documents-card'
import type { UserProfile, QueryConfidence } from '@/types'

export const metadata = { title: 'Admin Dashboard' }

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecentQuery {
  id: string
  question: string
  confidence: QueryConfidence
  created_at: string
  org_name: string
}

interface FailedDocument {
  id: string
  title: string
  parse_error: string | null
  org_name: string
}

interface AdminStats {
  total_orgs: number
  total_users: number
  total_documents: number
  failed_documents: number
  total_queries: number
  queries_last_24h: number
  total_storage_gb: number
  processing_documents: number
  open_feedback: number
  open_support: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function confidenceBadgeVariant(
  confidence: QueryConfidence
): 'success' | 'warning' | 'danger' | 'secondary' {
  switch (confidence) {
    case 'high':
      return 'success'
    case 'medium':
      return 'warning'
    case 'low':
      return 'danger'
    default:
      return 'secondary'
  }
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  color: string
}) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-foreground leading-none tabular-nums">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
        {sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── 403 card ─────────────────────────────────────────────────────────────────

function ForbiddenCard() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <CardTitle className="text-lg">Access Denied</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            You do not have platform administrator privileges. Contact support if you believe this
            is an error.
          </p>
          <div className="mt-4">
            <Link
              href="/dashboard"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              Return to dashboard
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminDashboardPage() {
  // 1. Auth check
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get profile for topbar
  const { data: profileRow } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profileRow) redirect('/login')
  const profile = profileRow as UserProfile

  // 2. Admin check
  if (!profile.is_platform_admin) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <Topbar profile={profile} breadcrumbs={[{ label: 'Admin' }]} />
        <main className="flex-1 overflow-y-auto">
          <ForbiddenCard />
        </main>
      </div>
    )
  }

  // 3. Service client for all admin queries
  const service = createServiceSupabase()

  // Thresholds for "stuck" (applied in app code after fetch).
  const now = Date.now()

  // 4. Parallel data fetches
  const [
    orgsRes,
    usersRes,
    docsRes,
    queriesRes,
    storageRes,
    recentQueriesRes,
    processingCountRes,
    failedDocsRes,
    feedbackRes,
    supportRes,
    stuckDocsRes,
  ] = await Promise.all([
    // Total orgs
    service.from('organizations').select('id', { count: 'exact', head: true }),

    // Total users
    service.from('user_profiles').select('id', { count: 'exact', head: true }),

    // Total docs + failed docs
    service
      .from('documents')
      .select('id, parsing_status', { count: 'exact' }),

    // Total queries + queries last 24h
    service
      .from('queries')
      .select('id, created_at', { count: 'exact' }),

    // Total storage GB
    service
      .from('documents')
      .select('file_size_bytes')
      .not('file_size_bytes', 'is', null),

    // Last 10 recent queries with org name
    service
      .from('queries')
      .select('id, question, confidence, created_at, organization_id, organizations(name)')
      .order('created_at', { ascending: false })
      .limit(10),

    // Documents currently processing
    service
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .in('parsing_status', ['queued', 'parsing', 'chunking', 'embedding', 'ocr_processing']),

    // Recent failed documents (last 5)
    service
      .from('documents')
      .select('id, title, parse_error, organization_id, organizations(name)')
      .eq('parsing_status', 'failed')
      .order('updated_at', { ascending: false })
      .limit(5),

    service
      .from('feedback')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open'),

    service
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'triaged', 'in_progress']),

    // Stuck documents: failed + needs_ocr + queued-over-5min + stalled-parsing.
    // We fetch a superset (all statuses that can be stuck) and filter the
    // time-window conditions in app code to avoid complex PostgREST .or() parsing.
    service
      .from('documents')
      .select(
        'id, title, parsing_status, parse_error, parse_started_at, updated_at, organization_id, organizations(name)'
      )
      .in('parsing_status', [
        'failed',
        'needs_ocr',
        'queued',
        'parsing',
        'ocr_processing',
        'chunking',
        'embedding',
      ])
      .order('updated_at', { ascending: false })
      .limit(200),
  ])

  // 5. Compute stats
  const totalOrgs = orgsRes.count ?? 0
  const totalUsers = usersRes.count ?? 0
  const totalDocuments = docsRes.count ?? 0

  const docRows = (docsRes.data ?? []) as { id: string; parsing_status: string }[]
  const failedDocuments = docRows.filter((d) => d.parsing_status === 'failed').length

  const queryRows = (queriesRes.data ?? []) as { id: string; created_at: string }[]
  const totalQueries = queriesRes.count ?? 0
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  const queriesLast24h = queryRows.filter(
    (q) => new Date(q.created_at).getTime() > cutoff
  ).length

  const storageRows = (storageRes.data ?? []) as { file_size_bytes: number }[]
  const totalStorageGb =
    storageRows.reduce((sum, r) => sum + (r.file_size_bytes ?? 0), 0) / 1073741824

  const processingCount = processingCountRes.count ?? 0
  const openFeedback = feedbackRes.count ?? 0
  const openSupport = supportRes.count ?? 0

  const recentQueries: RecentQuery[] = ((recentQueriesRes.data ?? []) as any[]).map((q) => ({
    id: q.id,
    question: q.question,
    confidence: q.confidence as QueryConfidence,
    created_at: q.created_at,
    org_name: q.organizations?.name ?? q.organization_id ?? '—',
  }))

  const failedDocs: FailedDocument[] = ((failedDocsRes.data ?? []) as any[]).map((d) => ({
    id: d.id,
    title: d.title,
    parse_error: d.parse_error,
    org_name: d.organizations?.name ?? d.organization_id ?? '—',
  }))

  const IN_PROGRESS = new Set(['parsing', 'ocr_processing', 'chunking', 'embedding'])
  const stuckDocuments: StuckDocument[] = ((stuckDocsRes.data ?? []) as any[])
    .filter((d) => {
      const status = d.parsing_status as string
      if (status === 'failed' || status === 'needs_ocr') return true
      const ageMs =
        now - new Date(d.parse_started_at ?? d.updated_at ?? new Date().toISOString()).getTime()
      if (status === 'queued') return ageMs >= 5 * 60 * 1000
      if (IN_PROGRESS.has(status)) return ageMs >= 15 * 60 * 1000
      return false
    })
    .slice(0, 50)
    .map((d) => ({
      id: d.id,
      title: d.title,
      parsing_status: d.parsing_status,
      parse_error: d.parse_error ?? null,
      parse_started_at: d.parse_started_at ?? null,
      updated_at: d.updated_at,
      org_name: d.organizations?.name ?? d.organization_id ?? '—',
    }))

  const stats: AdminStats = {
    total_orgs: totalOrgs,
    total_users: totalUsers,
    total_documents: totalDocuments,
    failed_documents: failedDocuments,
    total_queries: totalQueries,
    queries_last_24h: queriesLast24h,
    total_storage_gb: totalStorageGb,
    processing_documents: processingCount,
    open_feedback: openFeedback,
    open_support: openSupport,
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[{ label: 'Admin' }]}
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-8">

          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-foreground">Platform Admin</h1>
            <p className="text-sm text-muted-foreground mt-1">
              System-wide overview for myaircraft.us
            </p>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon={<Building2 className="h-5 w-5 text-indigo-600" />}
              label="Total Orgs"
              value={stats.total_orgs}
              color="bg-indigo-50"
            />
            <StatCard
              icon={<Users className="h-5 w-5 text-sky-600" />}
              label="Total Users"
              value={stats.total_users}
              color="bg-sky-50"
            />
            <StatCard
              icon={<FileText className="h-5 w-5 text-emerald-600" />}
              label="Total Docs"
              value={stats.total_documents}
              color="bg-emerald-50"
            />
            <StatCard
              icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
              label="Failed Docs"
              value={stats.failed_documents}
              color="bg-red-50"
            />
            <StatCard
              icon={<MessageSquare className="h-5 w-5 text-violet-600" />}
              label="Total Queries"
              value={stats.total_queries}
              color="bg-violet-50"
            />
            <StatCard
              icon={<Clock className="h-5 w-5 text-amber-600" />}
              label="Queries (24h)"
              value={stats.queries_last_24h}
              color="bg-amber-50"
            />
            <StatCard
              icon={<HardDrive className="h-5 w-5 text-teal-600" />}
              label="Storage"
              value={`${stats.total_storage_gb.toFixed(2)} GB`}
              color="bg-teal-50"
            />
            <StatCard
              icon={<Loader2 className="h-5 w-5 text-blue-600" />}
              label="Processing Queue"
              value={stats.processing_documents}
              color="bg-blue-50"
            />
            <StatCard
              icon={<MessageSquare className="h-5 w-5 text-fuchsia-600" />}
              label="Open Feedback"
              value={stats.open_feedback}
              color="bg-fuchsia-50"
            />
            <StatCard
              icon={<AlertTriangle className="h-5 w-5 text-orange-600" />}
              label="Open Tickets"
              value={stats.open_support}
              color="bg-orange-50"
            />
          </div>

          {/* Ops inbox */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Ops Inbox</CardTitle>
              <p className="text-sm text-muted-foreground">
                Review feedback, support tickets, and disputes from all tenants.
              </p>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Link
                href="/admin/feedback"
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted/40"
              >
                <MessageSquare className="h-4 w-4 text-fuchsia-600" />
                Feedback Inbox
                <Badge variant="secondary">{stats.open_feedback}</Badge>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
              <Link
                href="/admin/support"
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted/40"
              >
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                Support Tickets
                <Badge variant="secondary">{stats.open_support}</Badge>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
              <p className="text-sm text-muted-foreground">Last 10 queries across all organizations</p>
            </CardHeader>
            <CardContent className="p-0">
              {recentQueries.length === 0 ? (
                <p className="text-sm text-muted-foreground px-6 pb-6">No queries yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Organization
                        </th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Question
                        </th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Confidence
                        </th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Time
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentQueries.map((q, i) => (
                        <tr
                          key={q.id}
                          className={`border-b border-border last:border-0 ${
                            i % 2 === 0 ? '' : 'bg-muted/30'
                          }`}
                        >
                          <td className="px-6 py-3 font-medium text-foreground whitespace-nowrap">
                            {q.org_name}
                          </td>
                          <td className="px-6 py-3 text-muted-foreground max-w-xs">
                            <span
                              title={q.question}
                              className="block truncate"
                            >
                              {q.question.length > 80
                                ? `${q.question.slice(0, 80)}…`
                                : q.question}
                            </span>
                          </td>
                          <td className="px-6 py-3">
                            <Badge variant={confidenceBadgeVariant(q.confidence)}>
                              {q.confidence === 'insufficient_evidence'
                                ? 'insufficient'
                                : q.confidence}
                            </Badge>
                          </td>
                          <td className="px-6 py-3 text-muted-foreground whitespace-nowrap">
                            {timeAgo(q.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stuck documents with bulk retry */}
          <StuckDocumentsCard documents={stuckDocuments} />

          {/* Pipeline Status */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Pipeline Status</CardTitle>
                {processingCount > 0 && (
                  <Badge variant="info">{processingCount} processing</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Documents in the parsing pipeline
              </p>
            </CardHeader>
            <CardContent>
              {processingCount === 0 && failedDocs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Pipeline is clear — no active jobs.</p>
              ) : (
                <div className="space-y-4">
                  {processingCount > 0 && (
                    <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 rounded-lg px-4 py-3">
                      <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                      <span>
                        <strong>{processingCount}</strong> document
                        {processingCount !== 1 ? 's' : ''} currently processing
                      </span>
                    </div>
                  )}

                  {failedDocs.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        Recent Failures
                      </p>
                      <div className="space-y-2">
                        {failedDocs.map((doc) => (
                          <div
                            key={doc.id}
                            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">
                                  {doc.title}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {doc.org_name}
                                </p>
                              </div>
                              <Badge variant="danger" className="flex-shrink-0">failed</Badge>
                            </div>
                            {doc.parse_error && (
                              <p className="mt-2 text-xs text-red-700 font-mono bg-red-100 rounded px-2 py-1 break-all">
                                {doc.parse_error.slice(0, 300)}
                                {doc.parse_error.length > 300 ? '…' : ''}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Links */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Quick Links</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Link
                  href="/admin/tenants"
                  className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center">
                      <Building2 className="h-4 w-4 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Tenant Management</p>
                      <p className="text-xs text-muted-foreground">View and manage all organizations</p>
                    </div>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </Link>

                <Link
                  href="/admin/feedback"
                  className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                      <FileText className="h-4 w-4 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Feedback &amp; Support</p>
                      <p className="text-xs text-muted-foreground">Triage user-submitted feedback and tickets</p>
                    </div>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </Link>
              </div>
            </CardContent>
          </Card>

        </div>
      </main>
    </div>
  )
}
