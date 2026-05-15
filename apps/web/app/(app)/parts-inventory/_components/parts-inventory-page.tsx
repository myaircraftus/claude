import { redirect } from 'next/navigation'
import { Topbar } from '@/components/shared/topbar'
import { PartsInventoryWorkspace } from '@/components/parts-inventory/parts-inventory-workspace'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { requirePersona } from '@/lib/persona/route-guard'
import { createServerSupabase } from '@/lib/supabase/server'
import type { PartsInventoryViewKey } from '@/lib/parts-inventory/workflow'
import type { OrgRole } from '@/types'

export async function PartsInventoryPage({ view }: { view: PartsInventoryViewKey }) {
  const guard = await requirePersona(['shop', 'admin'])
  if (!guard.allowed) redirect(guard.redirectTo!)

  const { profile, membership } = await requireAppServerSession()
  const supabase = createServerSupabase()
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model, year')
    .order('tail_number', { ascending: true })
    .limit(200)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Parts & Inventory', href: '/parts-inventory' },
        ]}
      />
      <main className="flex-1 overflow-y-auto">
        <PartsInventoryWorkspace
          aircraft={(aircraft ?? []).map((item) => ({
            id: String(item.id),
            tail_number: String(item.tail_number),
            make: item.make ?? null,
            model: item.model ?? null,
            year: item.year ?? null,
          }))}
          initialView={view}
          userRole={membership.role as OrgRole}
        />
      </main>
    </div>
  )
}
