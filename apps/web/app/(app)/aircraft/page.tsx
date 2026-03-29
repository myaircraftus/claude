import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Plane, Plus, MapPin, FileText, Clock } from 'lucide-react'
import type { Aircraft, UserProfile } from '@/types'

export const metadata = { title: 'Aircraft' }

// ─── Aircraft card ────────────────────────────────────────────────────────────

function AircraftCard({
  aircraft,
  documentCount,
}: {
  aircraft: Aircraft
  documentCount: number
}) {
  return (
    <Link href={`/aircraft/${aircraft.id}`}>
      <Card className="hover:shadow-card-hover transition-shadow cursor-pointer group">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center group-hover:bg-brand-100 transition-colors">
              <Plane className="h-6 w-6 text-brand-500" />
            </div>
            <Badge variant="secondary" className="flex items-center gap-1 text-xs">
              <FileText className="h-3 w-3" />
              {documentCount} {documentCount === 1 ? 'doc' : 'docs'}
            </Badge>
          </div>

          <div className="space-y-1">
            <p className="font-mono text-xl font-bold text-foreground tracking-wide">
              {aircraft.tail_number}
            </p>
            <p className="text-sm font-medium text-foreground">
              {aircraft.make} {aircraft.model}
            </p>
            {aircraft.year && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {aircraft.year}
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {aircraft.base_airport && (
              <Badge variant="outline" className="text-xs flex items-center gap-1">
                <MapPin className="h-2.5 w-2.5" />
                {aircraft.base_airport}
              </Badge>
            )}
            {aircraft.total_time_hours != null && (
              <Badge variant="outline" className="text-xs">
                {aircraft.total_time_hours.toLocaleString()} hrs TT
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center mb-4">
        <Plane className="h-8 w-8 text-brand-300" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">No aircraft yet</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">
        Add your first aircraft to start organizing documents and maintenance records.
      </p>
      <Button asChild>
        <Link href="/aircraft/new">
          <Plus className="mr-2 h-4 w-4" />
          Add aircraft
        </Link>
      </Button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AircraftPage() {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileRes, membershipRes] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('organization_memberships')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single(),
  ])

  const profile = profileRes.data as UserProfile
  if (!profile) redirect('/login')

  const membership = membershipRes.data
  if (!membership) redirect('/onboarding')

  const orgId = membership.organization_id

  // Fetch aircraft (non-archived)
  const { data: aircraftList } = await supabase
    .from('aircraft')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })

  const aircraft = (aircraftList ?? []) as Aircraft[]

  // Fetch document counts for all aircraft in one query
  const { data: docRows } = await supabase
    .from('documents')
    .select('aircraft_id')
    .eq('organization_id', orgId)
    .not('aircraft_id', 'is', null)

  const countMap: Record<string, number> = {}
  for (const row of docRows ?? []) {
    if (row.aircraft_id) {
      countMap[row.aircraft_id] = (countMap[row.aircraft_id] ?? 0) + 1
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[{ label: 'Aircraft' }]}
        actions={
          <Button size="sm" asChild>
            <Link href="/aircraft/new">
              <Plus className="mr-1 h-4 w-4" />
              Add Aircraft
            </Link>
          </Button>
        }
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground">Aircraft</h1>
            <p className="text-muted-foreground text-sm">
              {aircraft.length} {aircraft.length === 1 ? 'aircraft' : 'aircraft'} in your fleet
            </p>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {aircraft.length === 0 ? (
              <EmptyState />
            ) : (
              aircraft.map(ac => (
                <AircraftCard
                  key={ac.id}
                  aircraft={ac}
                  documentCount={countMap[ac.id] ?? 0}
                />
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
