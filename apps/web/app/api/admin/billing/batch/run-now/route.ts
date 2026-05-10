/**
 * POST /api/admin/billing/batch/run-now — Phase 14 Sprint 14.5
 *
 * Force-bumps every queued job's scheduled_for to NOW(), letting the
 * Colab queue worker + Modal fallback cron pick them up immediately.
 * Useful for emergencies (cron failed) or for doing an early run.
 *
 * Optional ?tier=standard|pro|all  — restrict to one tier.
 *
 * Auth: is_platform_admin only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { parseJsonBody } from '@/lib/validation/common'

const Body = z
  .object({
    tier: z.enum(['standard', 'pro', 'all']).optional(),
  })
  .strict()

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
  const tierFilter = parsed.data.tier ?? 'all'

  const service = createServiceSupabase()

  // Find candidate jobs whose scheduled_for is in the future. Tier
  // filter requires joining via organizations; if the operator asked
  // for "all" we just bump everything queued.
  let query = service
    .from('vision_index_jobs')
    .select('id, organization_id')
    .eq('status', 'queued')
    .gt('scheduled_for', new Date().toISOString())

  if (tierFilter !== 'all') {
    // Pre-filter org IDs of the target tier to avoid an in-DB join we
    // can't express through PostgREST cleanly.
    const { data: orgs } = await service
      .from('organizations')
      .select('id')
      .eq('tier', tierFilter)
    const orgIds = (orgs as any[])?.map((o) => o.id) ?? []
    if (orgIds.length === 0) {
      return NextResponse.json({ ok: true, bumped: 0, tier: tierFilter })
    }
    query = query.in('organization_id', orgIds)
  }

  const { data: candidates, error: selErr } = await query
  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500 })
  }
  const ids = ((candidates as any[]) ?? []).map((j) => j.id)
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, bumped: 0, tier: tierFilter })
  }

  const { error: updErr } = await service
    .from('vision_index_jobs')
    .update({ scheduled_for: new Date().toISOString() })
    .in('id', ids)
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, bumped: ids.length, tier: tierFilter })
}
