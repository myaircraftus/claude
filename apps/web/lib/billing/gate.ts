import { createServiceSupabase } from '@/lib/supabase/server'

export type BillingState = 'trial' | 'active' | 'paywalled' | 'cancelled' | 'past_due'

export interface BillingStatus {
  state: BillingState
  trialEndsAt: string | null
  trialDaysRemaining: number | null
  paywalledReason: string | null
  subscriptionStatus: string | null
  stripeSubscriptionId: string | null
  pricePerAircraftCents: number
  billingModel: string
  canWrite: boolean
  canUseMessaging: boolean
}

function daysBetween(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

export async function getOrganizationBillingStatus(organizationId: string): Promise<BillingStatus> {
  const service = createServiceSupabase()
  const { data: org } = await service
    .from('organizations')
    .select('id, subscription_status, trial_ends_at, paywalled_reason, stripe_subscription_id, billing_model, price_per_aircraft_cents')
    .eq('id', organizationId)
    .maybeSingle()

  const now = new Date()
  const trialEndsAt = org?.trial_ends_at ?? null
  const trialDaysRemaining = trialEndsAt
    ? Math.max(0, daysBetween(now, new Date(trialEndsAt)))
    : null

  let state: BillingState = (org?.subscription_status as BillingState) ?? 'trial'

  if (state === 'trial' && trialEndsAt && new Date(trialEndsAt) < now) {
    state = 'paywalled'
  }

  const canWrite = state === 'active' || state === 'trial'
  const canUseMessaging = true // messaging always available, even when paywalled

  return {
    state,
    trialEndsAt,
    trialDaysRemaining,
    paywalledReason: org?.paywalled_reason ?? null,
    subscriptionStatus: org?.subscription_status ?? null,
    stripeSubscriptionId: org?.stripe_subscription_id ?? null,
    pricePerAircraftCents: org?.price_per_aircraft_cents ?? 10000,
    billingModel: org?.billing_model ?? 'per_aircraft',
    canWrite,
    canUseMessaging,
  }
}

export class BillingBlockedError extends Error {
  constructor(public readonly status: BillingStatus) {
    super(status.paywalledReason || 'Billing subscription required to perform this action')
  }
}

export async function requireActiveBilling(organizationId: string): Promise<BillingStatus> {
  const status = await getOrganizationBillingStatus(organizationId)
  if (!status.canWrite) throw new BillingBlockedError(status)
  return status
}
