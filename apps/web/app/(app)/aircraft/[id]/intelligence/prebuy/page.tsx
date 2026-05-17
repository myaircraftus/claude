/**
 * Prebuy Report module — server page.
 *
 * Owner + admin only; the shop persona sees a request-access lock block.
 * Reads any non-expired intelligence_cache row so the client can render an
 * existing report immediately, then hands off to the interactive client.
 */
import { redirect } from 'next/navigation'
import Link from '@/components/shared/tenant-link'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { getCurrentPersona } from '@/lib/persona/server'
import { readIntelligenceCache } from '@/lib/intelligence/cache'
import { Topbar } from '@/components/shared/topbar'
import { IntelligenceModuleNav } from '@/components/intelligence/IntelligenceModuleNav'
import { Lock, ArrowLeft } from 'lucide-react'
import { PrebuyClient, type PrebuyReport } from './prebuy-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Prebuy Report' }

export default async function PrebuyPage({ params }: { params: { id: string } }) {
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
    { label: 'Prebuy Report' },
  ]

  // ── Shop persona — locked ──────────────────────────────────────────────
  if (persona === 'shop') {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <Topbar profile={profile} breadcrumbs={breadcrumbs} />
        <IntelligenceModuleNav aircraftId={ac.id} active="prebuy" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto mt-8 flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-white py-16 px-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center">
              <Lock className="h-6 w-6 text-amber-500" />
            </div>
            <p className="text-sm text-foreground" style={{ fontWeight: 600 }}>
              The Prebuy Report is owner-only
            </p>
            <p className="text-xs text-muted-foreground max-w-md">
              This pre-purchase evaluation runs over the owner&apos;s private aircraft
              records. Request access from the aircraft owner to view it.
            </p>
            <Link
              href={`/aircraft/${ac.id}/intelligence`}
              className="mt-2 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
              style={{ fontWeight: 600 }}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Intelligence
            </Link>
          </div>
        </main>
      </div>
    )
  }

  // ── Owner / admin — load any cached report ─────────────────────────────
  const cached = await readIntelligenceCache(supabase, ac.id, 'prebuy')
  const initialReport = (cached?.result_json as PrebuyReport | undefined) ?? null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={breadcrumbs} />
      <IntelligenceModuleNav aircraftId={ac.id} active="prebuy" />
      <main className="flex-1 overflow-y-auto p-6">
        <PrebuyClient
          aircraftId={ac.id}
          tailNumber={ac.tail_number}
          initialReport={initialReport}
        />
      </main>
    </div>
  )
}
