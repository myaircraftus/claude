/**
 * POST /api/admin/safety/cross-tenant-audit
 *
 * Admin-only one-shot audit. Body: { calling_org_id, question,
 * chunk_ids: string[] }. Useful for replaying a suspicious /api/ask
 * answer through the cross-tenant audit to confirm the chunks all
 * came from the right org.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { auditRagRetrieval } from '@/lib/agents/impl/safety-cross-tenant-leak-watchdog'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.is_platform_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    calling_org_id?: string
    question?: string
    chunk_ids?: string[]
  }
  if (!body.calling_org_id || !Array.isArray(body.chunk_ids)) {
    return NextResponse.json(
      { error: 'calling_org_id and chunk_ids[] required' },
      { status: 400 },
    )
  }
  const service = createServiceSupabase()
  const result = await auditRagRetrieval({
    supabase: service,
    triggeredBy: user.id,
    callingOrgId: body.calling_org_id,
    question: body.question ?? '',
    chunkIds: body.chunk_ids,
  })
  return NextResponse.json({
    ok: result.ok,
    run_id: result.runId,
    ...(result.output ?? {}),
  })
}
