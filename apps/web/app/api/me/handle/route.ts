/**
 * PATCH /api/me/handle
 *
 * Lets the owner / mechanic change their handle. The new handle drives
 * their @myaircraft.us inbox address, so this also re-allocates
 * inbox_email via the SECURITY DEFINER allocate_inbox_email function.
 *
 * Validation mirrors /api/me/handle-available:
 *   - 3-32 chars, [a-z0-9-]+, starts alphanumeric
 *   - not on the RESERVED list
 *   - not taken by another user
 *
 * On success: { ok: true, handle, inbox_email }.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

const HANDLE_RE = /^[a-z0-9][a-z0-9-]{2,31}$/
const RESERVED = new Set([
  'admin', 'api', 'app', 'auth', 'login', 'logout', 'signup', 'onboarding',
  'settings', 'dashboard', 'aircraft', 'work-orders', 'invoices', 'estimates',
  'maintenance', 'logbook', 'squawks', 'documents', 'marketplace', 'reports',
  'reminders', 'chat', 'help', 'support', 'about', 'pricing', 'blog', 'legal',
  'privacy', 'terms', 'owner', 'mechanic', 'pilot', 'fleet', 'me', 'you',
  'myaircraft', 'root', 'system', 'staff', 'team', 'users', 'user', 'new',
  'scanner', 'ai', 'public', 'static', 'assets', 'noreply', 'no-reply',
  'postmaster', 'abuse', 'security',
])

export const runtime = 'nodejs'

export async function PATCH(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { handle?: unknown }
  try {
    body = (await req.json()) as { handle?: unknown }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const raw = String(body.handle ?? '').trim().toLowerCase()
  if (!HANDLE_RE.test(raw)) {
    return NextResponse.json(
      {
        error: 'Invalid handle format',
        message:
          'Handle must be 3-32 chars, start alphanumeric, only lowercase letters/numbers/dashes.',
      },
      { status: 400 },
    )
  }
  if (RESERVED.has(raw)) {
    return NextResponse.json({ error: 'Handle is reserved' }, { status: 400 })
  }

  // Check uniqueness (case-insensitive)
  const { data: existing } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('handle', raw)
    .neq('id', user.id)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ error: 'Handle already taken' }, { status: 409 })
  }

  // Update handle on the user's own row (RLS allows self-update)
  const { error: upErr } = await supabase
    .from('user_profiles')
    .update({ handle: raw, updated_at: new Date().toISOString() })
    .eq('id', user.id)
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  // Re-allocate inbox_email via the SECURITY DEFINER function (self-allowed)
  const { data: newAddr, error: allocErr } = await supabase.rpc(
    'allocate_inbox_email',
    { p_user_id: user.id },
  )
  if (allocErr) {
    return NextResponse.json(
      {
        ok: true,
        handle: raw,
        inbox_email: null,
        warning: `Handle saved but inbox re-allocation failed: ${allocErr.message}`,
      },
      { status: 200 },
    )
  }
  return NextResponse.json({ ok: true, handle: raw, inbox_email: newAddr })
}
