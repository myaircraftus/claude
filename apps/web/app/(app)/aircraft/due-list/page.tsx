// Due List — fleet compliance / inspection tracking, backed by compliance_items.
import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { DueListClient, type DueItem } from './due-list-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Due List' }

export default async function DueListPage() {
  const { supabase, profile, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  const [itemsRes, aircraftRes] = await Promise.all([
    supabase
      .from('compliance_items')
      .select(`
        id, title, item_type, source, source_reference,
        interval_calendar_months, interval_hours,
        last_completed_date, last_completed_hours, last_completed_cycles,
        next_due_date, next_due_hours, status, notes,
        aircraft:aircraft_id (id, tail_number, make, model)
      `)
      .eq('organization_id', orgId)
      .order('next_due_date', { ascending: true, nullsFirst: false })
      .limit(500),
    supabase
      .from('aircraft')
      .select('id, tail_number, make, model')
      .eq('organization_id', orgId)
      .eq('is_archived', false)
      .order('tail_number', { ascending: true }),
  ])

  const items: DueItem[] = ((itemsRes.data ?? []) as any[]).map((i) => ({
    ...i,
    aircraft: Array.isArray(i.aircraft) ? i.aircraft[0] ?? null : i.aircraft ?? null,
  }))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[{ label: 'Aircraft', href: '/aircraft' }, { label: 'Due List' }]}
      />
      <main className="flex-1 overflow-hidden">
        <DueListClient items={items} aircraft={(aircraftRes.data ?? []) as any[]} />
      </main>
    </div>
  )
}
