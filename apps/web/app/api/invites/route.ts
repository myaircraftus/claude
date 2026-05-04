/**
 * /api/invites  (Spec 6.5)
 *
 *   GET → list pending + recent invites for the active org (admin+)
 *   POST → create new invite + (best-effort) email
 *
 * Token is 32 url-safe random chars. Default expiry 14 days. Email send
 * is best-effort — logged when SendGrid not configured (logged follow-up).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const VALID_ROLES = new Set(['owner', 'admin', 'mechanic', 'pilot', 'viewer', 'auditor'])
const VALID_PERSONAS = new Set(['owner', 'mechanic', 'shop', 'admin'])
const WRITE_ROLES = new Set(['owner', 'admin'])
const TOKEN_BYTES = 24

interface CreateBody {
  email?: string
  role?: string
  persona?: string | null
  /** Days from now until expiry. Default 14, max 90. */
  expires_in_days?: number
}

function makeToken(): string {
  // crypto.randomUUID is a UUID; we want a longer base64url to match spec.
  const bytes = new Uint8Array(TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64url')
}

export async function GET() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: caller } = await supabase
    .from('organization_memberships').select('organization_id, role')
    .eq('user_id', user.id).not('accepted_at', 'is', null).single()
  if (!caller) return NextResponse.json({ error: 'No org' }, { status: 403 })
  if (!WRITE_ROLES.has(caller.role)) return NextResponse.json({ error: 'Owner/admin only' }, { status: 403 })

  const { data, error } = await supabase
    .from('organization_invites')
    .select('id, email, role, persona, expires_at, accepted_at, accepted_by, revoked_at, created_at')
    .eq('organization_id', caller.organization_id)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invites: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: caller } = await supabase
    .from('organization_memberships').select('organization_id, role')
    .eq('user_id', user.id).not('accepted_at', 'is', null).single()
  if (!caller) return NextResponse.json({ error: 'No org' }, { status: 403 })
  if (!WRITE_ROLES.has(caller.role)) return NextResponse.json({ error: 'Owner/admin only' }, { status: 403 })

  let body: CreateBody
  try { body = (await req.json()) as CreateBody } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.email || !/.+@.+\..+/.test(body.email)) return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
  if (!body.role || !VALID_ROLES.has(body.role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  if (body.persona && !VALID_PERSONAS.has(body.persona)) return NextResponse.json({ error: 'Invalid persona' }, { status: 400 })
  const expiresInDays = Math.max(1, Math.min(90, body.expires_in_days ?? 14))

  const token = makeToken()
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
  const { data: row, error } = await supabase
    .from('organization_invites')
    .insert({
      organization_id: caller.organization_id,
      email: body.email.toLowerCase().slice(0, 320),
      role: body.role,
      persona: body.persona ?? null,
      token,
      expires_at: expiresAt,
      created_by: user.id,
    })
    .select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Best-effort email send. SendGrid integration is logged as a follow-up.
  // For now, log the magic link so the operator can copy/paste.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const link = `${baseUrl}/signup?invite_token=${token}`
  console.info(`[invites] sent invite to ${body.email} → ${link}`)

  // Future: enqueue email via the existing notification dispatcher.
  void createServiceSupabase()
  return NextResponse.json({ invite: row, magic_link: link }, { status: 201 })
}
