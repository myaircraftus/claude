'use client'

/**
 * `usePersona()` — client-side accessor for the active persona + its config.
 *
 * Spec 0.2 hard rule: every UI surface that branches on persona MUST read it
 * through this hook. The hook reads from AppContext (already in the tree at
 * the app shell), so no extra fetch is needed; AppContext hydrates persona
 * from /api/me/orgs on mount and writes back to /api/me/persona when the
 * user toggles.
 *
 * Returned `setPersona` does both:
 *   1. updates the in-memory persona for instant UI feedback
 *   2. POSTs to /api/me/persona to persist on the membership row
 * Failures are surfaced as a sonner toast — UI does not roll back since the
 * preview is also useful.
 */

import { useCallback } from 'react'
import { toast } from 'sonner'
import { useAppContext } from '@/components/redesign/AppContext'
import { PERSONA_CONFIG, isPersona, type PersonaConfig } from './config'
import type { Persona } from '@/types'

export interface UsePersonaResult {
  /** The active persona for this user × active org. */
  persona: Persona
  /** Resolved config for the active persona. */
  config: PersonaConfig
  /** Switch persona. Updates in-memory + POSTs to /api/me/persona. */
  setPersona: (next: Persona, opts?: { scope?: 'membership' | 'profile' }) => Promise<void>
  /** Whether the given module key is hidden for the active persona. */
  isModuleHidden: (moduleKey: string) => boolean
  /** Convenience: home route for the active persona. */
  homeRoute: string
}

export function usePersona(): UsePersonaResult {
  const ctx = useAppContext()

  const persona: Persona = isPersona(ctx.persona) ? (ctx.persona as Persona) : 'owner'
  const config = PERSONA_CONFIG[persona]

  const setPersona = useCallback(
    async (next: Persona, opts?: { scope?: 'membership' | 'profile' }) => {
      if (!isPersona(next)) return
      // Optimistic in-memory update
      ctx.setPersona(next as any)
      try {
        const res = await fetch('/api/me/persona', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ persona: next, scope: opts?.scope ?? 'membership' }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          toast.error(body?.error || 'Failed to save persona')
        }
      } catch {
        toast.error('Failed to save persona')
      }
    },
    [ctx],
  )

  const isModuleHidden = useCallback(
    (moduleKey: string) => config.hiddenModules.includes(moduleKey),
    [config],
  )

  return { persona, config, setPersona, isModuleHidden, homeRoute: config.homeRoute }
}
