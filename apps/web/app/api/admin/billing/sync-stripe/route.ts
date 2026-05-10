/**
 * /api/admin/billing/sync-stripe — Phase 17 Sprint 17.3
 *
 * Admin-only endpoint that runs the pricing-config → Stripe sync.
 * POST → execute the sync; returns the SyncResult JSON.
 * GET  → dry-run preview (no Stripe write calls).
 *
 * Auth: platform admin only. The route is a no-op (HTTP 503) when
 * STRIPE_SECRET_KEY is missing or set to the Phase 14 sk_placeholder.
 * Real test keys land in Phase 17 follow-up; running this endpoint
 * before then is harmless.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { syncPricingToStripe } from '@/lib/billing/stripe-sync'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, is_platform_admin')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || !(profile as { is_platform_admin?: boolean }).is_platform_admin) return null
  return user
}

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const service = createServiceSupabase()
  try {
    const result = await syncPricingToStripe(service, { force_dry_run: true })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'sync failed' },
      { status: 500 },
    )
  }
}

export async function POST() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const service = createServiceSupabase()
  try {
    const result = await syncPricingToStripe(service)
    if (result.dry_run) {
      // Implies STRIPE_SECRET_KEY missing/placeholder. Surface a 503 so
      // the admin UI can render a "needs config" state.
      return NextResponse.json(result, { status: 503 })
    }
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'sync failed' },
      { status: 500 },
    )
  }
}
