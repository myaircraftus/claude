'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface BillingStatusPayload {
  state: 'trial' | 'active' | 'paywalled' | 'cancelled' | 'past_due'
  trialEndsAt: string | null
  trialDaysRemaining: number | null
  paywalledReason: string | null
  canWrite: boolean
}

export function BillingBanner() {
  const [status, setStatus] = useState<BillingStatusPayload | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/billing/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && json) setStatus(json as BillingStatusPayload)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (!status || dismissed) return null

  if (status.state === 'active') return null

  const isTrial = status.state === 'trial'
  const isPaywalled = !isTrial

  const bg = isPaywalled
    ? 'bg-gradient-to-r from-red-50 to-orange-50 border-red-200 text-red-900'
    : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 text-blue-900'

  return (
    <div className={`border-b ${bg} px-4 py-2.5`}>
      <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-3 text-[13px]">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isPaywalled ? (
            <>
              <span className="font-semibold">Subscription required.</span>
              <span className="truncate">
                Upgrade now or contact{' '}
                <a href="mailto:info@myaircraft.us" className="underline">info@myaircraft.us</a>
                {' '}to unlock your aircraft coordination tools.
              </span>
            </>
          ) : (
            <>
              <span className="font-semibold">
                {status.trialDaysRemaining !== null && status.trialDaysRemaining > 0
                  ? `${status.trialDaysRemaining} day${status.trialDaysRemaining === 1 ? '' : 's'} left in your free trial.`
                  : 'Your free trial is ending soon.'}
              </span>
              <span className="truncate">Add a payment method to keep full access after the trial ends.</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/settings?tab=billing"
            className={`px-3 py-1.5 rounded-md text-[12px] font-semibold ${isPaywalled ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
          >
            {isPaywalled ? 'Upgrade now' : 'Manage billing'}
          </Link>
          {isTrial ? (
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="text-[12px] text-muted-foreground hover:text-foreground px-1"
              aria-label="Dismiss trial banner"
            >
              ✕
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
