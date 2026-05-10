/**
 * GET /api/admin/billing/orgs — Phase 14 Sprint 14.5
 *
 * Lists all orgs with tier + billing-disabled flag + aircraft count.
 * Backs the /admin/billing/orgs table.
 *
 * Auth: is_platform_admin only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { listOrgsByTier } from '@/lib/billing/tier-service'
import { calculateMonthlyPrice, isTierSlug } from '@/lib/billing/pricing-config'

export async function GET(req: NextRequest) {
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

  const url = new URL(req.url)
  const tierParam = url.searchParams.get('tier')
  const filter = tierParam && isTierSlug(tierParam) ? { tier: tierParam } : {}

  const service = createServiceSupabase()
  const rows = await listOrgsByTier(service as any, filter)

  // Attach the calculated monthly price so the table can show the bill.
  const enriched = rows.map((r) => ({
    ...r,
    monthly_price_usd: r.tier_billing_disabled
      ? 0
      : calculateMonthlyPrice(r.tier, r.aircraft_count),
  }))

  return NextResponse.json({ rows: enriched })
}
