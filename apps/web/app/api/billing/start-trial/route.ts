import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { startPersonaTrial, extractClientIp } from '@/lib/billing/trial'

const schema = z.object({
  persona: z.enum(['owner', 'mechanic']),
})

/**
 * Start a 30-day trial for the given persona on the caller's org.
 * Requires: a payment method on file (anti-abuse), no existing active
 * entitlement for this persona, signup not flagged by email/IP/card limits.
 *
 * Returns 402 Payment Required if no card on file, 429 if rate-limited,
 * 200 with trialEndsAt on success.
 */
export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = schema.safeParse(await req.json().catch(() => null))
  if (!body.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const result = await startPersonaTrial({
    organizationId: ctx.organizationId,
    persona: body.data.persona,
    userId: ctx.user.id,
    userEmail: ctx.user.email ?? '',
    ipAddress: extractClientIp(req.headers),
    userAgent: req.headers.get('user-agent'),
  })

  if (!result.ok) {
    const httpStatus =
      result.blocked === 'no_payment_method' ? 402 :
      result.blocked === 'ip_rate_limit' ? 429 :
      result.blocked === 'card_already_used' ? 409 :
      result.blocked === 'email_trial_limit' ? 409 :
      result.blocked === 'persona_already_active' ? 409 :
      400

    return NextResponse.json(
      { error: result.message, blocked: result.blocked },
      { status: httpStatus },
    )
  }

  return NextResponse.json({
    ok: true,
    persona: body.data.persona,
    trialEndsAt: result.trialEndsAt,
  })
}
