import { Dashboard } from '@/components/redesign/Dashboard'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { getCurrentPersona } from '@/lib/persona/server'
import { OwnerDashboard, type OwnerDashboardData } from './owner-dashboard'
import type { OrganizationOperationType } from '@/types'

export const metadata = { title: 'Dashboard' }
export const dynamic = 'force-dynamic'

/** Pull the first name out of a full name / email. */
function firstNameOf(profile: { full_name?: string | null; email?: string | null }): string {
  const fromName = (profile.full_name ?? '').trim().split(/\s+/)[0]
  if (fromName) return fromName
  const fromEmail = (profile.email ?? '').split('@')[0]
  return fromEmail || 'there'
}

function tailOf(rel: unknown): string | null {
  if (!rel) return null
  const r = Array.isArray(rel) ? rel[0] : rel
  return (r as { tail_number?: string })?.tail_number ?? null
}

export default async function DashboardPage() {
  const { supabase, profile, membership } = await requireAppServerSession()
  const { persona } = await getCurrentPersona()

  // Shop / admin personas keep the existing operations dashboard untouched.
  if (persona !== 'owner') {
    return <Dashboard />
  }

  // ── Owner dashboard — all data fetched server-side, in parallel. ──
  const orgId = membership.organization_id

  const [
    aircraftRes,
    approvalsRes,
    approvalsCountRes,
    squawksCountRes,
    woCountRes,
    estActivityRes,
    invActivityRes,
    woActivityRes,
    sqActivityRes,
    logbookRes,
    orgRes,
  ] = await Promise.all([
    supabase
      .from('aircraft')
      .select('id, tail_number, make, model, year')
      .eq('organization_id', orgId)
      .eq('is_archived', false)
      .order('tail_number', { ascending: true }),
    supabase
      .from('approval_requests')
      .select('id, subject, aircraft_id, sent_date, status')
      .eq('organization_id', orgId)
      .in('status', ['sent', 'partially-responded'])
      .order('sent_date', { ascending: false })
      .limit(3),
    supabase
      .from('approval_requests')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .in('status', ['sent', 'partially-responded']),
    supabase
      .from('squawks')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .neq('status', 'closed')
      .neq('status', 'resolved'),
    supabase
      .from('work_orders')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .in('status', ['open', 'in_progress']),
    supabase
      .from('estimates')
      .select('estimate_number, status, updated_at, aircraft:aircraft_id (tail_number)')
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false })
      .limit(5),
    supabase
      .from('invoices')
      .select('invoice_number, status, updated_at, aircraft:aircraft_id (tail_number)')
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false })
      .limit(5),
    supabase
      .from('work_orders')
      .select('work_order_number, status, updated_at, aircraft:aircraft_id (tail_number)')
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false })
      .limit(5),
    supabase
      .from('squawks')
      .select('title, status, updated_at, aircraft:aircraft_id (tail_number)')
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false })
      .limit(5),
    supabase
      .from('logbook_entries')
      .select('aircraft_id, entry_date, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('organizations')
      .select('operation_type')
      .eq('id', orgId)
      .single(),
  ])

  const aircraftRows = (aircraftRes.data ?? []) as Array<{
    id: string
    tail_number: string
    make: string | null
    model: string | null
    year: number | null
  }>
  const tailById = new Map(aircraftRows.map((a) => [a.id, a.tail_number]))

  // Most-recent logbook entry date per aircraft.
  const lastLogbookByAircraft = new Map<string, string>()
  for (const e of (logbookRes.data ?? []) as Array<{ aircraft_id: string | null; entry_date: string | null; created_at: string | null }>) {
    if (!e.aircraft_id || lastLogbookByAircraft.has(e.aircraft_id)) continue
    lastLogbookByAircraft.set(e.aircraft_id, e.entry_date ?? e.created_at ?? '')
  }

  // Recent activity — merge a few of each entity, newest first, top 5.
  type Act = OwnerDashboardData['activity'][number]
  const activity: Act[] = []
  for (const e of (estActivityRes.data ?? []) as any[]) {
    activity.push({ kind: 'estimate', label: `Estimate ${e.estimate_number ?? ''} — ${e.status ?? ''}`.trim(), tail: tailOf(e.aircraft), when: e.updated_at })
  }
  for (const i of (invActivityRes.data ?? []) as any[]) {
    activity.push({ kind: 'invoice', label: `Invoice ${i.invoice_number ?? ''} — ${i.status ?? ''}`.trim(), tail: tailOf(i.aircraft), when: i.updated_at })
  }
  for (const w of (woActivityRes.data ?? []) as any[]) {
    activity.push({ kind: 'work_order', label: `Work order ${w.work_order_number ?? ''} — ${w.status ?? ''}`.trim(), tail: tailOf(w.aircraft), when: w.updated_at })
  }
  for (const s of (sqActivityRes.data ?? []) as any[]) {
    activity.push({ kind: 'squawk', label: `Squawk: ${s.title ?? 'updated'}`, tail: tailOf(s.aircraft), when: s.updated_at })
  }
  activity.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())

  const data: OwnerDashboardData = {
    firstName: firstNameOf(profile),
    counts: {
      aircraft: aircraftRows.length,
      approvals: approvalsCountRes.count ?? 0,
      squawks: squawksCountRes.count ?? 0,
      workOrders: woCountRes.count ?? 0,
    },
    aircraft: aircraftRows.map((a) => ({
      id: a.id,
      tail: a.tail_number,
      detail: [a.make, a.model, a.year].filter(Boolean).join(' · ') || 'Aircraft',
      lastLogbook: lastLogbookByAircraft.get(a.id) || null,
    })),
    activity: activity.slice(0, 5),
    approvals: ((approvalsRes.data ?? []) as any[]).map((a) => ({
      id: a.id,
      subject: a.subject ?? '(no subject)',
      tail: a.aircraft_id ? tailById.get(a.aircraft_id) ?? null : null,
      sentDate: a.sent_date ?? null,
    })),
  }

  const operationType =
    ((orgRes.data as { operation_type?: string } | null)?.operation_type as
      | OrganizationOperationType
      | undefined) ?? 'private'

  return (
    <OwnerDashboard
      profile={profile}
      data={data}
      organizationId={orgId}
      operationType={operationType}
    />
  )
}
