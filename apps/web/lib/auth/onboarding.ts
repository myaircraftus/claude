export type OnboardingPersona = 'owner' | 'mechanic'

export function normalizeOnboardingPersona(value: unknown): OnboardingPersona {
  return value === 'mechanic' ? 'mechanic' : 'owner'
}

export function getOnboardingPathForPersona(value: unknown): string {
  return normalizeOnboardingPersona(value) === 'mechanic'
    ? '/mechanic/onboarding'
    : '/owner/onboarding'
}
