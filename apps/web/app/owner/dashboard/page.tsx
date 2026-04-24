import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type CustomerRow = {
  id: string
  name: string | null
  email: string | null
  organization_id: string
  organizations: { id: string; name: string | null; slug: string | null } | null
}

type AircraftRow = {
  id: string
  tail_number: string | null
  make: string | null
  model: string | null
  organization_id: string
  owner_customer_id: string | null
}

type ApprovalRow = {
  id: string
  status: string | null
  total: number | null
  aircraft_id: string | null
  customer_id: string | null
  organization_id: string
  created_at: string | null
  kind: 'estimate' | 'work_order' | 'invoice'
}

const PENDING_STATUSES = new Set([
  'awaiting_approval',
  'sent',
  'ready_for_signoff',
  'open',
])

function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Number(value))
}

function statusLabel(status: string | null | undefined) {
  if (!status) return 'unknown'
  return status.replace(/_/g, ' ')
}

export default async function OwnerDashboardPage() {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?redirect=/owner/dashboard')
  }

  const service = createServiceSupabase()

  const { data: customerRows } = await service
    .from('customers')
    .select('id, name, email, organization_id, organizations(id, name, slug)')
    .eq('portal_user_id', user.id)
    .eq('portal_access', true)

  const customers = (customerRows ?? []) as unknown as CustomerRow[]

  if (customers.length === 0) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center px-6 py-16">
        <div className="max-w-xl w-full bg-card border border-border rounded-2xl shadow-sm p-10 text-center">
          <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
            Owner portal
          </div>
          <h1 className="text-2xl font-semibold text-foreground mb-3">
            No maintenance shops linked yet
          </h1>
          <p className="text-sm text-muted-foreground">
            This portal shows aircraft records, estimates, work orders, and invoices that
            your mechanic shop shares with you. Ask your shop to send an invite, or open
            your own workspace dashboard to manage aircraft you own directly.
          </p>
          <div className="mt-8 flex gap-3 justify-center">
            <Link
              href="/dashboard"
              className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
            >
              Your workspace
            </Link>
          </div>
        </div>
      </main>
    )
  }

  const customerIds = customers.map((c) => c.id)
  const orgIds = Array.from(new Set(customers.map((c) => c.organization_id)))

  const [ownedAircraftRes, assignedAircraftRes, estimatesRes, workOrdersRes, invoicesRes] =
    await Promise.all([
      service
        .from('aircraft')
        .select('id, tail_number, make, model, organization_id, owner_customer_id')
        .in('owner_customer_id', customerIds),
      service
        .from('aircraft_customer_assignments')
        .select('aircraft:aircraft_id(id, tail_number, make, model, organization_id, owner_customer_id)')
        .in('customer_id', customerIds),
      service
        .from('estimates')
        .select('id, status, total, aircraft_id, customer_id, organization_id, created_at')
        .in('customer_id', customerIds)
        .order('created_at', { ascending: false })
        .limit(200),
      service
        .from('work_orders')
        .select('id, status, total_amount, aircraft_id, customer_id, organization_id, created_at')
        .in('customer_id', customerIds)
        .order('created_at', { ascending: false })
        .limit(200),
      service
        .from('invoices')
        .select('id, status, total, aircraft_id, customer_id, organization_id, created_at')
        .in('customer_id', customerIds)
        .order('created_at', { ascending: false })
        .limit(200),
    ])

  const ownedAircraft = (ownedAircraftRes.data ?? []) as AircraftRow[]
  const assignedRaw = (assignedAircraftRes.data ?? []) as Array<{ aircraft: AircraftRow | null }>
  const assignedAircraft = assignedRaw.map((r) => r.aircraft).filter((a): a is AircraftRow => !!a)

  const aircraftById = new Map<string, AircraftRow>()
  for (const a of [...ownedAircraft, ...assignedAircraft]) {
    if (a && !aircraftById.has(a.id)) aircraftById.set(a.id, a)
  }

  const approvals: ApprovalRow[] = [
    ...((estimatesRes.data ?? []) as Array<any>).map((r) => ({ ...r, kind: 'estimate' as const })),
    ...((workOrdersRes.data ?? []) as Array<any>).map((r) => ({
      ...r,
      total: r.total_amount ?? null,
      kind: 'work_order' as const,
    })),
    ...((invoicesRes.data ?? []) as Array<any>).map((r) => ({ ...r, kind: 'invoice' as const })),
  ]

  const pendingApprovals = approvals.filter((a) => a.status && PENDING_STATUSES.has(a.status))

  const documentCounts = new Map<string, number>()
  if (aircraftById.size > 0) {
    const { data: docRows } = await service
      .from('documents')
      .select('aircraft_id')
      .in('aircraft_id', Array.from(aircraftById.keys()))
      .limit(10000)
    for (const row of docRows ?? []) {
      if (!row.aircraft_id) continue
      documentCounts.set(row.aircraft_id, (documentCounts.get(row.aircraft_id) ?? 0) + 1)
    }
  }

  const customersByOrg = new Map<string, CustomerRow[]>()
  for (const c of customers) {
    const list = customersByOrg.get(c.organization_id) ?? []
    list.push(c)
    customersByOrg.set(c.organization_id, list)
  }

  const pendingCount = pendingApprovals.length
  const totalAircraft = aircraftById.size
  const totalDocs = Array.from(documentCounts.values()).reduce((s, n) => s + n, 0)

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted/20 px-4 py-8 sm:px-8 sm:py-12">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-1">
            Owner portal
          </div>
          <h1 className="text-3xl font-semibold text-foreground">Your aircraft, at a glance</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            Records and activity from the maintenance shops you work with. Approve estimates,
            review work orders, pay invoices, and see what your mechanic is uploading — all in one place.
          </p>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Aircraft
            </div>
            <div className="mt-2 text-3xl font-semibold text-foreground">{totalAircraft}</div>
            <div className="text-xs text-muted-foreground mt-1">linked across your shops</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Pending approvals
            </div>
            <div className="mt-2 text-3xl font-semibold text-foreground">{pendingCount}</div>
            <div className="text-xs text-muted-foreground mt-1">estimates, work orders, invoices</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Documents
            </div>
            <div className="mt-2 text-3xl font-semibold text-foreground">{totalDocs}</div>
            <div className="text-xs text-muted-foreground mt-1">across your aircraft</div>
          </div>
        </section>

        {pendingApprovals.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-semibold text-foreground mb-3">Needs your review</h2>
            <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
              {pendingApprovals.slice(0, 10).map((item) => {
                const aircraft = item.aircraft_id ? aircraftById.get(item.aircraft_id) : undefined
                const customer = customers.find((c) => c.id === item.customer_id)
                const orgName = customer?.organizations?.name ?? 'Maintenance shop'
                const kindLabel =
                  item.kind === 'estimate'
                    ? 'Estimate'
                    : item.kind === 'work_order'
                    ? 'Work order'
                    : 'Invoice'
                return (
                  <div key={`${item.kind}-${item.id}`} className="p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground">
                        {kindLabel} · {aircraft?.tail_number ?? 'aircraft'}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {orgName} · {statusLabel(item.status)}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-foreground">
                      {formatCurrency(item.total)}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {orgIds.map((orgId) => {
          const orgCustomers = customersByOrg.get(orgId) ?? []
          const shopName = orgCustomers[0]?.organizations?.name ?? 'Maintenance shop'
          const shopSlug = orgCustomers[0]?.organizations?.slug ?? null
          const shopAircraft = Array.from(aircraftById.values()).filter(
            (a) => a.organization_id === orgId
          )

          return (
            <section key={orgId} className="mb-10">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-lg font-semibold text-foreground">{shopName}</h2>
                {shopSlug && (
                  <span className="text-xs text-muted-foreground font-mono">{shopSlug}</span>
                )}
              </div>
              {shopAircraft.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
                  No aircraft linked yet. Ask your shop to assign an aircraft to your customer record.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {shopAircraft.map((a) => {
                    const docCount = documentCounts.get(a.id) ?? 0
                    const pendingForAircraft = pendingApprovals.filter(
                      (p) => p.aircraft_id === a.id
                    ).length
                    return (
                      <div
                        key={a.id}
                        className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-2"
                      >
                        <div className="flex items-baseline justify-between">
                          <div className="text-base font-semibold text-foreground">
                            {a.tail_number ?? 'Untitled'}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {[a.make, a.model].filter(Boolean).join(' ') || '—'}
                          </div>
                        </div>
                        <div className="flex gap-4 text-xs text-muted-foreground">
                          <span>
                            <span className="font-semibold text-foreground">{docCount}</span> docs
                          </span>
                          <span>
                            <span className="font-semibold text-foreground">
                              {pendingForAircraft}
                            </span>{' '}
                            pending
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </main>
  )
}
