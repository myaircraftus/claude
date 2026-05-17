// Aircraft Intelligence — Airframe / Engine / Prop Comparison.
// Owner + admin only; the shop persona sees a request-access message.
// Hydrates the client with any non-expired cached report so the page paints
// without a round-trip; the client handles (re)generation.
import { redirect } from 'next/navigation'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { getCurrentPersona } from '@/lib/persona/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { readIntelligenceCache } from '@/lib/intelligence/cache'
import { Topbar } from '@/components/shared/topbar'
import { IntelligenceModuleNav } from '@/components/intelligence/IntelligenceModuleNav'
import { Lock } from 'lucide-react'
import { TimeComparisonClient, type TimeComparisonReport } from './time-comparison-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Airframe / Engine / Prop Comparison' }

export default async function TimeComparisonPage({ params }: { params: { id: string } }) {
  const { supabase, profile, membership } = await requireAppServerSession()
  const orgId = membership.organization_id
  const aircraftId = params.id

  let persona: 'owner' | 'shop' | 'admin' = 'owner'
  try {
    persona = (await getCurrentPersona()).persona
  } catch {
    // defensive — page already requires a session
  }

  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model')
    .eq('id', aircraftId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!aircraft) redirect('/aircraft')

  const ac = aircraft as { id: string; tail_number: string }

  if (persona === 'shop') {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <Topbar
          profile={profile}
          breadcrumbs={[
            { label: 'Aircraft', href: '/aircraft' },
            { label: ac.tail_number, href: `/aircraft/${ac.id}` },
            { label: 'Intelligence', href: `/aircraft/${ac.id}/intelligence` },
            { label: 'Time Comparison' },
          ]}
        />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto">
            <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-white py-16 px-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center">
                <Lock className="h-6 w-6 text-amber-500" />
              </div>
              <p className="text-sm text-foreground" style={{ fontWeight: 600 }}>
                Aircraft Intelligence is owner-only
              </p>
              <p className="text-xs text-muted-foreground max-w-md">
                Aircraft Intelligence is owner-only — request access from the owner to
                view the Airframe / Engine / Prop Comparison.
              </p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // Hydrate with any non-expired cached report (best-effort).
  let initialReport: TimeComparisonReport | null = null
  try {
    const cached = await readIntelligenceCache(
      createServiceSupabase(),
      aircraftId,
      'time-comparison',
    )
    if (cached) {
      initialReport = {
        ...(cached.result_json as object),
        cached: true,
      } as TimeComparisonReport
    }
  } catch {
    initialReport = null
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Aircraft', href: '/aircraft' },
          { label: ac.tail_number, href: `/aircraft/${ac.id}` },
          { label: 'Intelligence', href: `/aircraft/${ac.id}/intelligence` },
          { label: 'Time Comparison' },
        ]}
      />
      <IntelligenceModuleNav aircraftId={aircraftId} active="time-comparison" />
      <main className="flex-1 overflow-y-auto">
        <TimeComparisonClient aircraftId={aircraftId} initialReport={initialReport} />
      </main>
    </div>
  )
}
