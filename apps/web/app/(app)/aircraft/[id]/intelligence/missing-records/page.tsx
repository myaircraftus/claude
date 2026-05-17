/**
 * Missing Records Detector — module page (server component).
 *
 * Owner / admin only; the shop persona sees a request-access lock block.
 * Reads any non-expired cached report so the page renders instantly, then
 * hands off to the client component for on-demand (re)scans.
 */
import { redirect } from 'next/navigation'
import Link from '@/components/shared/tenant-link'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { getCurrentPersona } from '@/lib/persona/server'
import { readIntelligenceCache } from '@/lib/intelligence/cache'
import { Topbar } from '@/components/shared/topbar'
import { IntelligenceModuleNav } from '@/components/intelligence/IntelligenceModuleNav'
import { AlertTriangle, Lock } from 'lucide-react'
import { MissingRecordsClient, type MissingRecordsReport } from './missing-records-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Missing Records Detector' }

export default async function MissingRecordsPage({
  params,
}: {
  params: { id: string }
}) {
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

  const ac = aircraft as {
    id: string
    tail_number: string
    make: string | null
    model: string | null
  }

  const breadcrumbs = [
    { label: 'Aircraft', href: '/aircraft' },
    { label: ac.tail_number, href: `/aircraft/${ac.id}` },
    { label: 'Intelligence', href: `/aircraft/${ac.id}/intelligence` },
    { label: 'Missing Records' },
  ]

  // --- Shop persona → locked ----------------------------------------------
  if (persona === 'shop') {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <Topbar profile={profile} breadcrumbs={breadcrumbs} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto">
            <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-white py-16 px-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center">
                <Lock className="h-6 w-6 text-amber-500" />
              </div>
              <p className="text-sm text-foreground" style={{ fontWeight: 600 }}>
                The Missing Records Detector is owner-only
              </p>
              <p className="text-xs text-muted-foreground max-w-md">
                This module analyzes the owner&apos;s private aircraft records to
                surface gaps and anomalies. Request access from the aircraft owner
                to view it.
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

  // --- Owner / admin → load cache + render client -------------------------
  let initialReport: MissingRecordsReport | null = null
  try {
    const cached = await readIntelligenceCache(supabase, ac.id, 'missing-records')
    if (cached) {
      initialReport = {
        ...(cached.result_json as Omit<MissingRecordsReport, 'cached' | 'generated_at'>),
        cached: true,
        generated_at: cached.generated_at,
      } as MissingRecordsReport
    }
  } catch {
    // a missing cache row is fine — the client just shows the run prompt
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={breadcrumbs} />
      <IntelligenceModuleNav aircraftId={ac.id} active="missing-records" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <h1
                className="text-[20px] tracking-tight text-foreground"
                style={{ fontWeight: 700 }}
              >
                Missing Records Detector
              </h1>
              <p className="text-[12px] text-muted-foreground">
                {ac.tail_number}
                {[ac.make, ac.model].filter(Boolean).length > 0
                  ? ` · ${[ac.make, ac.model].filter(Boolean).join(' ')}`
                  : ''}{' '}
                — finds gaps and anomalies that suggest records are missing.
              </p>
            </div>
          </div>

          <MissingRecordsClient aircraftId={ac.id} initialReport={initialReport} />
        </div>
      </main>
    </div>
  )
}
