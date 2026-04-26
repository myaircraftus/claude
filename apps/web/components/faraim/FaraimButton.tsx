'use client'

import { useEffect, useState } from 'react'
import { ScrollText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FaraimModal } from './FaraimModal'

interface EntitlementResponse {
  allowed: boolean
  reason: string
  remaining: number | null
  upgradeRequired: boolean
}

export function FaraimButton() {
  const [open, setOpen] = useState(false)
  const [entitlement, setEntitlement] = useState<EntitlementResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const r = await fetch('/api/faraim/entitlement', { credentials: 'include' })
        if (!r.ok) return
        const json = (await r.json()) as EntitlementResponse
        if (!cancelled) setEntitlement(json)
      } catch {
        // Stay hidden on error rather than rendering a broken-looking button.
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  // Hide entirely when the user is not entitled (e.g. trial expired + no aircraft + quota used).
  if (!entitlement) return null
  if (!entitlement.allowed) return null

  const showRemaining =
    entitlement.reason === 'free_quota' && typeof entitlement.remaining === 'number'

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="hidden md:inline-flex items-center gap-1.5 h-8 text-[12px]"
        aria-label="Open FAR/AIM AI search"
      >
        <ScrollText className="h-3.5 w-3.5" />
        FAR/AIM
        {showRemaining && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-medium">
            {entitlement.remaining} left
          </span>
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="md:hidden"
        aria-label="Open FAR/AIM AI search"
      >
        <ScrollText className="h-4 w-4" />
      </Button>
      <FaraimModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
