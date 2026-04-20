import { redirect } from 'next/navigation'
import Link from '@/components/shared/tenant-link'
import { ChevronRight, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { UserProfile, Plan } from '@/types'

export const metadata = { title: 'Admin — Tenants' }

// ─── Types ────────────────────────────────────────────────────────────────────

interface TenantRow {
  id: string
  name: string
  slug: string
  plan: Plan
  queries_used_this_month: number
  stripe_customer_id: string | null
  created_at: string
  aircraft_count: number
  document_count: number
  total_file_size_bytes: number
  member_count: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bytesToGb(bytes: number): string {
  if (bytes === 0) return '0 GB'
  const gb = bytes / 1073741824
  if (gb < 0.01) return '<0.01 GB'
  return `${gb.toFixed(2)} GB`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// ─── Plan badge ───────────────────────────────────────────────────────────────

function PlanBadge({ plan }: { plan: Plan }) {
  const styles: Record<Plan, string> = {
    starter:
      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-gray-100 text-gray-700',
    pro:
      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-blue-100 text-blue-800',
    fleet:
      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-purple-100 text-purple-800',
    enterprise:
      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-amber-100 text-amber-800',
  }
  const labels: Record<Plan, string> = {
    starter: 'Starter',
    pro: 'Pro',
    fleet: 'Fleet',
    enterprise: 'Enterprise',
  }
  return <span className={styles[plan] ?? styles.starter}>{labels[plan] ?? plan}</span>
}

// ─── 403 card ─────────────────────────────────────────────────────────────────

function ForbiddenCard() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md w-full rounded-lg border bg-card text-card-foreground shadow-card">
        <div className="flex flex-col space-y-1.5 p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold">Access Denied</h3>
          </div>
        </div>
        <div className="p-6 pt-0">
          <p className="text-sm text-muted-foreground">
            You do not have platform administrator privileges.
          </p>
          <div className="mt-4">
            <Link
              href="/dashboard"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              Return to dashboard
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminTenantsPage() {
  // 1. Auth check
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileRow } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profileRow) redirect('/login')
  const profile = profileRow as UserProfile

  // 2. Admin check
  if (!profile.is_platform_admin) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <Topbar
          profile={profile}
          breadcrumbs={[
            { label: 'Admin', href: '/admin' },
            { label: 'Tenants' },
          ]}
        />
        <main className="flex-1 overflow-y-auto">
          <ForbiddenCard />
        </main>
      </div>
    )
  }

  // 3. Service client
  const service = createServiceSupabase()

  // 4. Fetch all orgs
  const { data: orgsRaw } = await service
    .from('organizations')
    .select('id, name, slug, plan, queries_used_this_month, stripe_customer_id, created_at')
    .order('created_at', { ascending: false })

  const orgs = (orgsRaw ?? []) as {
    id: string
    name: string
    slug: string
    plan: Plan
    queries_used_this_month: number
    stripe_customer_id: string | null
    created_at: string
  }[]

  if (orgs.length === 0) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <Topbar
          profile={profile}
          breadcrumbs={[
            { label: 'Admin', href: '/admin' },
            { label: 'Tenants' },
          ]}
        />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold text-foreground mb-6">Tenants</h1>
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">No organizations found.</p>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    )
  }

  const orgIds = orgs.map((o) => o.id)

  // 5. Fetch per-org counts in parallel
  const [aircraftRes, documentsRes, membersRes] = await Promise.all([
    // Aircraft counts
    service
      .from('aircraft')
      .select('organization_id')
      .in('organization_id', orgIds)
      .eq('is_archived', false),

    // Documents with file sizes
    service
      .from('documents')
      .select('organization_id, file_size_bytes')
      .in('organization_id', orgIds),

    // Member counts
    service
      .from('organization_memberships')
      .select('organization_id')
      .in('organization_id', orgIds)
      .not('accepted_at', 'is', null),
  ])

  const aircraftRows = (aircraftRes.data ?? []) as { organization_id: string }[]
  const documentRows = (documentsRes.data ?? []) as {
    organization_id: string
    file_size_bytes: number | null
  }[]
  const memberRows = (membersRes.data ?? []) as { organization_id: string }[]

  // Aggregate per org
  const aircraftByOrg = new Map<string, number>()
  for (const r of aircraftRows) {
    aircraftByOrg.set(r.organization_id, (aircraftByOrg.get(r.organization_id) ?? 0) + 1)
  }

  const docCountByOrg = new Map<string, number>()
  const docSizeByOrg = new Map<string, number>()
  for (const r of documentRows) {
    docCountByOrg.set(r.organization_id, (docCountByOrg.get(r.organization_id) ?? 0) + 1)
    docSizeByOrg.set(
      r.organization_id,
      (docSizeByOrg.get(r.organization_id) ?? 0) + (r.file_size_bytes ?? 0)
    )
  }

  const membersByOrg = new Map<string, number>()
  for (const r of memberRows) {
    membersByOrg.set(r.organization_id, (membersByOrg.get(r.organization_id) ?? 0) + 1)
  }

  // Build tenant rows
  const tenants: TenantRow[] = orgs.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    plan: org.plan,
    queries_used_this_month: org.queries_used_this_month,
    stripe_customer_id: org.stripe_customer_id,
    created_at: org.created_at,
    aircraft_count: aircraftByOrg.get(org.id) ?? 0,
    document_count: docCountByOrg.get(org.id) ?? 0,
    total_file_size_bytes: docSizeByOrg.get(org.id) ?? 0,
    member_count: membersByOrg.get(org.id) ?? 0,
  }))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Tenants' },
        ]}
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Tenants</h1>
              <p className="text-sm text-muted-foreground mt-1">
                All {tenants.length.toLocaleString()} organizations on the platform
              </p>
            </div>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Name
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Slug
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Plan
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Aircraft
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Docs
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Storage
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Queries/mo
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Members
                      </th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Stripe
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((tenant, i) => (
                      <tr
                        key={tenant.id}
                        className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${
                          i % 2 === 0 ? '' : 'bg-muted/10'
                        }`}
                      >
                        <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                          {tenant.name}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                          {tenant.slug}
                        </td>
                        <td className="px-4 py-3">
                          <PlanBadge plan={tenant.plan} />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {tenant.aircraft_count.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {tenant.document_count.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                          {bytesToGb(tenant.total_file_size_bytes)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {tenant.queries_used_this_month.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {tenant.member_count.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {tenant.stripe_customer_id ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 mx-auto" />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                          {formatDate(tenant.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

        </div>
      </main>
    </div>
  )
}
