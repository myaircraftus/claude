import { redirect } from 'next/navigation'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { ProcedureRunner } from '@/components/inspections/procedure-runner'
import { createServerSupabase } from '@/lib/supabase/server'
import type { OrgRole } from '@/types'

export const metadata = { title: 'Inspection runner' }

/**
 * Per-inspection runner page (Spec 1.3). Mounts ProcedureRunner which
 * fetches the inspection + procedure + results in one round-trip and
 * renders the appropriate input UI per item.
 */
export default async function InspectionRunnerPage({
  params,
}: {
  params: { id: string }
}) {
  const { profile, membership } = await requireAppServerSession()

  const supabase = createServerSupabase()
  const { data: inspection } = await supabase
    .from('inspections')
    .select('id, procedure_name_snapshot, aircraft_id')
    .eq('id', params.id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()
  if (!inspection) redirect('/inspections')

  // Resolve aircraft tail for breadcrumb
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('tail_number')
    .eq('id', (inspection as { aircraft_id: string }).aircraft_id)
    .maybeSingle()

  const tail = aircraft?.tail_number ?? '(unknown)'
  const procName = (inspection as { procedure_name_snapshot: string | null }).procedure_name_snapshot ?? 'Inspection'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Inspections', href: '/inspections' },
          { label: `${tail} · ${procName}` },
        ]}
      />
      <main className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
        <ProcedureRunner
          inspectionId={params.id}
          userRole={membership.role as OrgRole}
        />
      </main>
    </div>
  )
}
