'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { unreadRollupUrl } from './api-paths'

type ChatPersona = 'owner' | 'shop'

export interface LatestUnreadMessage {
  created_at: string
  work_order_id: string | null
  aircraft_id: string | null
  preview: string
}

interface UnreadRollupContextValue {
  latest: LatestUnreadMessage | null
}

const UnreadRollupContext = createContext<UnreadRollupContextValue>({ latest: null })

interface ProviderProps {
  persona: ChatPersona
  children: ReactNode
  intervalMs?: number
}

// Single shared poller for the WO unread-message roll-up. Both UnifiedLauncher
// and WorkOrderChatBubble used to poll this endpoint independently every 12s,
// producing ~10 requests/min on /ask alone. This provider polls once for the
// whole tree and broadcasts the latest message via context. It also skips the
// fetch when the tab is hidden — and fires immediately when the tab becomes
// visible again so the badge updates without waiting for the next tick.
export function UnreadRollupProvider({ persona, children, intervalMs = 12000 }: ProviderProps) {
  const [latest, setLatest] = useState<LatestUnreadMessage | null>(null)

  useEffect(() => {
    let cancelled = false

    async function check() {
      if (cancelled) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      try {
        const res = await fetch(unreadRollupUrl(persona))
        if (!res.ok || cancelled) return
        const json = await res.json()
        if (cancelled) return
        const raw = json?.latest
        if (!raw?.created_at) {
          setLatest(null)
          return
        }
        setLatest({
          created_at: String(raw.created_at),
          work_order_id: raw.work_order_id ?? null,
          aircraft_id: raw.aircraft_id ?? null,
          preview: raw.preview ?? '',
        })
      } catch {
        /* swallow — next tick retries */
      }
    }

    function onVisibility() {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void check()
      }
    }

    void check()
    const timer = setInterval(check, intervalMs)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility)
    }

    return () => {
      cancelled = true
      clearInterval(timer)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility)
      }
    }
  }, [persona, intervalMs])

  return <UnreadRollupContext.Provider value={{ latest }}>{children}</UnreadRollupContext.Provider>
}

export function useUnreadRollup(): UnreadRollupContextValue {
  return useContext(UnreadRollupContext)
}
