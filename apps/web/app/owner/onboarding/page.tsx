'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { PersonaOnboardingFlow } from '@/components/onboarding/persona-onboarding-flow'

function InviteAutoAccept() {
  const searchParams = useSearchParams()
  const inviteToken = searchParams?.get('invite') ?? null

  useEffect(() => {
    if (!inviteToken) return
    fetch(`/api/customer-invitations/${encodeURIComponent(inviteToken)}/accept`, {
      method: 'POST',
    }).catch(() => {})
  }, [inviteToken])

  return null
}

export default function OwnerOnboardingPage() {
  return (
    <>
      <Suspense fallback={null}>
        <InviteAutoAccept />
      </Suspense>
      <PersonaOnboardingFlow persona="owner" />
    </>
  )
}
