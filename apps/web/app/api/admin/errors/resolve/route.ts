/**
 * POST /api/admin/errors/resolve — Phase 13.4 mark a failure resolved.
 *
 * Sets metadata.resolved=true on the ingestion_progress row so it drops
 * out of the default error log view. Idempotent.
 *
 * Auth: is_platform_admin only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { parseJsonBody, safeUuid } from '@/lib/validation/common'

const Body = z.object({
  progressId: safeUuid,
})

export async function POST(req: NextRequest) {
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

  const parsed = await parseJsonBody(req, Body)
  if (!parsed.ok) return parsed.response

  const service = createServiceSupabase()
  // Read existing metadata so we don't clobber other keys
  const { data: row } = await service
    .from('ingestion_progress')
    .select('metadata')
    .eq('id', parsed.data.progressId)
    .single()
  if (!row) {
    return NextResponse.json({ error: 'Progress row not found' }, { status: 404 })
  }
  const newMetadata = {
    ...((row.metadata as Record<string, unknown>) ?? {}),
    resolved: true,
    resolved_by: user.id,
    resolved_at: new Date().toISOString(),
  }
  const { error } = await service
    .from('ingestion_progress')
    .update({ metadata: newMetadata })
    .eq('id', parsed.data.progressId)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
