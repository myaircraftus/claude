'use client'

/**
 * SmartHome (Spec 5.1) — persona-aware home shell.
 *
 * This is the layer above the page route — `/my-aircraft/page.tsx` and
 * `/my-day/page.tsx` both mount it with their pre-fetched server data,
 * and SmartHome decides which arrangement to render based on
 * `usePersona()`.
 *
 * Layout per spec:
 *   Owner   → Greeting · Action stack · Aircraft tile grid
 *   Mechanic → Greeting (clock-in pill) · Today's WOs · Tools/cert cards
 *
 * The action stack itself is the SAME component (ActionCardStack); only
 * the category filter differs by persona — Phase 5.2 will likely fold
 * the filter logic into the orchestrator, at which point this becomes a
 * tighter shell.
 */

import { AIGreeting, type GreetingStatus } from './AIGreeting'
import { AircraftCard, type AircraftCardSummary } from './AircraftCard'
import { ActionCardStack } from './ActionCardStack'
import { usePersona } from '@/lib/persona/use-persona'
import { VoiceButton } from '@/components/voice/VoiceButton'

export interface SmartHomeServerData {
  /** Sourced from user_profiles.full_name (or email fallback). */
  full_name: string
  /** Top-of-page status panel data — see AIGreeting for shape. */
  greeting_status: GreetingStatus
  /** Aircraft tiles (Owner persona). */
  aircraft: AircraftCardSummary[]
}

export function SmartHome(props: SmartHomeServerData) {
  const { persona } = usePersona()

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <AIGreeting fullName={props.full_name} status={props.greeting_status} />

      {persona === 'owner' && <OwnerLayout {...props} />}
      {/* Phase 18 mig 119: mechanic merged into shop. The legacy MechanicLayout
          is now the canonical operational home for shop. Admin keeps the
          owner-side aircraft view for the universal /my-aircraft surface. */}
      {persona === 'shop' && <MechanicLayout {...props} />}
      {persona === 'admin' && <OwnerLayout {...props} />}

      {/* Spec 5.4 — voice input on every home surface. Floats bottom-right. */}
      <div className="fixed bottom-4 right-4 z-40">
        <VoiceButton />
      </div>
    </div>
  )
}

function OwnerLayout({ aircraft }: SmartHomeServerData) {
  return (
    <>
      <ActionCardStack
        title="What needs your attention"
        emptyHint="No alerts. Your aircraft are current."
        categories={['compliance', 'expiration', 'maintenance', 'approval', 'anomaly', 'insight']}
        maxCards={6}
      />

      <section>
        <h2 className="text-[16px] tracking-tight text-foreground mb-3" style={{ fontWeight: 700 }}>
          {aircraft.length === 1 ? 'Your aircraft' : `Your aircraft · ${aircraft.length}`}
        </h2>
        {aircraft.length === 0 ? (
          <div className="bg-white border border-dashed border-border rounded-2xl p-8 text-center">
            <p className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>No aircraft yet</p>
            <p className="text-[11.5px] text-muted-foreground mt-1">
              Add your first aircraft from the Aircraft page.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            {aircraft.map((a) => (
              <AircraftCard key={a.id} summary={a} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}

function MechanicLayout(_props: SmartHomeServerData) {
  return (
    <>
      <ActionCardStack
        title="Today's queue"
        emptyHint="No active work orders or calibration items today."
        categories={['maintenance', 'compliance', 'anomaly']}
        maxCards={6}
      />

      <ActionCardStack
        title="Heads up"
        emptyHint=""
        categories={['expiration', 'insight', 'approval']}
        maxCards={3}
      />
    </>
  )
}
