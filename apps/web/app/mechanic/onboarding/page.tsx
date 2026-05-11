import { PersonaOnboardingFlow } from '@/components/onboarding/persona-onboarding-flow'

// Phase 18 mig 119 — mechanic persona merged into shop. The /mechanic/onboarding
// route is kept for backward compatibility with email links + bookmarks but
// now drives the shop onboarding flow.
export default function MechanicOnboardingPage() {
  return <PersonaOnboardingFlow persona="shop" />
}
