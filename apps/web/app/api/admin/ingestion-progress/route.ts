/**
 * GET /api/admin/ingestion-progress
 *
 * Phase 13.3 admin-only global ingestion progress feed. Used by the polling
 * client component on /admin/ingestion/progress to refresh every 30s.
 *
 * Auth: requires user_profiles.is_platform_admin = true. Returns 403 for
 * everyone else (including org admins / owners).
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
  const { data, error } = await service
    .from('ingestion_progress')
    .select(
      'id, document_id, organization_id, stage, stage_started_at, stage_completed_at, error_message',
    )
    .order('stage_started_at', { ascending: false })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ rows: data ?? [] })
}
