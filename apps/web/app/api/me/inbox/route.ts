/**
 * GET  /api/me/inbox  → { inbox_email, inbox_phone, has_credentials: { ... } }
 * POST /api/me/inbox  → on-demand: re-allocate the user's own inbox_email
 *                       (e.g. after they change their handle).
 *
 * Lets the profile/settings page show the user their myaircraft.us
 * address and which third-party scrapers are wired up. The POST is the
 * self-serve fallback when allocate-emails (admin-wide backfill) hasn't
 * been run.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceSupabase()
  const { data: profile } = await service
    .from('user_profiles')
    .select('inbox_email, inbox_phone, handle, full_name')
    .eq('id', user.id)
    .maybeSingle()

  const { data: creds } = await service
    .from('external_system_credentials')
    .select('system, login_email, last_synced_at, last_error, scrape_disabled')
    .eq('user_id', user.id)
    .order('system')

  return NextResponse.json({
    inbox_email: profile?.inbox_email ?? null,
    inbox_phone: profile?.inbox_phone ?? null,
    handle: profile?.handle ?? null,
    full_name: profile?.full_name ?? null,
    external_systems: creds ?? [],
  })
}

export async function POST(_req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const service = createServiceSupabase()
  const { data, error } = await service.rpc('allocate_inbox_email', { p_user_id: user.id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, inbox_email: data })
}
