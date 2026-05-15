/**
 * /admin/documents — Platform-admin Document Pipeline monitor.
 *
 * The admin-side documents surface (NOT the org document library at
 * /documents). Consolidates, on one page:
 *   - pipeline health strip (totals, processing, failed, pending reviews)
 *   - vision / GPU worker heartbeats (the model + GPU pipeline work)
 *   - recent documents with live per-stage progress (upload → OCR →
 *     parsing → chunking → embedding), click a row to expand the timeline
 *   - stuck / failed documents with one-click Retry + Retry All
 *   - the open human-review queue count + entry point
 *
 * Re-runs every 30s (AdminDocumentsRefresh) so the view stays live.
 * Auth: the /admin layout already gates is_platform_admin.
 */
import Link from '@/components/shared/tenant-link'
import {
  FileText, AlertTriangle, Loader2, Cpu, ClipboardCheck, ArrowRight, CheckCircle2, Layers,
} from 'lucide-react'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StuckDocumentsCard, type StuckDocument } from '@/components/admin/stuck-documents-card'
import {
  AdminDocumentsPipeline,
  AdminDocumentsRefresh,
  type PipelineDoc,
  type PipelineStage,
} from './admin-documents-client'
import type { UserProfile } from '@/types'

export const metadata = { title: 'Document Pipeline · Admin' }
export const dynamic = 'force-dynamic'

function orgName(value: unknown): string {
  if (!value) return '—'
  if (Array.isArray(value)) return (value[0] as { name?: string })?.name ?? '—'
  return (value as { name?: string }).name ?? '—'
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return '—'
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`
  return `${Math.round(ms / 86_400_000)}d ago`
}

const IN_PROGRESS = new Set(['parsing', 'ocr_processing', 'chunking', 'embedding'])

function StatCard({
  icon, label, value, tone,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  tone: string
}) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tone}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-foreground leading-none tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  )
}

export default async function AdminDocumentsPage() {
  // Profile for the Topbar — the /admin layout already enforced is_platform_admin.
  const authClient = createServerSupabase()
  const { data: { user } } = await authClient.auth.getUser()
  const { data: profileRow } = user
    ? await authClient.from('user_profiles').select('*').eq('id', user.id).single()
    : { data: null }
  const profile = (profileRow ?? {}) as UserProfile

  const service = createServiceSupabase()
  const now = Date.now()

  const [
    docsRes, progressRes, workersRes, reviewCountRes,
    processingCountRes, failedCountRes, totalCountRes,
  ] = await Promise.all([
    service
      .from('documents')
      .select('id, title, parsing_status, parse_error, parse_started_at, updated_at, uploaded_at, organization_id, organizations(name)')
      .order('updated_at', { ascending: false })
      .limit(200),
    service
      .from('ingestion_progress')
      .select('document_id, stage, stage_started_at, stage_completed_at, error_message')
      .order('stage_started_at', { ascending: true })
      .limit(800),
    service
      .from('vision_worker_heartbeat')
      .select('worker_id, last_seen_at, status')
      .neq('status', 'stopping')
      .order('last_seen_at', { ascending: false })
      .limit(20),
    service.from('review_queue_items').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    service
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .in('parsing_status', ['queued', 'parsing', 'chunking', 'embedding', 'ocr_processing']),
    service.from('documents').select('id', { count: 'exact', head: true }).eq('parsing_status', 'failed'),
    service.from('documents').select('id', { count: 'exact', head: true }),
  ])

  const docRows = (docsRes.data ?? []) as any[]

  // Per-document pipeline stage timeline, keyed by document_id.
  const stagesByDoc = new Map<string, PipelineStage[]>()
  for (const row of (progressRes.data ?? []) as any[]) {
    const arr = stagesByDoc.get(row.document_id) ?? []
    arr.push({
      stage: row.stage,
      stage_started_at: row.stage_started_at,
      stage_completed_at: row.stage_completed_at ?? null,
      error_message: row.error_message ?? null,
    })
    stagesByDoc.set(row.document_id, arr)
  }

  // Recent documents (most recently active first) for the live table.
  const documents: PipelineDoc[] = docRows.slice(0, 60).map((d) => ({
    id: d.id,
    title: d.title ?? '(untitled)',
    org_name: orgName(d.organizations),
    parsing_status: d.parsing_status ?? 'unknown',
    uploaded_at: d.uploaded_at ?? null,
    updated_at: d.updated_at ?? null,
    parse_error: d.parse_error ?? null,
    stages: stagesByDoc.get(d.id) ?? [],
  }))

  // Stuck / failed documents (same heuristic as the legacy /admin dashboard).
  const stuckDocuments: StuckDocument[] = docRows
    .filter((d) => {
      const status = d.parsing_status as string
      if (status === 'failed' || status === 'needs_ocr') return true
      const ageMs = now - new Date(d.parse_started_at ?? d.updated_at ?? new Date().toISOString()).getTime()
      if (status === 'queued') return ageMs >= 5 * 60 * 1000
      if (IN_PROGRESS.has(status)) return ageMs >= 15 * 60 * 1000
      return false
    })
    .slice(0, 50)
    .map((d) => ({
      id: d.id,
      title: d.title ?? '(untitled)',
      parsing_status: d.parsing_status,
      org_name: orgName(d.organizations),
      parse_error: d.parse_error ?? null,
      parse_started_at: d.parse_started_at ?? null,
      updated_at: d.updated_at,
    }))

  const workers = ((workersRes.data ?? []) as Array<{ worker_id: string; last_seen_at: string; status: string }>)
  const fiveMinAgo = now - 5 * 60_000
  const activeWorkers = workers.filter((w) => new Date(w.last_seen_at).getTime() >= fiveMinAgo).length

  const pendingReviews = reviewCountRes.count ?? 0
  const processingCount = processingCountRes.count ?? 0
  const failedCount = failedCountRes.count ?? 0
  const totalDocs = totalCountRes.count ?? 0

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Document Pipeline' }]}
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Document Pipeline</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Live ingestion across all organizations — uploads, processing stages, failures,
              retries, and the human-review queue. Auto-refreshes every 30 seconds.
            </p>
          </div>

          {/* Health strip */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard icon={<FileText className="h-4 w-4 text-emerald-600" />} label="Total documents" value={totalDocs} tone="bg-emerald-50" />
            <StatCard icon={<Loader2 className="h-4 w-4 text-blue-600" />} label="Processing" value={processingCount} tone="bg-blue-50" />
            <StatCard icon={<AlertTriangle className="h-4 w-4 text-red-600" />} label="Failed" value={failedCount} tone="bg-red-50" />
            <StatCard icon={<ClipboardCheck className="h-4 w-4 text-amber-600" />} label="Pending reviews" value={pendingReviews} tone="bg-amber-50" />
            <StatCard icon={<Cpu className="h-4 w-4 text-violet-600" />} label="Workers active" value={`${activeWorkers} / ${workers.length}`} tone="bg-violet-50" />
          </div>

          {/* Vision / GPU pipeline workers */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Cpu className="h-4 w-4 text-violet-600" /> Model &amp; GPU pipeline workers
              </CardTitle>
            </CardHeader>
            <CardContent>
              {workers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No worker heartbeats reported.</p>
              ) : (
                <div className="divide-y divide-border">
                  {workers.map((w) => {
                    const active = new Date(w.last_seen_at).getTime() >= fiveMinAgo
                    return (
                      <div key={w.worker_id} className="flex items-center justify-between py-2 text-sm">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className={`inline-block h-2 w-2 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                          <span className="font-mono text-xs truncate">{w.worker_id}</span>
                          <span className="text-xs text-muted-foreground">{w.status}</span>
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {active ? 'active' : 'idle'} · last seen {timeAgo(w.last_seen_at)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent documents — live per-stage progress */}
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-2">
              <Layers className="h-4 w-4 text-blue-600" /> Recent documents — live progress
            </h2>
            <p className="text-xs text-muted-foreground mb-3">
              Click a document to expand its pipeline timeline (upload → OCR → parsing → chunking → embedding).
            </p>
            <AdminDocumentsPipeline documents={documents} />
          </div>

          {/* Stuck / failed documents with retry */}
          <StuckDocumentsCard documents={stuckDocuments} />

          {/* Open human-review queue */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-amber-600" /> Open reviews
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {pendingReviews === 0 ? (
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      No documents waiting for human review.
                    </span>
                  ) : (
                    <>
                      <strong className="text-foreground tabular-nums">{pendingReviews}</strong>{' '}
                      document{pendingReviews === 1 ? '' : 's'} flagged for human review — verify
                      AI-extracted fields and resolve OCR conflicts.
                    </>
                  )}
                </p>
                <Link
                  href="/documents/review"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline shrink-0"
                  style={{ fontWeight: 600 }}
                >
                  Open Review Queue
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <AdminDocumentsRefresh seconds={30} />
    </div>
  )
}
