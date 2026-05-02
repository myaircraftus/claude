/**
 * Trial start + anti-abuse logic.
 *
 * Starting a trial creates an entitlement row with status='trial' and
 * trial_ends_at = now + 30 days. Before doing so we run abuse checks:
 *
 *   1. The org must have a payment method on file (Stripe SetupIntent
 *      succeeded). This is the single biggest abuse deterrent — disposable
 *      email addresses don't help if the user can't put a fresh card on file.
 *   2. The card fingerprint hasn't already been used to start a trial in
 *      another org (prevents one card spinning up unlimited trials).
 *   3. The signup email hasn't been used for more than one trial in the past
 *      365 days.
 *   4. The IP address hasn't started more than 3 trials in the past 24 hours.
 *
 * All checks are server-side and use the service-role Supabase client, so they
 * cannot be bypassed by a client editing localStorage / cookies.
 */

import { createServiceSupabase } from '@/lib/supabase/server'
import type { Persona } from './gate'

export interface TrialStartContext {
  organizationId: string
  persona: Persona
  userId: string
  userEmail: string
  ipAddress: string | null
  userAgent: string | null
}

export type TrialBlockReason =
  | 'no_payment_method'
  | 'card_already_used'
  | 'email_trial_limit'
  | 'ip_rate_limit'
  | 'persona_already_active'

export interface TrialStartResult {
  ok: boolean
  blocked?: TrialBlockReason
  message?: string
  trialEndsAt?: string
}

const TRIAL_DAYS = 30
const MAX_TRIALS_PER_EMAIL_PER_YEAR = 1
const MAX_TRIALS_PER_IP_PER_DAY = 3

function trialEndDate(): Date {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + TRIAL_DAYS)
  return d
}

export async function startPersonaTrial(ctx: TrialStartContext): Promise<TrialStartResult> {
  const service = createServiceSupabase()

  // 1. Don't start a duplicate trial for a persona that already has access
  const { data: existing } = await service
    .from('entitlements')
    .select('status')
    .eq('organization_id', ctx.organizationId)
    .eq('persona', ctx.persona)
    .maybeSingle()

  if (existing && (existing.status === 'trial' || existing.status === 'active')) {
    return {
      ok: false,
      blocked: 'persona_already_active',
      message: `Already have an active ${ctx.persona} entitlement.`,
    }
  }

  // 2. Org must have a payment method on file (SetupIntent already completed)
  const { data: org } = await service
    .from('organizations')
    .select('stripe_payment_method_id, payment_method_card_fingerprint')
    .eq('id', ctx.organizationId)
    .maybeSingle()

  if (!org?.stripe_payment_method_id) {
    return {
      ok: false,
      blocked: 'no_payment_method',
      message: 'Add a payment method before starting your trial.',
    }
  }

  const fingerprint = org.payment_method_card_fingerprint

  // 3. Card fingerprint must not have been used by another org for a trial
  if (fingerprint) {
    const { data: otherOrgs } = await service
      .from('organizations')
      .select('id')
      .eq('payment_method_card_fingerprint', fingerprint)
      .neq('id', ctx.organizationId)
      .limit(1)

    if (otherOrgs && otherOrgs.length > 0) {
      await recordSignupAttempt({
        ...ctx,
        cardFingerprint: fingerprint,
        outcome: 'blocked_card',
        blockedReason: 'card_already_used_for_other_trial',
      })
      return {
        ok: false,
        blocked: 'card_already_used',
        message: 'This card has already been used to start a trial. Sign in to your existing account or contact support.',
      }
    }
  }

  // 4. Email-level trial limit (cross-org). Use exact case-insensitive match —
  // not .ilike(), which would interpret `%` / `_` in the value as wildcards.
  const normalizedEmail = ctx.userEmail.trim().toLowerCase()
  const yearAgo = new Date()
  yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1)
  const { count: emailTrialCount } = await service
    .from('signup_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('email', normalizedEmail)
    .eq('outcome', 'succeeded')
    .gte('created_at', yearAgo.toISOString())

  if ((emailTrialCount ?? 0) >= MAX_TRIALS_PER_EMAIL_PER_YEAR) {
    await recordSignupAttempt({
      ...ctx,
      cardFingerprint: fingerprint,
      outcome: 'blocked_email',
      blockedReason: 'email_trial_limit_reached',
    })
    return {
      ok: false,
      blocked: 'email_trial_limit',
      message: `This email has already used its trial. Subscribe to continue or contact support.`,
    }
  }

  // 5. IP-level burst limit (last 24 hours)
  if (ctx.ipAddress) {
    const dayAgo = new Date()
    dayAgo.setUTCHours(dayAgo.getUTCHours() - 24)
    const { count: ipTrialCount } = await service
      .from('signup_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', ctx.ipAddress)
      .eq('outcome', 'succeeded')
      .gte('created_at', dayAgo.toISOString())

    if ((ipTrialCount ?? 0) >= MAX_TRIALS_PER_IP_PER_DAY) {
      await recordSignupAttempt({
        ...ctx,
        cardFingerprint: fingerprint,
        outcome: 'blocked_ip',
        blockedReason: 'ip_rate_limit_reached',
      })
      return {
        ok: false,
        blocked: 'ip_rate_limit',
        message: `Too many signups from this network. Try again later or contact support.`,
      }
    }
  }

  // All checks passed — create or update the entitlement
  const trialEnd = trialEndDate()
  const { error: upsertErr } = await service
    .from('entitlements')
    .upsert({
      organization_id: ctx.organizationId,
      persona: ctx.persona,
      status: 'trial',
      trial_ends_at: trialEnd.toISOString(),
      trial_started_at: new Date().toISOString(),
      paywalled_reason: null,
    }, { onConflict: 'organization_id,persona' })

  if (upsertErr) {
    return { ok: false, message: `Failed to start trial: ${upsertErr.message}` }
  }

  await recordSignupAttempt({
    ...ctx,
    cardFingerprint: fingerprint,
    outcome: 'succeeded',
  })

  return { ok: true, trialEndsAt: trialEnd.toISOString() }
}

async function recordSignupAttempt(args: {
  organizationId: string
  userId: string
  userEmail: string
  ipAddress: string | null
  userAgent: string | null
  cardFingerprint: string | null | undefined
  outcome: 'succeeded' | 'blocked_email' | 'blocked_ip' | 'blocked_card' | 'blocked_other'
  blockedReason?: string
}): Promise<void> {
  const service = createServiceSupabase()
  await service.from('signup_attempts').insert({
    email: args.userEmail.trim().toLowerCase(),
    ip_address: args.ipAddress,
    user_agent: args.userAgent,
    card_fingerprint: args.cardFingerprint ?? null,
    user_id: args.userId,
    organization_id: args.organizationId,
    outcome: args.outcome,
    blocked_reason: args.blockedReason ?? null,
  })
}

/**
 * Read the requesting client's IP address from common reverse-proxy headers.
 * Vercel forwards via x-forwarded-for; we take the first entry.
 */
export function extractClientIp(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return headers.get('x-real-ip') || headers.get('cf-connecting-ip') || null
}
