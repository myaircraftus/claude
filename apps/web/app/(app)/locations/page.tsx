import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { LocationsView } from './locations-view'
import type { Location } from '@/types'

export const metadata = { title: 'Locations' }

/**
 * Locations page (Spec 0.1) — list/create/edit org-scoped physical locations:
 * hangars, tie-downs, ramps, shop bays, offices. Supports a one-level
 * parent hierarchy so an org can model "KAPA → Hangar 14 → Bay 3" if needed.
 */
export default async function LocationsPage() {
  const { supabase, profile, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  const { data: locations } = await supabase
    .from('locations')
    .select('id, organization_id, name, airport_code, location_type, address, parent_location_id, created_at, updated_at')
    .eq('organization_id', orgId)
    .order('name', { ascending: true })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Locations' }]} />
      <main className="flex-1 overflow-hidden">
        <LocationsView
          initialLocations={(locations ?? []) as Location[]}
          userRole={membership.role}
        />
      </main>
    </div>
  )
}
