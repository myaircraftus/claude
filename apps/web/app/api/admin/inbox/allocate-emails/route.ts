/**
 * POST /api/admin/inbox/allocate-emails
 *
 * One-shot backfill: assign an inbox_email to every user_profile that
 * doesn't have one. Idempotent — users already with an inbox_email are
 * skipped.
 *
 * Admin-only. After flipping the Resend MX records you call this once
 * and every existing user gets their @myaircraft.us address. New
 * signups will need a hook in the onboarding flow (separate work).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(_req: NextRequest) {
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

  const service = createServiceSupabase()
  const { data: needs } = await service
    .from('user_profiles')
    .select('id')
    .is('inbox_email', null)
  if (!needs || needs.length === 0) {
    return NextResponse.json({ ok: true, allocated: 0, note: 'every user already has an inbox_email' })
  }

  let allocated = 0
  const failures: Array<{ id: string; error: string }> = []
  for (const row of needs) {
    const { data, error } = await service.rpc('allocate_inbox_email', { p_user_id: row.id })
    if (error) {
      failures.push({ id: row.id, error: error.message })
    } else if (data) {
      allocated += 1
    }
  }
  return NextResponse.json({ ok: true, allocated, failures })
}
