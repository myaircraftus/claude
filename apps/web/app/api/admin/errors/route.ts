/**
 * GET /api/admin/errors — Phase 13.4 admin-only ingestion error feed.
 *
 * Returns the latest 200 failed rows joined with document context. Used by
 * the polling client component on /admin/errors.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export async function GET(_req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_platform_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceSupabase()
  const { data: failedRows, error } = await service
    .from('ingestion_progress')
    .select('id, document_id, organization_id, stage_started_at, error_message, metadata')
    .eq('stage', 'failed')
    .order('stage_started_at', { ascending: false })
    .limit(200)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const docIds = Array.from(new Set((failedRows ?? []).map((r: any) => r.document_id)))
  const { data: docs } = docIds.length
    ? await service
        .from('documents')
        .select(
          'id, title, file_name, doc_type, document_type, uploaded_by_persona, page_count',
        )
        .in('id', docIds)
    : { data: [] as any[] }

  const docMap = new Map<string, any>((docs ?? []).map((d: any) => [d.id, d]))

  const rows = (failedRows ?? []).map((r: any) => {
    const doc = docMap.get(r.document_id)
    return {
      id: r.id,
      document_id: r.document_id,
      organization_id: r.organization_id,
      stage_started_at: r.stage_started_at,
      error_message: r.error_message ?? null,
      resolved: Boolean(r.metadata?.resolved),
      doc_title: doc?.title ?? doc?.file_name ?? '(unknown)',
      doc_type: doc?.document_type ?? doc?.doc_type ?? null,
      uploaded_by_persona: doc?.uploaded_by_persona ?? null,
      page_count: doc?.page_count ?? null,
    }
  })

  return NextResponse.json({ rows })
}
