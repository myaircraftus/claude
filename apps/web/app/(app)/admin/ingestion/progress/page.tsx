/**
 * /admin/ingestion/progress — Phase 13.3 admin-only global ingestion view.
 *
 * Shows every document currently mid-pipeline (any non-terminal stage)
 * across all orgs. Auto-refreshes every 30s via the client component.
 *
 * Auth: /admin layout already gates is_platform_admin. By the time we
 * render here the caller is verified.
 */
import { createServiceSupabase } from '@/lib/supabase/server'
import { IngestionProgressGlobal } from './ingestion-progress-global-client'

export const metadata = { title: 'Ingestion Progress · Admin' }
export const dynamic = 'force-dynamic'

interface ActiveRow {
  id: string
  document_id: string
  organization_id: string
  stage: string
  stage_started_at: string
  stage_completed_at: string | null
  error_message: string | null
}

export default async function IngestionProgressPage() {
  const service = createServiceSupabase()

  // Latest row per document for any active (non-terminal) stage. We grab the
  // last 200 rows ordered by start time — the client filters to active.
  const { data } = await service
    .from('ingestion_progress')
    .select('id, document_id, organization_id, stage, stage_started_at, stage_completed_at, error_message')
    .order('stage_started_at', { ascending: false })
    .limit(500)

  const rows: ActiveRow[] = (data ?? []) as ActiveRow[]

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-bold">Ingestion Progress (global)</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        All documents currently in-flight across orgs. Auto-refreshes every
        30 seconds.
      </p>
      <IngestionProgressGlobal initialRows={rows} />
    </div>
  )
}
