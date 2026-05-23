/**
 * /api/owner/external-systems
 *
 * Manage the owner's stored credentials for third-party tools that the
 * browser-automation scraper logs into on their behalf (Flight Schedule
 * Pro, Flight Circle, etc.).
 *
 * GET  → list configured systems (NEVER returns the decrypted password)
 * POST → upsert credentials for a system (encrypts the password before
 *        storing; the plaintext stays in memory just long enough to
 *        encrypt and is dropped)
 * DELETE ?system=<id> → delete credentials for a system
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { encryptCredential } from '@/lib/security/envelope-crypt'

export const runtime = 'nodejs'

const SUPPORTED_SYSTEMS = new Set([
  'flight_schedule_pro',
  'flight_circle',
  'shop_monkey',
  'mechanics_helper',
  'quickbooks',
  'other',
])

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceSupabase()
  const { data, error } = await service
    .from('external_system_credentials')
    .select('id, system, login_email, last_synced_at, last_error, scrape_disabled, created_at, updated_at')
    .eq('user_id', user.id)
    .order('system')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ systems: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    system?: string
    login_email?: string
    password?: string
  }
  const system = (body.system ?? '').trim()
  const loginEmail = (body.login_email ?? '').trim().toLowerCase()
  const password = body.password ?? ''
  if (!SUPPORTED_SYSTEMS.has(system)) {
    return NextResponse.json({ error: 'Unsupported system' }, { status: 400 })
  }
  if (!loginEmail || !password) {
    return NextResponse.json({ error: 'login_email and password required' }, { status: 400 })
  }

  let ciphertext: Buffer
  let iv: Buffer
  try {
    const enc = encryptCredential(password)
    ciphertext = enc.ciphertext
    iv = enc.iv
  } catch (e) {
    // EXTERNAL_CRED_KEK missing/misconfigured. Don't leak the actual
    // env-var name in the public response.
    console.error('[external-systems] credential encryption failed:', e)
    return NextResponse.json(
      { error: 'Server credential storage misconfigured' },
      { status: 500 },
    )
  }

  const service = createServiceSupabase()
  // Find org via membership
  const { data: membership } = await service
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .limit(1)
    .maybeSingle()

  const { data: row, error } = await service
    .from('external_system_credentials')
    .upsert(
      {
        user_id: user.id,
        organization_id: membership?.organization_id ?? null,
        system,
        login_email: loginEmail,
        password_encrypted: ciphertext,
        password_iv: iv,
        scrape_disabled: false,
        last_error: null,
      },
      { onConflict: 'user_id,system' },
    )
    .select('id, system, login_email, last_synced_at')
    .single()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, system: row })
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const system = req.nextUrl.searchParams.get('system')
  if (!system) return NextResponse.json({ error: 'system required' }, { status: 400 })
  const service = createServiceSupabase()
  await service
    .from('external_system_credentials')
    .delete()
    .eq('user_id', user.id)
    .eq('system', system)
  return NextResponse.json({ ok: true })
}
