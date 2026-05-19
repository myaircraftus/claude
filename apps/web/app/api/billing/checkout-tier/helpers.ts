/**
 * Pure helpers for /api/billing/checkout-tier.
 *
 * Kept out of route.ts so the route file exports only Next.js route
 * handlers + segment config — the App Router's route-type validation
 * rejects any other export.
 */

/** The min-aircraft pricing bracket a count falls into (1 / 6 / 16). */
export function bracketMinFor(count: number): number {
  if (count >= 16) return 16
  if (count >= 6) return 6
  return 1
}

/** The configured Stripe secret, or null when only a placeholder is set. */
export function readSecret(): string | null {
  const raw = process.env.STRIPE_SECRET_KEY?.trim()
  if (!raw || raw.startsWith('sk_placeholder')) return null
  return raw
}
