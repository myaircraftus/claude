'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { PersonaOnboardingFlow } from '@/components/onboarding/persona-onboarding-flow'

export default function OwnerOnboardingPage() {
  const searchParams = useSearchParams()
  const inviteToken = searchParams?.get('invite') ?? null

  useEffect(() => {
    if (!inviteToken) return
    fetch(`/api/customer-invitations/${encodeURIComponent(inviteToken)}/accept`, {
      method: 'POST',
    }).catch(() => {})
  }, [inviteToken])

  return <PersonaOnboardingFlow persona="owner" />
}
