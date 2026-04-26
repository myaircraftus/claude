/**
 * Single source of truth for the persona-aware Stripe product catalog.
 *
 * Three SKUs: Owner (per-persona), Mechanic (per-persona), Bundle (both).
 * Each carries a 30-day trial when started fresh. The bundle is a separate
 * subscription that grants both personas at a discount.
 *
 * Set the STRIPE_PRICE_* env vars in production (see STRIPE_SETUP.md).
 */

import type { Persona } from './gate'

export type Sku = 'owner' | 'mechanic' | 'bundle'

export interface ProductDefinition {
  sku: Sku
  priceId: string | undefined
  displayName: string
  tagline: string
  monthlyPriceCents: number
  // Which persona entitlements this SKU grants
  grants: Persona[]
}

const PRICE_OWNER = process.env.STRIPE_PRICE_OWNER_MONTHLY
const PRICE_MECHANIC = process.env.STRIPE_PRICE_MECHANIC_MONTHLY
const PRICE_BUNDLE = process.env.STRIPE_PRICE_BUNDLE_MONTHLY

export const PRODUCTS: Record<Sku, ProductDefinition> = {
  owner: {
    sku: 'owner',
    priceId: PRICE_OWNER,
    displayName: 'Aircraft Owner',
    tagline: 'Logbooks, AD tracking, fleet dashboard, AI search',
    monthlyPriceCents: 4900,
    grants: ['owner'],
  },
  mechanic: {
    sku: 'mechanic',
    priceId: PRICE_MECHANIC,
    displayName: 'A&P Mechanic',
    tagline: 'Work orders, invoicing, customer portal, parts catalog',
    monthlyPriceCents: 7900,
    grants: ['mechanic'],
  },
  bundle: {
    sku: 'bundle',
    priceId: PRICE_BUNDLE,
    displayName: 'Owner + Mechanic Bundle',
    tagline: 'Both surfaces, single subscription, 25% off',
    monthlyPriceCents: 9900,
    grants: ['owner', 'mechanic'],
  },
}

/**
 * Reverse lookup: given a Stripe price ID from a webhook event, return which
 * SKU it matches (or null for unknown). Used by the webhook handler to know
 * which persona entitlement(s) to update.
 */
export function skuForPriceId(priceId: string | null | undefined): Sku | null {
  if (!priceId) return null
  for (const product of Object.values(PRODUCTS)) {
    if (product.priceId && product.priceId === priceId) {
      return product.sku
    }
  }
  return null
}

export function getProduct(sku: Sku): ProductDefinition {
  return PRODUCTS[sku]
}

export function isProductConfigured(sku: Sku): boolean {
  return Boolean(PRODUCTS[sku].priceId)
}
