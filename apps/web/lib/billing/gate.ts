import { createServiceSupabase } from '@/lib/supabase/server'

export type Persona = 'owner' | 'mechanic'
export type BillingState = 'trial' | 'active' | 'paywalled' | 'cancelled' | 'past_due' | 'none'

export interface PersonaEntitlement {
  persona: Persona
  state: BillingState
  trialEndsAt: string | null
  trialDaysRemaining: number | null
  paywalledReason: string | null
  stripeSubscriptionId: string | null
  bundle: boolean
  canRead: boolean
  canWrite: boolean
}

export interface BillingStatus {
  organizationId: string
  owner: PersonaEntitlement
  mechanic: PersonaEntitlement
  // True if at least one persona has access — useful for "has the user paid for anything?"
  hasAnyAccess: boolean
  // True if both personas are paid (for upsell hide logic)
  hasBundleEquivalent: boolean
  // Legacy fields kept so old callers compile until they're migrated
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

interface EntitlementRow {
  persona: Persona
  status: BillingState
  trial_ends_at: string | null
  paywalled_reason: string | null
  stripe_subscription_id: string | null
  bundle: boolean
}

function daysBetween(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

function emptyEntitlement(persona: Persona): PersonaEntitlement {
  return {
    persona,
    state: 'none',
    trialEndsAt: null,
    trialDaysRemaining: null,
    paywalledReason: null,
    stripeSubscriptionId: null,
    bundle: false,
    canRead: false,
    canWrite: false,
  }
}

function deriveEntitlement(persona: Persona, row: EntitlementRow | null): PersonaEntitlement {
  if (!row) return emptyEntitlement(persona)

  const now = new Date()
  const trialEndsAt = row.trial_ends_at ?? null
  const trialDaysRemaining = trialEndsAt
    ? Math.max(0, daysBetween(now, new Date(trialEndsAt)))
    : null

  let state: BillingState = row.status
  let paywalledReason = row.paywalled_reason ?? null

  // Trial that has aged past its end date is functionally paywalled even if
  // a webhook hasn't transitioned the row yet.
  if (state === 'trial' && trialEndsAt && new Date(trialEndsAt) < now) {
    state = 'paywalled'
    paywalledReason = paywalledReason ?? 'trial_expired'
  }

  const canWrite = state === 'active' || state === 'trial'
  // canRead stays true on paywall — paywalled tenants see read-only data with
  // an upgrade banner instead of a hard block.
  const canRead = state !== 'cancelled'

  return {
    persona,
    state,
    trialEndsAt,
    trialDaysRemaining,
    paywalledReason,
    stripeSubscriptionId: row.stripe_subscription_id ?? null,
    bundle: row.bundle,
    canRead,
    canWrite,
  }
}

export async function getOrganizationBillingStatus(organizationId: string): Promise<BillingStatus> {
  const service = createServiceSupabase()

  const [{ data: rows }, { data: org }] = await Promise.all([
    service
      .from('entitlements')
      .select('persona, status, trial_ends_at, paywalled_reason, stripe_subscription_id, bundle')
      .eq('organization_id', organizationId),
    service
      .from('organizations')
      .select('billing_model, price_per_aircraft_cents, subscription_status, stripe_subscription_id')
      .eq('id', organizationId)
      .maybeSingle(),
  ])

  const ownerRow = (rows as EntitlementRow[] | null)?.find((r) => r.persona === 'owner') ?? null
  const mechanicRow = (rows as EntitlementRow[] | null)?.find((r) => r.persona === 'mechanic') ?? null

  const owner = deriveEntitlement('owner', ownerRow)
  const mechanic = deriveEntitlement('mechanic', mechanicRow)

  const hasAnyAccess = owner.canWrite || mechanic.canWrite
  const hasBundleEquivalent = owner.canWrite && mechanic.canWrite

  // Legacy view (single state for old callers). Reports the most permissive
  // state across personas so older code keeps working until migrated.
  const legacyState: BillingState = hasBundleEquivalent
    ? 'active'
    : hasAnyAccess
      ? owner.canWrite ? owner.state : mechanic.state
      : owner.state !== 'none' ? owner.state : mechanic.state !== 'none' ? mechanic.state : 'paywalled'

  const legacyTrialEnd =
    owner.state === 'trial' ? owner.trialEndsAt :
    mechanic.state === 'trial' ? mechanic.trialEndsAt : null

  const legacyTrialDays =
    owner.state === 'trial' ? owner.trialDaysRemaining :
    mechanic.state === 'trial' ? mechanic.trialDaysRemaining : null

  return {
    organizationId,
    owner,
    mechanic,
    hasAnyAccess,
    hasBundleEquivalent,

    // legacy
    state: legacyState,
    trialEndsAt: legacyTrialEnd,
    trialDaysRemaining: legacyTrialDays,
    paywalledReason: owner.paywalledReason ?? mechanic.paywalledReason,
    subscriptionStatus: org?.subscription_status ?? null,
    stripeSubscriptionId: org?.stripe_subscription_id ?? null,
    pricePerAircraftCents: org?.price_per_aircraft_cents ?? 10000,
    billingModel: org?.billing_model ?? 'per_aircraft',
    canWrite: hasAnyAccess,
    canUseMessaging: true,
  }
}

export class BillingBlockedError extends Error {
  constructor(public readonly status: BillingStatus, public readonly persona: Persona | null = null) {
    const reason = persona
      ? status[persona].paywalledReason
      : status.paywalledReason
    super(reason || `Billing subscription required to perform this action`)
  }
}

/**
 * Require an active entitlement for a specific persona. Throws BillingBlockedError
 * if the persona's entitlement is missing, expired, or paywalled.
 *
 * @param organizationId - The organization the action is being performed on
 * @param persona - Which persona's entitlement to check ('owner' for fleet/aircraft
 *                  features, 'mechanic' for shop/work-order features)
 */
export async function requireActiveBilling(
  organizationId: string,
  persona: Persona,
): Promise<BillingStatus> {
  const status = await getOrganizationBillingStatus(organizationId)
  const entitlement = status[persona]
  if (!entitlement.canWrite) {
    throw new BillingBlockedError(status, persona)
  }
  return status
}

/**
 * Read-side guard. Throws if the persona has been fully cancelled.
 * Trial-expired ("paywalled") entitlements still pass — they get read-only UI
 * with an upgrade prompt rather than a hard 402.
 */
export async function requireReadAccess(
  organizationId: string,
  persona: Persona,
): Promise<BillingStatus> {
  const status = await getOrganizationBillingStatus(organizationId)
  const entitlement = status[persona]
  if (!entitlement.canRead) {
    throw new BillingBlockedError(status, persona)
  }
  return status
}
