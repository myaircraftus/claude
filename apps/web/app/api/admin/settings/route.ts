/**
 * GET  /api/admin/settings — read app_settings rows
 * POST /api/admin/settings — write a single setting
 *
 * Surface for the /admin/ingestion-health "Auto-retry mode" toggle.
 * Platform-admin only. The reads/writes go through the service-role
 * client so we don't have to grant SELECT/UPDATE to authenticated.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_KEYS = new Set(['ingestion_auto_retry', 'ingestion_auto_retry_limit'])

async function requirePlatformAdmin() {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, status: 401, body: { error: 'Unauthorized' } }
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_platform_admin) {
    return { ok: false as const, status: 403, body: { error: 'Forbidden' } }
  }
  return { ok: true as const, user }
}

export async function GET(_req: NextRequest) {
  const auth = await requirePlatformAdmin()
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status })

  const service = createServiceSupabase()
  const { data, error } = await service
    .from('app_settings')
    .select('key, value, updated_at')
    .in('key', Array.from(ALLOWED_KEYS))

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const settings: Record<string, any> = {}
  for (const row of data ?? []) {
    settings[(row as any).key] = (row as any).value
  }
  return NextResponse.json({
    settings,
    env_override:
      (process.env.INGESTION_AUTO_RETRY ?? '').toLowerCase() === 'off'
        ? 'INGESTION_AUTO_RETRY=off in env (forces auto-retry off regardless of this setting)'
        : null,
  })
}

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAdmin()
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status })

  let body: { key?: string; value?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.key || !ALLOWED_KEYS.has(body.key)) {
    return NextResponse.json(
      { error: `Unknown setting key. Allowed: ${Array.from(ALLOWED_KEYS).join(', ')}` },
      { status: 400 },
    )
  }

  // Validate per-key.
  if (body.key === 'ingestion_auto_retry') {
    if (!['off', 'smart_once', 'on'].includes(body.value as string)) {
      return NextResponse.json(
        { error: 'ingestion_auto_retry must be one of: off, smart_once, on' },
        { status: 400 },
      )
    }
  } else if (body.key === 'ingestion_auto_retry_limit') {
    const n = Number(body.value)
    if (!Number.isInteger(n) || n < 0 || n > 10) {
      return NextResponse.json(
        { error: 'ingestion_auto_retry_limit must be an integer 0-10' },
        { status: 400 },
      )
    }
    body.value = n
  }

  const service = createServiceSupabase()
  const { data, error } = await service
    .from('app_settings')
    .upsert(
      {
        key: body.key,
        value: body.value,
        updated_at: new Date().toISOString(),
        updated_by_user_id: auth.user.id,
      },
      { onConflict: 'key' },
    )
    .select('key, value, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, setting: data })
}
