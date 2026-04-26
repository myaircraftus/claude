import type { SupabaseClient } from '@supabase/supabase-js'

const FREE_QUOTA = 10
const TRIAL_DAYS = 14

export type FaraimAccessReason =
  | 'paid'
  | 'trial'
  | 'has_aircraft'
  | 'free_quota'
  | 'trial_expired_no_aircraft'
  | 'free_quota_exhausted'

export interface FaraimAccess {
  allowed: boolean
  reason: FaraimAccessReason
  remaining?: number
  upgradeRequired?: boolean
  message?: string
}

interface OrgRow {
  id: string
  plan: string | null
  stripe_subscription_id: string | null
  created_at: string | null
}

interface ProfileUsage {
  faraim_session_count: number | null
}

function isPaidPlan(org: OrgRow | null): boolean {
  if (!org) return false
  if (org.stripe_subscription_id && org.stripe_subscription_id.length > 0) return true
  // Treat non-starter plans as paid (defensive — a real subscription should
  // also have stripe_subscription_id, but this covers manually-upgraded orgs).
  return org.plan === 'pro' || org.plan === 'fleet' || org.plan === 'enterprise'
}

function isTrialActive(org: OrgRow | null): boolean {
  if (!org?.created_at) return false
  if (isPaidPlan(org)) return false
  const createdMs = new Date(org.created_at).getTime()
  if (!Number.isFinite(createdMs)) return false
  const trialEnds = createdMs + TRIAL_DAYS * 24 * 60 * 60 * 1000
  return Date.now() < trialEnds
}

export async function evaluateFaraimAccess(
  supabase: SupabaseClient,
  params: { userId: string; organizationId: string }
): Promise<FaraimAccess> {
  const [orgRes, aircraftRes, profileRes] = await Promise.all([
    supabase
      .from('organizations')
      .select('id, plan, stripe_subscription_id, created_at')
      .eq('id', params.organizationId)
      .single(),
    supabase
      .from('aircraft')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', params.organizationId)
      .eq('is_archived', false),
    supabase
      .from('user_profiles')
      .select('faraim_session_count')
      .eq('id', params.userId)
      .single(),
  ])

  const org = (orgRes.data ?? null) as OrgRow | null
  const aircraftCount = aircraftRes.count ?? 0
  const usage = (profileRes.data ?? { faraim_session_count: 0 }) as ProfileUsage
  const used = usage.faraim_session_count ?? 0

  if (isPaidPlan(org)) {
    return { allowed: true, reason: 'paid' }
  }

  if (isTrialActive(org)) {
    return { allowed: true, reason: 'trial' }
  }

  if (aircraftCount > 0) {
    return { allowed: true, reason: 'has_aircraft' }
  }

  // Free messaging-only tier (e.g. owner invited by a mechanic, no aircraft, no paid plan).
  if (used < FREE_QUOTA) {
    return {
      allowed: true,
      reason: 'free_quota',
      remaining: FREE_QUOTA - used,
    }
  }

  return {
    allowed: false,
    reason: 'free_quota_exhausted',
    upgradeRequired: true,
    message:
      'You have used your free FAR/AIM sessions. Add an aircraft or upgrade your plan to keep asking questions.',
  }
}

export const FARAIM_FREE_QUOTA = FREE_QUOTA
export const FARAIM_TRIAL_DAYS = TRIAL_DAYS
