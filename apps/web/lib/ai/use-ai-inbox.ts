'use client'

/**
 * useAIInbox() — client hook for the AI Inbox UI (Spec 0.3).
 *
 * Fetches /api/ai/inbox, exposes the resolved cards plus dismiss / resolve
 * mutations. Lightweight polling (60s) keeps the badge fresh; a future
 * sprint can swap this for a Supabase realtime subscription on
 * ai_action_cards.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { ActionCard } from './types'
import type { Persona } from '@/types'

const POLL_INTERVAL_MS = 60_000

export interface UseAIInboxResult {
  cards: ActionCard[]
  loading: boolean
  persona: Persona | null
  dismiss: (id: string) => Promise<void>
  resolve: (id: string) => Promise<void>
  refresh: () => Promise<void>
}

export function useAIInbox(): UseAIInboxResult {
  const [cards, setCards] = useState<ActionCard[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [persona, setPersona] = useState<Persona | null>(null)
  const cancelledRef = useRef(false)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/inbox', { cache: 'no-store' })
      if (!res.ok) return
      const payload = await res.json()
      if (cancelledRef.current) return
      setCards(Array.isArray(payload?.cards) ? payload.cards : [])
      if (payload?.persona) setPersona(payload.persona)
    } catch {
      // noop — keep previous state on transient errors
    } finally {
      if (!cancelledRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    cancelledRef.current = false
    refresh()
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    return () => {
      cancelledRef.current = true
      clearInterval(interval)
    }
  }, [refresh])

  const dismiss = useCallback(async (id: string) => {
    // Optimistic update
    const prev = cards
    setCards((c) => c.filter((x) => x.id !== id))
    try {
      const res = await fetch(`/api/ai/inbox/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
    } catch {
      setCards(prev)
      toast.error('Could not dismiss card')
    }
  }, [cards])

  const resolve = useCallback(async (id: string) => {
    const prev = cards
    setCards((c) => c.filter((x) => x.id !== id))
    try {
      const res = await fetch(`/api/ai/inbox/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve' }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setCards(prev)
      toast.error('Could not mark resolved')
    }
  }, [cards])

  return { cards, loading, persona, dismiss, resolve, refresh }
}
