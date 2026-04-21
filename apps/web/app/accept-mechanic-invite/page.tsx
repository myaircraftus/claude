import { Suspense } from 'react'
import { AcceptMechanicInviteClient } from './accept-mechanic-invite-client'

export default function AcceptMechanicInvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-sm text-gray-500">Loading invite...</p>
        </div>
      </div>
    }>
      <AcceptMechanicInviteClient />
    </Suspense>
  )
}
