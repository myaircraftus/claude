/**
 * /api/observability/error — Phase 16 Sprint 16.5
 *
 * Receives client-side error reports from
 * lib/observability/error-capture.ts:installClientErrorHandlers().
 * Auth-optional: if a session exists we tag the error with user_id +
 * organization_id; otherwise we accept anonymous reports (e.g. errors
 * on public marketing pages before login).
 *
 * Body shape: ErrorEventInput minus `origin` (forced to 'client').
 *
 * Throttling lives on the client side (10/session/min). Server side
 * just protects against payload abuse: we cap stack to 32K and reject
 * payloads larger than 64K total.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { recordErrorEvent } from '@/lib/observability/error-capture'

export const dynamic = 'force-dynamic'

const MAX_STACK = 32 * 1024
const MAX_PAYLOAD = 64 * 1024

export async function POST(req: NextRequest) {
  // Coarse payload size check — abuse guard.
  const contentLength = req.headers.get('content-length')
  if (contentLength && Number(contentLength) > MAX_PAYLOAD) {
    return NextResponse.json({ error: 'payload too large' }, { status: 413 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || typeof body.message !== 'string') {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
  }

  // Try to attach user/org if a session exists. Don't fail the request
  // if not — anonymous client errors still get logged.
  const supabase = createServerSupabase()
  let userId: string | null = null
  let orgId: string | null = null
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      userId = user.id
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('organization_id')
        .eq('user_id', user.id)
        .not('accepted_at', 'is', null)
        .limit(1)
        .maybeSingle()
      orgId = (membership as { organization_id: string } | null)?.organization_id ?? null
    }
  } catch { /* unauth path */ }

  const service = createServiceSupabase()
  const result = await recordErrorEvent(service, {
    origin: 'client',
    message: String(body.message).slice(0, 4096),
    stack: typeof body.stack === 'string' ? body.stack.slice(0, MAX_STACK) : null,
    route: typeof body.route === 'string' ? body.route.slice(0, 1024) : null,
    persona: typeof body.persona === 'string' ? body.persona : null,
    build_sha: typeof body.build_sha === 'string' ? body.build_sha : null,
    user_id: userId ?? (typeof body.user_id === 'string' ? body.user_id : null),
    organization_id: orgId ?? (typeof body.organization_id === 'string' ? body.organization_id : null),
    metadata: typeof body.metadata === 'object' && body.metadata ? body.metadata : {},
    severity: ['P0', 'P1', 'P2', 'P3'].includes(body.severity) ? body.severity : 'P2',
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id: result.id })
}
