/**
 * POST /api/admin/billing/orgs/change-tier — Phase 14 Sprint 14.5
 *
 * Body: { orgId, newTier, reason?, setBillingDisabled? }
 * Calls changeOrgTier from tier-service which:
 *   1. UPDATEs organizations.tier (+ optionally tier_billing_disabled)
 *   2. INSERTs a tier_history row with from_tier captured
 *
 * Auth: is_platform_admin only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { parseJsonBody, safeUuid } from '@/lib/validation/common'
import { changeOrgTier } from '@/lib/billing/tier-service'

const Body = z.object({
  orgId: safeUuid,
  newTier: z.enum(['beta', 'standard', 'pro']),
  reason: z.string().max(500).optional(),
  setBillingDisabled: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_platform_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = await parseJsonBody(req, Body)
  if (!parsed.ok) return parsed.response

  const service = createServiceSupabase()
  try {
    const result = await changeOrgTier(service as any, {
      orgId: parsed.data.orgId,
      newTier: parsed.data.newTier,
      changedByUserId: user.id,
      reason: parsed.data.reason,
      setBillingDisabled: parsed.data.setBillingDisabled,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
