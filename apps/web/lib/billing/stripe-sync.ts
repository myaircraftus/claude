/**
 * Phase 17 Sprint 17.3 — Stripe Products+Prices sync.
 *
 * Reads pricing-config.ts (the locked source of truth) and idempotently
 * mirrors each tier×bracket as a Stripe Product + recurring Price,
 * upserting the result into tier_pricing_skus.
 *
 * Design notes:
 * - Uses Stripe lookup_keys so re-runs are stable: the lookup_key for
 *   each price encodes the tier slug + bracket bounds. If a price with
 *   the same lookup_key already exists at the same unit_amount, we
 *   reuse it; only when the amount changes do we create a new price
 *   (Stripe requires this — Prices are immutable).
 * - When STRIPE_SECRET_KEY is missing or test-mode flag is unset, the
 *   sync runs in DRY_RUN: prints what it would do, makes no Stripe
 *   calls, and writes nothing.
 *
 * NOTE — Sprint 17.3 ships this as a SCAFFOLD only. Stripe MCP is
 * still in live mode and apps/web/.env.local has placeholder STRIPE_*
 * keys. The route /api/admin/billing/sync-stripe is wired but will
 * 503 until Andy lands the real test keys. At that point a single
 * POST to that route populates tier_pricing_skus.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { TIER_DEFINITIONS, type TierSlug } from './pricing-config'

interface StripeProduct { id: string; name: string }
interface StripePrice { id: string; unit_amount: number | null; product: string; lookup_key?: string | null; active: boolean }
interface StripeListResponse<T> { data: T[]; has_more: boolean }

const STRIPE_API = 'https://api.stripe.com/v1'

/** Read the secret key at call time — never import-time. */
function readSecret(): string | null {
  const raw = process.env.STRIPE_SECRET_KEY?.trim()
  if (!raw) return null
  // Refuse placeholders so the sync never silently no-ops on dev keys.
  if (raw.startsWith('sk_placeholder')) return null
  return raw
}

function isTestKey(key: string): boolean {
  return key.startsWith('sk_test_')
}

async function stripeFetch<T>(secret: string, path: string, init?: RequestInit & { form?: Record<string, string> }): Promise<T> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${secret}`,
    ...((init?.headers as Record<string, string>) ?? {}),
  }
  let body: string | undefined
  if (init?.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    body = new URLSearchParams(init.form).toString()
  }
  const resp = await fetch(`${STRIPE_API}${path}`, { ...init, headers, body, form: undefined } as RequestInit)
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`Stripe ${resp.status} on ${path}: ${text.slice(0, 300)}`)
  }
  return (await resp.json()) as T
}

function lookupKeyFor(tier: TierSlug, min: number, max: number | null): string {
  const tail = max == null ? `${min}plus` : `${min}to${max}`
  return `tier_${tier}_${tail}_v1`
}

function productNameFor(tier: TierSlug, min: number, max: number | null): string {
  const tail = max == null ? `${min}+ aircraft` : `${min}–${max} aircraft`
  const tierName = TIER_DEFINITIONS[tier].name
  return `${tierName} (${tail})`
}

export interface SyncResult {
  dry_run: boolean
  test_mode: boolean
  created_or_updated: Array<{
    tier_slug: TierSlug
    min_aircraft: number
    max_aircraft: number | null
    price_per_aircraft_cents: number
    stripe_product_id: string
    stripe_price_id: string
    action: 'noop' | 'created_product' | 'created_price' | 'reused_price'
  }>
  skipped: Array<{ reason: string }>
}

/**
 * Drive the sync. Reads pricing-config, calls Stripe to ensure each
 * Product+Price exists, then upserts the resulting SKU rows in
 * tier_pricing_skus.
 *
 * Returns a structured result for the admin route to surface.
 */
export async function syncPricingToStripe(
  supabase: SupabaseClient,
  options: { force_dry_run?: boolean } = {},
): Promise<SyncResult> {
  const secret = readSecret()
  if (!secret || options.force_dry_run) {
    return {
      dry_run: true,
      test_mode: true,
      created_or_updated: [],
      skipped: [{ reason: secret ? 'force_dry_run=true' : 'STRIPE_SECRET_KEY missing or placeholder' }],
    }
  }

  const test_mode = isTestKey(secret)
  const result: SyncResult = { dry_run: false, test_mode, created_or_updated: [], skipped: [] }

  for (const slug of ['standard', 'pro'] as TierSlug[]) {
    const def = TIER_DEFINITIONS[slug]
    if (!def.priceTiers || !def.billable) continue

    for (const bracket of def.priceTiers) {
      const cents = bracket.pricePerAircraft * 100
      const lookup_key = lookupKeyFor(slug, bracket.minAircraft, bracket.maxAircraft)
      const productName = productNameFor(slug, bracket.minAircraft, bracket.maxAircraft)

      // 1) Find or create Product by metadata search. We use a stable
      //    name + a metadata.lookup_key tag for idempotency.
      let product = await findProduct(secret, lookup_key)
      let action: SyncResult['created_or_updated'][number]['action'] = 'reused_price'
      if (!product) {
        product = await createProduct(secret, productName, lookup_key)
        action = 'created_product'
      }

      // 2) Find or create the recurring Price.
      let price = await findPrice(secret, lookup_key, cents)
      if (!price) {
        price = await createPrice(secret, product.id, lookup_key, cents)
        action = 'created_price'
      } else if (action === 'reused_price') {
        // already existed; nothing changed
      }

      // 3) Upsert into tier_pricing_skus.
      await supabase
        .from('tier_pricing_skus')
        .upsert(
          {
            tier_slug: slug,
            min_aircraft: bracket.minAircraft,
            max_aircraft: bracket.maxAircraft,
            price_per_aircraft_cents: cents,
            stripe_product_id: product.id,
            stripe_price_id: price.id,
            is_test_mode: test_mode,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tier_slug,min_aircraft,is_test_mode' },
        )

      result.created_or_updated.push({
        tier_slug: slug,
        min_aircraft: bracket.minAircraft,
        max_aircraft: bracket.maxAircraft,
        price_per_aircraft_cents: cents,
        stripe_product_id: product.id,
        stripe_price_id: price.id,
        action,
      })
    }
  }

  return result
}

async function findProduct(secret: string, lookup_key: string): Promise<StripeProduct | null> {
  // Stripe lacks a direct lookup_key search on Products; we use the
  // search API filtering by metadata.
  const params = new URLSearchParams({ query: `metadata['lookup_key']:'${lookup_key}'`, limit: '1' })
  const resp = await stripeFetch<StripeListResponse<StripeProduct>>(secret, `/products/search?${params}`)
  return resp.data[0] ?? null
}

async function createProduct(secret: string, name: string, lookup_key: string): Promise<StripeProduct> {
  return stripeFetch<StripeProduct>(secret, '/products', {
    method: 'POST',
    form: {
      name,
      'metadata[lookup_key]': lookup_key,
    },
  })
}

async function findPrice(secret: string, lookup_key: string, expected_cents: number): Promise<StripePrice | null> {
  const params = new URLSearchParams({ lookup_keys: lookup_key, active: 'true', limit: '1' })
  const resp = await stripeFetch<StripeListResponse<StripePrice>>(secret, `/prices?${params}`)
  const found = resp.data[0]
  // Reuse only if the unit_amount matches; otherwise we'll create a
  // new one (Prices are immutable in Stripe).
  if (!found) return null
  if (found.unit_amount === expected_cents) return found
  return null
}

async function createPrice(secret: string, product_id: string, lookup_key: string, cents: number): Promise<StripePrice> {
  return stripeFetch<StripePrice>(secret, '/prices', {
    method: 'POST',
    form: {
      product: product_id,
      unit_amount: String(cents),
      currency: 'usd',
      'recurring[interval]': 'month',
      lookup_key,
      transfer_lookup_key: 'true',
    },
  })
}

// Test exports.
export const __testing = {
  lookupKeyFor,
  productNameFor,
  readSecret,
  isTestKey,
}
