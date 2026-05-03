/**
 * /(app)/my-day (Spec 5.1) — Mechanic persona Smart Home Screen.
 *
 * Server component:
 *   1. requireAppServerSession()
 *   2. derive clock-in state (sprint 2.5.3 clock_events) + open WO count
 *      assigned to this mechanic
 *   3. invoke generateProactiveCards() — mechanic persona scan covers
 *      open WOs + tool calibrations due
 *   4. mount <SmartHome/> — usePersona() will render the mechanic layout
 */
import { requireAppServerSession } from '@/lib/auth/server-app'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import { SmartHome } from '@/components/home/SmartHome'
import { generateProactiveCards } from '@/lib/ai/cards/generators'
import type { GreetingStatus } from '@/components/home/AIGreeting'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'My Day' }

export default async function MyDayPage() {
  const { profile, membership } = await requireAppServerSession()
  const supabase = createServerSupabase()
  const orgId = membership.organization_id

  // 1. Clocked-in state (sprint 2.5.3 — open clock_event for this user).
  const { data: openClock } = await supabase
    .from('clock_events')
    .select('id, status')
    .eq('organization_id', orgId)
    .eq('employee_id', profile.id)
    .is('clock_out_at', null)
    .maybeSingle()

  // 2. Mechanic's open WO count.
  const { count: openWoCount } = await supabase
    .from('work_orders')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .in('status', ['open', 'in_progress', 'in-progress'])

  const greeting_status: GreetingStatus = {
    clocked_in: !!openClock,
    open_wos: openWoCount ?? 0,
  }

  // 3. Proactive card generation — mechanic scan (open WOs, tool cal due).
  try {
    await generateProactiveCards(supabase, { organization_id: orgId, persona: 'mechanic' })
  } catch (e) {
    console.error('[my-day] generateProactiveCards error:', e)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'My Day' }]} />
      <main className="flex-1 overflow-y-auto">
        <SmartHome
          full_name={profile.full_name ?? profile.email ?? 'there'}
          greeting_status={greeting_status}
          aircraft={[]}
        />
      </main>
    </div>
  )
}
