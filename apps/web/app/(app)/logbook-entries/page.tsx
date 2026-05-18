// OWNER PERMISSIONS: Read-only. Can view entries generated from squawks or by the shop.
// Cannot: create logbook entries.
//
// Clean list view. The inline 7-step LogbookWorkflowBoard documentation is
// gone — this page now shows only the entries table. "+ New Entry" opens a
// focused create modal. Entry rows show type + date + tail (never UUIDs).
import { requireAppServerSession } from '@/lib/auth/server-app'
import { getCurrentPersona } from '@/lib/persona/server'
import { applyOwnerLogbookVisibility } from '@/lib/logbook/visibility'
import { Topbar } from '@/components/shared/topbar'
import { OpsTabStrip } from '@/components/ops/ops-tab-strip'
import { LogbookEntriesListView } from './logbook-entries-list-view'

export const metadata = { title: 'Logbook Entries' }

export default async function LogbookEntriesPage() {
  const { supabase, profile, membership } = await requireAppServerSession()
  const { persona } = await getCurrentPersona()
  const isOwner = persona === 'owner'
  const orgId = membership.organization_id

  const [entriesRes, aircraftRes] = await Promise.all([
    // Owner-visibility gate — owners see only published/own entries.
    applyOwnerLogbookVisibility(
      supabase
        .from('logbook_entries')
        .select(`
          id, entry_type, entry_date, status, signed_at, created_at,
          hobbs_in, hobbs_out, tach_time, total_time, description, mechanic_name,
          aircraft:aircraft_id (id, tail_number, make, model),
          work_order:work_order_id (id, work_order_number)
        `)
        .eq('organization_id', orgId),
      persona,
      profile.id,
    )
      .order('created_at', { ascending: false })
      .limit(300),
    supabase
      .from('aircraft')
      .select('id, tail_number, make, model')
      .eq('organization_id', orgId)
      .eq('is_archived', false)
      .order('tail_number', { ascending: true }),
  ])

  const entries = ((entriesRes.data ?? []) as any[]).map((e) => ({
    ...e,
    aircraft: Array.isArray(e.aircraft) ? e.aircraft[0] ?? null : e.aircraft ?? null,
    work_order: Array.isArray(e.work_order) ? e.work_order[0] ?? null : e.work_order ?? null,
  }))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Logbook Entries' }]} />
      <main className="flex-1 overflow-hidden flex">
        <div className="w-full flex flex-col">
          <OpsTabStrip active="logbook" />
          <LogbookEntriesListView
            entries={entries}
            aircraft={(aircraftRes.data ?? []) as any[]}
            isOwner={isOwner}
          />
        </div>
      </main>
    </div>
  )
}
