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

interface FaraimButtonProps {
  variant?: 'topbar' | 'sidebar'
  collapsed?: boolean
}

export function FaraimButton({ variant = 'topbar', collapsed = false }: FaraimButtonProps) {
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

  if (variant === 'sidebar') {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open FAR/AIM AI search"
          title={collapsed ? 'FAR/AIM AI search' : undefined}
          className={`w-full flex items-center ${collapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-3 py-2'} rounded-lg text-[12px] transition-all group`}
          style={{ color: 'rgba(255,255,255,0.55)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.9)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'rgba(255,255,255,0.55)'
          }}
        >
          <ScrollText className="w-4 h-4 shrink-0 text-blue-300/70" />
          {!collapsed && (
            <>
              <span style={{ fontWeight: 500 }}>FAR/AIM</span>
              {showRemaining ? (
                <span
                  className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full"
                  style={{ background: 'rgba(245,158,11,0.18)', color: '#fcd34d', fontWeight: 700 }}
                >
                  {entitlement.remaining} left
                </span>
              ) : (
                <span
                  className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full"
                  style={{ background: 'rgba(37,99,235,0.25)', color: '#93c5fd', fontWeight: 700 }}
                >
                  AI
                </span>
              )}
            </>
          )}
        </button>
        <FaraimModal open={open} onClose={() => setOpen(false)} />
      </>
    )
  }

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
