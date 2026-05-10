/**
 * /admin/billing/orgs — Phase 14 Sprint 14.5 admin org-tier management.
 *
 * Lists all orgs with tier + monthly bill + actions.
 * Auth: /admin layout already gates is_platform_admin.
 */
import { createServiceSupabase } from '@/lib/supabase/server'
import { listOrgsByTier } from '@/lib/billing/tier-service'
import { calculateMonthlyPrice } from '@/lib/billing/pricing-config'
import { OrgsTable } from './orgs-table-client'

export const metadata = { title: 'Billing — Organizations · Admin' }
export const dynamic = 'force-dynamic'

export default async function OrgsAdminPage() {
  const service = createServiceSupabase()
  const rows = await listOrgsByTier(service as any, {})
  const enriched = rows.map((r) => ({
    ...r,
    monthly_price_usd: r.tier_billing_disabled
      ? 0
      : calculateMonthlyPrice(r.tier, r.aircraft_count),
  }))

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-bold">Organizations</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Tier overview + per-org change controls. Tier-billing kill-switch
        defaults to ON for every org until v1 launches per-org.
      </p>
      <OrgsTable initialRows={enriched} />
    </div>
  )
}
