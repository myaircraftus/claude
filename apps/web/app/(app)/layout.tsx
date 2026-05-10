import { AppLayout } from '@/components/redesign/AppLayout'
import { requireAppServerSession } from '@/lib/auth/server-app'
import type { ReactNode } from 'react'

// Note: BillingBanner is rendered inside AppLayout (persona-aware) — do not
// duplicate it here. Phase 15.7 fix: previously this layout also rendered
// a no-prop <BillingBanner/> that fell through to pickMostUrgent and surfaced
// a "30-day Mechanic trial" CTA on top of the persona-correct banner from
// AppLayout, so users saw two banners stacked. AppLayout's banner already
// handles the active persona's trial / paywall state.
export default async function AppShellLayout({ children }: { children: ReactNode }) {
  const { profile } = await requireAppServerSession()

  return (
    <AppLayout userName={profile.full_name ?? profile.email ?? 'Owner'}>
      {children}
    </AppLayout>
  )
}
