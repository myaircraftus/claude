'use client'

/**
 * AIGreeting (Spec 5.1) — top-of-page persona-aware greeting.
 *
 * Owner: "Good morning, Andy. N12345 is ready. ⛽ 38.5 Hobbs."
 * Mechanic: "Good morning, Mike. Clocked in?" (with single-tap clock)
 *
 * Uses usePersona() so the greeting copy + status sentence swap by persona
 * without branching at every render site.
 */

import { useMemo } from 'react'
import { Plane } from 'lucide-react'
import { usePersona } from '@/lib/persona/use-persona'
import type { Persona } from '@/types'

export interface GreetingStatus {
  /** First aircraft tail number, if owner persona has any aircraft. */
  primary_tail?: string | null
  /** Latest Hobbs reading on the primary aircraft, when known. */
  hobbs?: number | null
  /** Number of open WOs assigned to the mechanic. */
  open_wos?: number
  /** Whether the mechanic is currently clocked in (sprint 2.5.3). */
  clocked_in?: boolean
}

export function AIGreeting({
  fullName,
  status = {},
}: {
  fullName: string
  status?: GreetingStatus
}) {
  const { persona } = usePersona()
  const firstName = useMemo(() => (fullName ?? '').split(/\s+/)[0] || 'there', [fullName])
  // `new Date().getHours()` reads the runtime's local clock — server (Vercel
  // Node, typically iad1/UTC) vs the user's browser yield different values
  // for users outside Eastern Time, producing a hydration mismatch on the
  // greeting headline. The greeting is text-only and harmless, so we use
  // suppressHydrationWarning on the `<h1>` per the React-sanctioned escape
  // hatch — server prints the iad1-local greeting, client re-paints with
  // the user's local greeting, and React doesn't log #425/#418/#423.
  const timeOfDay = useMemo(() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }, [])

  const headline = `${timeOfDay}, ${firstName}.`
  const subline = subhead(persona, status)

  return (
    <div className="bg-gradient-to-br from-[#0A1628] to-[#1E3A5F] rounded-2xl p-6 text-white">
      <h1 className="text-[24px] tracking-tight" style={{ fontWeight: 700 }} suppressHydrationWarning>
        {headline}
      </h1>
      {subline && (
        <p className="text-[14px] text-white/80 mt-1.5 inline-flex items-center gap-1.5">
          {persona === 'owner' && status.primary_tail ? (
            <Plane className="h-3.5 w-3.5 text-white/60" />
          ) : null}
          {subline}
        </p>
      )}
    </div>
  )
}

function subhead(persona: Persona, status: GreetingStatus): string | null {
  if (persona === 'owner') {
    if (!status.primary_tail) {
      return 'Add an aircraft to start tracking compliance, expirations, and flights.'
    }
    if (status.hobbs != null) {
      return `${status.primary_tail} is ready. ${status.hobbs.toFixed(1)} Hobbs.`
    }
    return `${status.primary_tail} is ready.`
  }
  if (persona === 'shop') {
    if (status.clocked_in) {
      const queue = status.open_wos ?? 0
      return queue === 0
        ? "You're clocked in. Queue is clear."
        : `You're clocked in. ${queue} work order${queue === 1 ? '' : 's'} waiting.`
    }
    return 'Clock in to start your shift.'
  }
  return 'Platform admin view.'
}
