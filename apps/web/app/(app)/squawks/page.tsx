// OWNER PERMISSIONS: report + track only. Owners see owner-visible squawks for
// the org and can file new ones; they do NOT classify, route, reassign, or
// close — those are shop-authoritative. Enforced in the UI (persona) here; the
// query also narrows owners to owner_visible rows.
import { requireAppServerSession } from '@/lib/auth/server-app'
import { getCurrentPersona } from '@/lib/persona/server'
import { Topbar } from '@/components/shared/topbar'
import { SquawksWorkspace } from '@/components/squawks/squawks-workspace'

export const metadata = { title: 'Squawks' }

export default async function SquawksPage() {
  const { supabase, profile, membership } = await requireAppServerSession()
  const { persona } = await getCurrentPersona()
  const isOwner = persona === 'owner'
  const orgId = membership.organization_id

  let squawksQuery = supabase
    .from('squawks')
    .select(`
      id, organization_id, aircraft_id, title, description, category, severity, status, source,
      source_metadata, owner_visible, owner_summary, current_route_type,
      assigned_work_order_id, linked_estimate_id, linked_task_id, linked_checklist_item_id,
      reported_at, resolved_at, verified_by_user_id, verified_at,
      closure_reason, closure_notes, duplicate_of_squawk_id,
      suggested_ata_code, suggested_jasc_code, confirmed_ata_code, confirmed_jasc_code,
      classification_source, classification_confidence, classification_status,
      created_at, updated_at,
      reporter:reported_by (id, full_name, email, avatar_url),
      aircraft:aircraft_id (id, tail_number, make, model),
      evidence:squawk_evidence (id, evidence_type, file_name, file_type, owner_visible, internal_only, created_at),
      ai_drafts:squawk_ai_drafts (id, status, confidence, suggested_title, suggested_severity, suggested_route, created_at),
      status_history:squawk_status_history (id, from_status, to_status, reason, notes, actor_id, created_at)
    `)
    .eq('organization_id', orgId)

  // Owners only ever see what the shop has marked owner-visible.
  if (isOwner) squawksQuery = squawksQuery.eq('owner_visible', true)

  const [squawksRes, aircraftRes] = await Promise.all([
    squawksQuery.order('created_at', { ascending: false }).limit(200),
    supabase
      .from('aircraft')
      .select('id, tail_number, make, model, owner_customer_id')
      .eq('organization_id', orgId)
      .order('tail_number', { ascending: true })
      .limit(500),
  ])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Squawks' }]} />
      <main className="flex-1 overflow-hidden">
        <SquawksWorkspace
          mode="global"
          isOwner={isOwner}
          aircraftOptions={(aircraftRes.data ?? []) as any[]}
          initialSquawks={(squawksRes.data ?? []).map((s: any) => ({
            ...s,
            reporter: Array.isArray(s.reporter) ? s.reporter[0] ?? null : s.reporter ?? null,
            aircraft: Array.isArray(s.aircraft) ? s.aircraft[0] ?? null : s.aircraft ?? null,
          }))}
        />
      </main>
    </div>
  )
}
