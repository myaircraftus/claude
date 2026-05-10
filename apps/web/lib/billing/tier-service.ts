/**
 * Phase 14 Sprint 14.2 — billing-tier service.
 *
 * Read + write helpers around `organizations.tier` and `aircraft.tier_override`.
 * Pure DB layer; pricing math + helper logic lives in pricing-config.ts.
 *
 * Authoritative reads use the service-role client (bypasses RLS) since the
 * caller has already done their auth check by the time they reach this
 * service. RLS is the safety net, not the gate.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  TIER_DEFINITIONS,
  getEffectiveTier,
  isTierSlug,
  type TierSlug,
} from './pricing-config'

export interface OrgTierState {
  tier: TierSlug
  tier_billing_disabled: boolean
  tier_effective_from: string | null
}

export interface TierHistoryRow {
  id: string
  organization_id: string
  from_tier: TierSlug | null
  to_tier: TierSlug
  changed_by_user_id: string | null
  changed_at: string
  reason: string | null
}

// ─── Read helpers ──────────────────────────────────────────────────────

/**
 * Load the org's nominal tier + billing-disabled flag. Beta is the
 * fallback if the row is missing or the tier value is unknown — same
 * shape as a freshly-created org.
 */
export async function getOrgTierState(
  supabase: SupabaseClient,
  orgId: string,
): Promise<OrgTierState> {
  const { data } = await supabase
    .from('organizations')
    .select('tier, tier_billing_disabled, tier_effective_from')
    .eq('id', orgId)
    .maybeSingle()
  if (!data) {
    return { tier: 'beta', tier_billing_disabled: true, tier_effective_from: null }
  }
  const raw = (data as any).tier
  const tier: TierSlug = isTierSlug(raw) ? raw : 'beta'
  return {
    tier,
    tier_billing_disabled: (data as any).tier_billing_disabled !== false,
    tier_effective_from: (data as any).tier_effective_from ?? null,
  }
}

/** Convenience wrapper: just the effective tier (post-killswitch). */
export async function getOrgTier(
  supabase: SupabaseClient,
  orgId: string,
): Promise<TierSlug> {
  const state = await getOrgTierState(supabase, orgId)
  return getEffectiveTier({
    orgTier: state.tier,
    tierBillingDisabled: state.tier_billing_disabled,
  })
}

/**
 * Resolve the effective tier for a single aircraft. Aircraft-level
 * override beats the org tier; null override defers to the org.
 *
 * Returns 'beta' if the aircraft can't be located (fail-safe).
 */
export async function getAircraftTier(
  supabase: SupabaseClient,
  aircraftId: string,
): Promise<TierSlug> {
  const { data } = await supabase
    .from('aircraft')
    .select('tier_override, organization_id')
    .eq('id', aircraftId)
    .maybeSingle()
  if (!data) return 'beta'
  const override = (data as any).tier_override
  if (isTierSlug(override)) {
    // Apply the kill-switch even on override: if the org has billing
    // disabled, the aircraft override still collapses to beta. This
    // keeps the master kill-switch authoritative.
    const orgState = await getOrgTierState(supabase, (data as any).organization_id)
    return getEffectiveTier({
      orgTier: override,
      tierBillingDisabled: orgState.tier_billing_disabled,
    })
  }
  return getOrgTier(supabase, (data as any).organization_id)
}

/** Count aircraft on this org — used by the pricing display. */
export async function countOrgAircraft(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number> {
  const { count } = await supabase
    .from('aircraft')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('is_archived', false)
  return count ?? 0
}

// ─── Write helpers ─────────────────────────────────────────────────────

export interface ChangeOrgTierInput {
  orgId: string
  newTier: TierSlug
  changedByUserId: string
  reason?: string
  /** Optional: also flip the billing-disabled kill-switch as part of the change. */
  setBillingDisabled?: boolean
}

/**
 * Change an org's tier + record a history row. Atomic: either both
 * the UPDATE and the INSERT succeed, or neither does. Throws on DB error.
 */
export async function changeOrgTier(
  supabase: SupabaseClient,
  input: ChangeOrgTierInput,
): Promise<{ from: TierSlug | null; to: TierSlug; historyId: string }> {
  // Read current state so we know what to record as `from_tier`.
  const before = await getOrgTierState(supabase, input.orgId)
  const fromTier: TierSlug = before.tier

  const update: Record<string, unknown> = {
    tier: input.newTier,
    tier_effective_from: new Date().toISOString(),
  }
  if (input.setBillingDisabled !== undefined) {
    update.tier_billing_disabled = input.setBillingDisabled
  }

  const { error: updErr } = await supabase
    .from('organizations')
    .update(update)
    .eq('id', input.orgId)
  if (updErr) throw new Error(`changeOrgTier: org update failed: ${updErr.message}`)

  const { data: history, error: histErr } = await supabase
    .from('tier_history')
    .insert({
      organization_id: input.orgId,
      from_tier: fromTier,
      to_tier: input.newTier,
      changed_by_user_id: input.changedByUserId,
      reason: input.reason ?? null,
    })
    .select('id')
    .single()
  if (histErr || !history) {
    throw new Error(
      `changeOrgTier: history insert failed: ${histErr?.message ?? 'no row returned'}`,
    )
  }

  return { from: fromTier, to: input.newTier, historyId: (history as any).id }
}

/** Set or clear the per-aircraft tier override. */
export async function setAircraftTierOverride(
  supabase: SupabaseClient,
  aircraftId: string,
  tier: TierSlug | null,
): Promise<void> {
  const { error } = await supabase
    .from('aircraft')
    .update({ tier_override: tier })
    .eq('id', aircraftId)
  if (error) throw new Error(`setAircraftTierOverride: ${error.message}`)
}

// ─── Admin queries ─────────────────────────────────────────────────────

export interface OrgListRow {
  id: string
  name: string
  tier: TierSlug
  tier_billing_disabled: boolean
  tier_effective_from: string | null
  aircraft_count: number
}

/**
 * List orgs filtered by tier. Returns the row with aircraft count
 * pre-joined so the admin page doesn't need a second pass per row.
 *
 * Caller MUST be platform admin — RLS is not enforced for this call;
 * the API route gates is_platform_admin first.
 */
export async function listOrgsByTier(
  supabase: SupabaseClient,
  filter: { tier?: TierSlug } = {},
): Promise<OrgListRow[]> {
  let query = supabase
    .from('organizations')
    .select('id, name, tier, tier_billing_disabled, tier_effective_from')
    .order('name', { ascending: true })
  if (filter.tier) query = query.eq('tier', filter.tier)
  const { data: orgs } = await query
  if (!orgs || orgs.length === 0) return []

  // Get aircraft counts per org in one batch query.
  const orgIds = orgs.map((o: any) => o.id)
  const { data: aircraftRows } = await supabase
    .from('aircraft')
    .select('organization_id')
    .in('organization_id', orgIds)
    .eq('is_archived', false)
  const counts = new Map<string, number>()
  for (const r of (aircraftRows as any[]) ?? []) {
    counts.set(r.organization_id, (counts.get(r.organization_id) ?? 0) + 1)
  }

  return orgs.map((o: any) => ({
    id: o.id,
    name: o.name,
    tier: isTierSlug(o.tier) ? (o.tier as TierSlug) : 'beta',
    tier_billing_disabled: o.tier_billing_disabled !== false,
    tier_effective_from: o.tier_effective_from ?? null,
    aircraft_count: counts.get(o.id) ?? 0,
  }))
}

/** Fetch tier history for an org, newest first. Used by admin detail page. */
export async function getTierHistory(
  supabase: SupabaseClient,
  orgId: string,
  limit = 50,
): Promise<TierHistoryRow[]> {
  const { data } = await supabase
    .from('tier_history')
    .select('id, organization_id, from_tier, to_tier, changed_by_user_id, changed_at, reason')
    .eq('organization_id', orgId)
    .order('changed_at', { ascending: false })
    .limit(limit)
  return ((data as any[]) ?? []).map((r) => ({
    id: r.id,
    organization_id: r.organization_id,
    from_tier: isTierSlug(r.from_tier) ? r.from_tier : null,
    to_tier: isTierSlug(r.to_tier) ? r.to_tier : 'beta',
    changed_by_user_id: r.changed_by_user_id,
    changed_at: r.changed_at,
    reason: r.reason,
  }))
}

// ─── Compatibility re-export ───────────────────────────────────────────
// The dispatcher and admin pages tend to import this single name:
export { TIER_DEFINITIONS } from './pricing-config'
