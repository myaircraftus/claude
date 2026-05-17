// AD / SB Traceability — server page. Owner + admin only; the shop persona
// sees a request-access lock. Reads any cached report and hands it to the
// client component for rendering / regeneration.
import { redirect } from 'next/navigation'
import Link from '@/components/shared/tenant-link'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { getCurrentPersona } from '@/lib/persona/server'
import { readIntelligenceCache } from '@/lib/intelligence/cache'
import { Topbar } from '@/components/shared/topbar'
import { IntelligenceModuleNav } from '@/components/intelligence/IntelligenceModuleNav'
import { Lock } from 'lucide-react'
import { AdTraceabilityClient } from './ad-traceability-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'AD / SB Traceability' }

export default async function AdTraceabilityPage({ params }: { params: { id: string } }) {
  const { supabase, profile, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  let persona: 'owner' | 'shop' | 'admin' = 'owner'
  try {
    persona = (await getCurrentPersona()).persona
  } catch {
    // defensive — page already requires a session
  }

  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!aircraft) redirect('/aircraft')

  const ac = aircraft as { id: string; tail_number: string; make: string | null; model: string | null }

  const breadcrumbs = [
    { label: 'Aircraft', href: '/aircraft' },
    { label: ac.tail_number, href: `/aircraft/${ac.id}` },
    { label: 'Intelligence', href: `/aircraft/${ac.id}/intelligence` },
    { label: 'AD / SB Traceability' },
  ]

  // Shop persona: locked, no analysis over the owner's private records.
  if (persona === 'shop') {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <Topbar profile={profile} breadcrumbs={breadcrumbs} />
        <IntelligenceModuleNav aircraftId={ac.id} active="ad-traceability" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto">
            <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-white py-16 px-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center">
                <Lock className="h-6 w-6 text-amber-500" />
              </div>
              <p className="text-sm text-foreground" style={{ fontWeight: 600 }}>
                AD / SB Traceability is owner-only
              </p>
              <p className="text-xs text-muted-foreground max-w-md">
                This report runs over the owner&apos;s private aircraft records. Request access
                from the aircraft owner to view AD compliance traceability.
              </p>
              <Link
                href={`/aircraft/${ac.id}`}
                className="mt-1 text-xs text-primary hover:underline"
                style={{ fontWeight: 600 }}
              >
                Back to aircraft
              </Link>
            </div>
          </div>
        </main>
      </div>
    )
  }

  const cached = await readIntelligenceCache(supabase, ac.id, 'ad-traceability')
  const initialReport = (cached?.result_json as Record<string, unknown> | undefined) ?? null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={breadcrumbs} />
      <IntelligenceModuleNav aircraftId={ac.id} active="ad-traceability" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          <AdTraceabilityClient
            aircraftId={ac.id}
            tailNumber={ac.tail_number}
            initialReport={initialReport}
          />
        </div>
      </main>
    </div>
  )
}
