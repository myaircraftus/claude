// Aircraft Intelligence — Component History Search.
// Owner + admin only; the shop persona sees a request-access message.
// A live search interface (no cached report) — the page only resolves auth,
// the aircraft, and whether any documents exist, then hands off to the client.
import { redirect } from 'next/navigation'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { getCurrentPersona } from '@/lib/persona/server'
import { Topbar } from '@/components/shared/topbar'
import { IntelligenceModuleNav } from '@/components/intelligence/IntelligenceModuleNav'
import { Lock } from 'lucide-react'
import { ComponentSearchClient } from './component-search-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Component History Search' }

export default async function ComponentSearchPage({
  params,
}: {
  params: { id: string }
}) {
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
    .select('id, tail_number')
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
            { label: 'Component Search' },
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
                search this aircraft&apos;s component history.
              </p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // Does this aircraft have any documents to search? (best-effort)
  let hasDocuments = false
  try {
    const { count } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('aircraft_id', aircraftId)
      .is('deleted_at', null)
    hasDocuments = Boolean(count && count > 0)
  } catch {
    hasDocuments = true // fail open — the search itself will return no results
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Aircraft', href: '/aircraft' },
          { label: ac.tail_number, href: `/aircraft/${ac.id}` },
          { label: 'Intelligence', href: `/aircraft/${ac.id}/intelligence` },
          { label: 'Component Search' },
        ]}
      />
      <IntelligenceModuleNav aircraftId={aircraftId} active="component-search" />
      <main className="flex-1 overflow-y-auto">
        <ComponentSearchClient
          aircraftId={aircraftId}
          aircraftTail={ac.tail_number}
          hasDocuments={hasDocuments}
        />
      </main>
    </div>
  )
}
