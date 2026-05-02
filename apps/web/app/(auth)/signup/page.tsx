'use client'

import { Suspense } from 'react'
import { SignupPage } from '@/components/redesign/SignupPage'

export default function SignupRoute() {
  return (
    <Suspense fallback={null}>
      <SignupPage />
    </Suspense>
  )
}
