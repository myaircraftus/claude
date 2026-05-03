/**
 * /(app)/my-aircraft (Spec 5.1) — Owner persona Smart Home Screen.
 *
 * Replaces the legacy stat-card dashboard with a persona-aware action
 * stack + aircraft tile grid. Server component:
 *   1. requireAppServerSession()
 *   2. fetch aircraft + meter readings + open squawks + nearest-expiring
 *      doc per aircraft
 *   3. invoke generateProactiveCards() to upsert ai_action_cards rows
 *      (idempotent via dedupe_key; covers expiring docs, due compliance,
 *      pending approvals)
 *   4. mount <SmartHome/> with the pre-shaped data
 *
 * Note: legacy MyAircraftClient (aircraft list) component is preserved
 * on disk for now — the canonical aircraft list lives at /aircraft, so
 * this page can repurpose to the Smart Home shell without breaking
 * other entry points.
 */
import { createServerSupabase } from '@/lib/supabase/server'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { SmartHome } from '@/components/home/SmartHome'
import type { AircraftCardSummary } from '@/components/home/AircraftCard'
import type { GreetingStatus } from '@/components/home/AIGreeting'
import { generateProactiveCards } from '@/lib/ai/cards/generators'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'My Aircraft' }

export default async function MyAircraftPage() {
  const { profile, membership } = await requireAppServerSession()
  const supabase = createServerSupabase()
  const orgId = membership.organization_id

  // 1. Aircraft list — owner persona sees all org-scoped aircraft (RLS does
  //    the filtering; we don't double-filter by user here because fleet
  //    ownership patterns vary).
  const { data: aircraftRaw } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model, meter_profile_id')
    .eq('organization_id', orgId)
    .neq('is_archived', true)
    .order('tail_number', { ascending: true })
    .limit(50)

  const aircraft: AircraftCardSummary[] = []
  for (const a of (aircraftRaw ?? []) as Array<{ id: string; tail_number: string; make: string | null; model: string | null; meter_profile_id: string | null }>) {
    aircraft.push(await loadAircraftSummary(supabase, a))
  }

  // 2. Greeting status — pull primary aircraft + Hobbs to drive the
  //    headline sentence "N12345 is ready. ⛽ 38.5 Hobbs."
  const greeting_status: GreetingStatus = aircraft.length > 0
    ? { primary_tail: aircraft[0].tail_number, hobbs: aircraft[0].hobbs ?? null }
    : {}

  // 3. Proactive card generation — idempotent, runs every render. Cheap
  //    bounded scans of expiring docs / due compliance / approvals.
  try {
    await generateProactiveCards(supabase, { organization_id: orgId, persona: 'owner' })
  } catch (e) {
    console.error('[my-aircraft] generateProactiveCards error:', e)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Home' }]} />
      <main className="flex-1 overflow-y-auto">
        <SmartHome
          full_name={profile.full_name ?? profile.email ?? 'there'}
          greeting_status={greeting_status}
          aircraft={aircraft}
        />
      </main>
    </div>
  )
}

async function loadAircraftSummary(
  supabase: ReturnType<typeof createServerSupabase>,
  a: { id: string; tail_number: string; make: string | null; model: string | null; meter_profile_id: string | null },
): Promise<AircraftCardSummary> {
  // Latest Hobbs + Tach via meter_definitions / meter_readings (sprint 1.1).
  let hobbs: number | null = null
  let tach: number | null = null
  if (a.meter_profile_id) {
    const { data: defs } = await supabase
      .from('meter_definitions')
      .select('id, name')
      .eq('meter_profile_id', a.meter_profile_id)
    const hobbsDef = ((defs ?? []) as Array<{ id: string; name: string }>).find((d) => /^hobbs/i.test(d.name))
    const tachDef = ((defs ?? []) as Array<{ id: string; name: string }>).find((d) => /^tach/i.test(d.name))
    const targets: Array<{ id: string; key: 'hobbs' | 'tach' }> = []
    if (hobbsDef) targets.push({ id: hobbsDef.id, key: 'hobbs' })
    if (tachDef)  targets.push({ id: tachDef.id,  key: 'tach' })
    for (const t of targets) {
      const { data: last } = await supabase
        .from('meter_readings')
        .select('value')
        .eq('aircraft_id', a.id)
        .eq('meter_definition_id', t.id)
        .order('reading_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const v = (last as { value?: number } | null)?.value
      if (v != null) {
        if (t.key === 'hobbs') hobbs = v
        else tach = v
      }
    }
  }

  // Open squawks count.
  const { count: squawkCount } = await supabase
    .from('squawks')
    .select('id', { count: 'exact', head: true })
    .eq('aircraft_id', a.id)
    .eq('status', 'open')

  // Today's airborne hours from sprint 4.3 flight_events.
  const todayIso = new Date(); todayIso.setHours(0, 0, 0, 0)
  const { data: todayFlights } = await supabase
    .from('flight_events')
    .select('airborne_hours')
    .eq('aircraft_id', a.id)
    .gte('start_time', todayIso.toISOString())
  const today_airborne_hours = ((todayFlights ?? []) as Array<{ airborne_hours: number }>)
    .reduce((acc, f) => acc + (f.airborne_hours ?? 0), 0) || null

  // Nearest expiring doc (sprint 2.6.2).
  const { data: nextExpDoc } = await supabase
    .from('documents')
    .select('expiration_date, expiration_category')
    .eq('aircraft_id', a.id)
    .eq('has_expiration', true)
    .gte('expiration_date', new Date().toISOString().slice(0, 10))
    .order('expiration_date', { ascending: true })
    .limit(1)
    .maybeSingle()
  const exp = nextExpDoc as { expiration_date?: string | null; expiration_category?: string | null } | null
  const days_until_next_expiration = exp?.expiration_date
    ? Math.max(0, Math.round((Date.parse(exp.expiration_date) - Date.now()) / 86_400_000))
    : null

  return {
    id: a.id,
    tail_number: a.tail_number,
    make: a.make,
    model: a.model,
    hobbs,
    tach,
    open_squawks: squawkCount ?? 0,
    today_airborne_hours,
    days_until_next_expiration,
    next_expiring_label: exp?.expiration_category ?? (exp?.expiration_date ? 'Expiring doc' : null),
  }
}
