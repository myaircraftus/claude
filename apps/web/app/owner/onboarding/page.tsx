'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PersonaOnboardingFlow } from '@/components/onboarding/persona-onboarding-flow'

type InviteState = 'idle' | 'accepting' | 'accepted' | 'failed'

function InviteAutoAccept({ onStateChange }: { onStateChange: (state: InviteState) => void }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteToken = searchParams?.get('invite') ?? null

  useEffect(() => {
    if (!inviteToken) {
      onStateChange('idle')
      return
    }
    onStateChange('accepting')
    fetch(`/api/customer-invitations/${encodeURIComponent(inviteToken)}/accept`, {
      method: 'POST',
    })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status))
        onStateChange('accepted')
        router.replace('/owner/dashboard')
      })
      .catch(() => {
        onStateChange('failed')
      })
  }, [inviteToken, onStateChange, router])

  return null
}

export default function OwnerOnboardingPage() {
  const [inviteState, setInviteState] = useState<InviteState>('idle')

  return (
    <>
      <Suspense fallback={null}>
        <InviteAutoAccept onStateChange={setInviteState} />
      </Suspense>
      {inviteState === 'accepting' || inviteState === 'accepted' ? (
        <main className="min-h-screen flex items-center justify-center px-6 py-16 text-sm text-muted-foreground">
          Accepting your invite…
        </main>
      ) : (
        <PersonaOnboardingFlow persona="owner" />
      )}
    </>
  )
}
