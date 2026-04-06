import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Wrench, Plus, Clock, Plane, FileText, ChevronRight } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import type { UserProfile, Aircraft, MaintenanceEntryDraft } from '@/types'

export const metadata = { title: 'Maintenance Entries' }

const ENTRY_TYPE_LABELS: Record<string, string> = {
  '100hr': '100-Hour',
  annual: 'Annual',
  oil_change: 'Oil Change',
  repair: 'Repair',
  overhaul: 'Overhaul',
  ad_compliance: 'AD Compliance',
  maintenance: 'Maintenance',
  custom: 'Custom',
}

const STATUS_VARIANT: Record<string, 'secondary' | 'warning' | 'success' | 'danger' | 'info'> = {
  draft: 'secondary',
  review: 'warning',
  signed: 'success',
  void: 'danger',
  finalized: 'info',
}

const LOGBOOK_LABELS: Record<string, string> = {
  airframe: 'Airframe',
  engine: 'Engine',
  prop: 'Propeller',
  avionics: 'Avionics',
  multiple: 'Multiple',
}

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: { aircraft?: string }
}) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileRes, membershipRes] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('organization_memberships')
      .select('organization_id, role, organizations(*)')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single(),
  ])

  const profile = profileRes.data as UserProfile
  const membership = membershipRes.data
  if (!membership) redirect('/onboarding')

  const orgId = membership.organization_id

  // Fetch aircraft for filter
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model')
    .eq('organization_id', orgId)
    .eq('is_archived', false)
    .order('tail_number')

  const aircraftList: Pick<Aircraft, 'id' | 'tail_number' | 'make' | 'model'>[] = aircraft ?? []

  // Fetch maintenance entry drafts (gracefully handle if table doesn't exist)
  let drafts: (MaintenanceEntryDraft & { aircraft?: Pick<Aircraft, 'tail_number' | 'make' | 'model'> | null })[] = []
  try {
    let query = supabase
      .from('maintenance_entry_drafts')
      .select('*, aircraft:aircraft_id(tail_number, make, model)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (searchParams.aircraft) {
      query = query.eq('aircraft_id', searchParams.aircraft)
    }

    const { data, error } = await query
    if (!error && data) {
      drafts = data as typeof drafts
    }
  } catch {
    // Table may not exist yet — show empty state
  }

  const selectedAircraftId = searchParams.aircraft ?? null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Maintenance', href: '/maintenance' },
        ]}
        actions={
          <Button size="sm" asChild>
            <Link href="/maintenance/new">
              <Plus className="h-4 w-4" />
              New Entry
            </Link>
          </Button>
        }
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Page header */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Maintenance Entries</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Create and manage FAA-compliant maintenance logbook entries with AI assistance.
              </p>
            </div>
          </div>

          {/* Aircraft filter */}
          {aircraftList.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium mr-1">
                Filter:
              </span>
              <Link href="/maintenance">
                <Badge
                  variant={selectedAircraftId === null ? 'default' : 'outline'}
                  className="cursor-pointer hover:bg-primary/90 transition-colors"
                >
                  All Aircraft
                </Badge>
              </Link>
              {aircraftList.map((ac) => (
                <Link key={ac.id} href={`/maintenance?aircraft=${ac.id}`}>
                  <Badge
                    variant={selectedAircraftId === ac.id ? 'default' : 'outline'}
                    className="cursor-pointer transition-colors"
                  >
                    <Plane className="h-3 w-3 mr-1" />
                    {ac.tail_number}
                  </Badge>
                </Link>
              ))}
            </div>
          )}

          {/* Drafts list */}
          {drafts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="p-4 rounded-full bg-muted mb-4">
                  <Wrench className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">No maintenance entries yet</h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-6">
                  Use AI to generate professionally formatted, FAA-compliant maintenance logbook entries in seconds.
                </p>
                <Button asChild>
                  <Link href="/maintenance/new">
                    <Plus className="h-4 w-4" />
                    Create First Entry
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {drafts.map((draft) => {
                const ac = draft.aircraft
                const displayText = draft.edited_text ?? draft.ai_generated_text ?? ''
                return (
                  <Link key={draft.id} href={`/maintenance/new?draft=${draft.id}`}>
                    <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="p-2 rounded-lg bg-muted flex-shrink-0 mt-0.5">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                {ac && (
                                  <span className="text-xs font-mono font-semibold text-primary">
                                    {ac.tail_number}
                                  </span>
                                )}
                                {draft.entry_type && (
                                  <Badge variant="secondary" className="text-xs">
                                    {ENTRY_TYPE_LABELS[draft.entry_type] ?? draft.entry_type}
                                  </Badge>
                                )}
                                {draft.logbook_type && (
                                  <Badge variant="outline" className="text-xs">
                                    {LOGBOOK_LABELS[draft.logbook_type] ?? draft.logbook_type}
                                  </Badge>
                                )}
                              </div>
                              {displayText ? (
                                <p className="text-sm text-foreground line-clamp-2 leading-relaxed">
                                  {displayText.slice(0, 180)}
                                  {displayText.length > 180 ? '...' : ''}
                                </p>
                              ) : draft.ai_prompt ? (
                                <p className="text-sm text-muted-foreground italic line-clamp-2">
                                  "{draft.ai_prompt.slice(0, 120)}"
                                </p>
                              ) : (
                                <p className="text-sm text-muted-foreground">No content yet</p>
                              )}
                              <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                <span>{formatDateTime(draft.created_at)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant={STATUS_VARIANT[draft.status] ?? 'secondary'}>
                              {draft.status.charAt(0).toUpperCase() + draft.status.slice(1)}
                            </Badge>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
