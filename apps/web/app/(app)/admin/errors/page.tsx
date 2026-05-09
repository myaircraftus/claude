/**
 * /admin/errors — Phase 13.4 admin-only ingestion error log.
 *
 * Lists every document that hit stage='failed' in ingestion_progress, joined
 * with documents (for title + uploader persona). Operators can:
 *   - Retry — re-enqueue the doc into vision_index_jobs via Phase 12's
 *     enqueueDocumentForVision helper.
 *   - Mark resolved — sets metadata.resolved=true on the progress row so it
 *     drops out of the default view.
 *
 * Auth: /admin layout already gates is_platform_admin. By the time we render
 * here the caller is verified.
 */
import { createServiceSupabase } from '@/lib/supabase/server'
import { ErrorLogClient, type ErrorRow } from './error-log-client'

export const metadata = { title: 'Ingestion Errors · Admin' }
export const dynamic = 'force-dynamic'

export default async function AdminErrorsPage() {
  const service = createServiceSupabase()

  // Latest 200 failures with the doc + uploader context joined in. Hidden
  // (resolved=true) rows are filtered server-side; the client toggles them
  // back on via a "Show resolved" filter.
  const { data: failedRows } = await service
    .from('ingestion_progress')
    .select('id, document_id, organization_id, stage, stage_started_at, error_message, metadata')
    .eq('stage', 'failed')
    .order('stage_started_at', { ascending: false })
    .limit(200)

  const docIds = Array.from(new Set((failedRows ?? []).map((r: any) => r.document_id)))
  const { data: docs } = docIds.length
    ? await service
        .from('documents')
        .select('id, title, file_name, doc_type, document_type, uploaded_by_persona, organization_id, page_count')
        .in('id', docIds)
    : { data: [] as any[] }

  const docMap = new Map<string, any>((docs ?? []).map((d: any) => [d.id, d]))

  const rows: ErrorRow[] = (failedRows ?? []).map((r: any) => {
    const doc = docMap.get(r.document_id)
    return {
      id: r.id,
      document_id: r.document_id,
      organization_id: r.organization_id,
      stage_started_at: r.stage_started_at,
      error_message: r.error_message ?? null,
      resolved: Boolean(r.metadata?.resolved),
      doc_title: doc?.title ?? doc?.file_name ?? '(unknown)',
      doc_type: (doc?.document_type as string) ?? (doc?.doc_type as string) ?? null,
      uploaded_by_persona: (doc?.uploaded_by_persona as string) ?? null,
      page_count: (doc?.page_count as number) ?? null,
    }
  })

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-bold">Ingestion errors</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Documents that failed at any pipeline stage. Retry to re-enqueue
        into the vision queue; mark resolved to hide from default view.
      </p>
      <ErrorLogClient initialRows={rows} />
    </div>
  )
}
