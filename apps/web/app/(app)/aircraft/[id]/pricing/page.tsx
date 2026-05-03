import { redirect } from 'next/navigation'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { createServerSupabase } from '@/lib/supabase/server'
import { PricingTab } from '@/components/aircraft/PricingTab'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Aircraft Pricing' }

/**
 * /(app)/aircraft/[id]/pricing  (Spec 3.1) — sub-page wrapping the
 * Pricing tab; same Path-B sub-route pattern as 1.2 compliance, 7.5
 * economics, etc.
 */
export default async function AircraftPricingPage({
  params,
}: {
  params: { id: string }
}) {
  const { profile, membership } = await requireAppServerSession()
  const supabase = createServerSupabase()

  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number')
    .eq('organization_id', membership.organization_id)
    .eq('id', params.id)
    .maybeSingle()
  if (!aircraft) redirect('/aircraft')

  const tail = (aircraft as { tail_number: string }).tail_number
  const canWrite = ['owner', 'admin'].includes(membership.role)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Aircraft', href: '/aircraft' },
          { label: tail, href: `/aircraft/${params.id}` },
          { label: 'Pricing' },
        ]}
      />
      <main className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
        <div className="mb-4">
          <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Pricing — {tail}
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Per-aircraft contract rates, discount, tax override, billing profile, and split billing. Falls
            back to org defaults when fields are blank.
          </p>
        </div>
        <PricingTab aircraftId={params.id} tailNumber={tail} canWrite={canWrite} />
      </main>
    </div>
  )
}
