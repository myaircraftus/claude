// Phase 18 mig 119 — the mechanic persona was merged into shop. Onboarding
// now offers Owner vs Shop. We keep this module's exported helper names
// (e.g. `getOnboardingPathForPersona`) and the literal incoming values
// the legacy onboarding form posted ('mechanic') get folded into 'shop'
// so a stale browser tab on /signup still works.

export type OnboardingPersona = 'owner' | 'shop'

export function normalizeOnboardingPersona(value: unknown): OnboardingPersona {
  // Legacy callers may still POST 'mechanic' — fold to 'shop'.
  if (value === 'shop' || value === 'mechanic') return 'shop'
  return 'owner'
}

export function getOnboardingPathForPersona(value: unknown): string {
  // The historical /mechanic/onboarding route still resolves to the shop flow
  // until we deprecate the route entirely. Use that path for both 'shop' and
  // legacy 'mechanic' inputs so existing email links keep working.
  return normalizeOnboardingPersona(value) === 'shop'
    ? '/mechanic/onboarding'
    : '/owner/onboarding'
}
