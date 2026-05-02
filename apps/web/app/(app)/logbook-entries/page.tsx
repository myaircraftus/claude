import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { OpsTabStrip } from '@/components/ops/ops-tab-strip'
import { LogbookEntriesListView } from './logbook-entries-list-view'

export const metadata = { title: 'Logbook Entries' }

export default async function LogbookEntriesPage() {
  const { supabase, profile, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  const { data: entries } = await supabase
    .from('logbook_entries')
    .select(`
      id, entry_type, entry_date, status, signed_at, created_at,
      hobbs_in, hobbs_out, tach_time, total_time, description,
      aircraft:aircraft_id (id, tail_number, make, model),
      work_order:work_order_id (id, work_order_number)
    `)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(200)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Logbook Entries' }]} />
      <main className="flex-1 overflow-hidden flex">
        <div className="w-full flex flex-col">
          <OpsTabStrip active="logbook" />
          <LogbookEntriesListView entries={(entries ?? []) as any[]} />
        </div>
      </main>
    </div>
  )
}
