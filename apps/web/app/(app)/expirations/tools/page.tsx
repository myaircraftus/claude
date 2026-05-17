// Expirations — Tool & Equipment Calibration. Backed by the tools +
// calibration_events tables; status derived from next_calibration_date.
import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { ToolsExpirationClient } from './tools-expiration-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Tool & Equipment Calibration' }

export default async function ToolsExpirationPage() {
  const { supabase, profile, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  const { data: tools } = await supabase
    .from('tools')
    .select(`
      id, name, serial_number, category, manufacturer, model, status,
      calibration_required, calibration_interval_months, tolerance_days,
      last_calibration_date, last_calibration_by, last_calibration_cert_number,
      next_calibration_date, storage_location, notes
    `)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('next_calibration_date', { ascending: true, nullsFirst: false })
    .limit(500)

  const toolIds = (tools ?? []).map((t) => t.id)
  const { data: calibrationEvents } = toolIds.length
    ? await supabase
        .from('calibration_events')
        .select('id, tool_id, performed_at, performed_by, certificate_number, result, cost, notes, next_due_date')
        .eq('organization_id', orgId)
        .in('tool_id', toolIds)
        .order('performed_at', { ascending: false })
    : { data: [] }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Expirations' }, { label: 'Tools' }]} />
      <main className="flex-1 overflow-hidden">
        <ToolsExpirationClient
          tools={(tools ?? []) as any[]}
          calibrationEvents={(calibrationEvents ?? []) as any[]}
        />
      </main>
    </div>
  )
}
