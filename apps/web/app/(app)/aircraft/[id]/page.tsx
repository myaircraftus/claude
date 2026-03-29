import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Plane,
  FileText,
  MessageSquare,
  Clock,
  Settings,
  MapPin,
  Calendar,
  Wrench,
  Upload,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Timer,
} from 'lucide-react'
import {
  formatDate,
  formatDateTime,
  DOC_TYPE_LABELS,
  PARSING_STATUS_LABELS,
  cn,
} from '@/lib/utils'
import type { Aircraft, Document, MaintenanceEvent, UserProfile } from '@/types'

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
              {label}
            </p>
            <p className="text-2xl font-bold mt-1 text-foreground">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="p-2 rounded-lg bg-muted">{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Parsing status badge ─────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, 'success' | 'warning' | 'danger' | 'secondary'> = {
    completed: 'success',
    failed: 'danger',
    queued: 'secondary',
    parsing: 'warning',
    chunking: 'warning',
    embedding: 'warning',
    needs_ocr: 'warning',
    ocr_processing: 'warning',
  }
  return (
    <Badge variant={variantMap[status] ?? 'secondary'} className="text-xs">
      {PARSING_STATUS_LABELS[status] ?? status}
    </Badge>
  )
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  aircraft,
  documents,
  maintenanceEvents,
  lastQueryAt,
}: {
  aircraft: Aircraft
  documents: Document[]
  maintenanceEvents: MaintenanceEvent[]
  lastQueryAt: string | null
}) {
  const completedDocs = documents.filter(d => d.parsing_status === 'completed').length
  const recentDocs = documents.slice(0, 5)
  const recentEvents = maintenanceEvents.slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={<FileText className="h-4 w-4 text-brand-500" />}
          label="Total documents"
          value={documents.length}
          sub={`${completedDocs} indexed`}
        />
        <StatCard
          icon={<MessageSquare className="h-4 w-4 text-sky-500" />}
          label="Last query"
          value={lastQueryAt ? formatDate(lastQueryAt) : '—'}
          sub={lastQueryAt ? formatDateTime(lastQueryAt) : 'No queries yet'}
        />
        <StatCard
          icon={<Timer className="h-4 w-4 text-amber-500" />}
          label="Total time"
          value={
            aircraft.total_time_hours != null
              ? `${aircraft.total_time_hours.toLocaleString()} hrs`
              : '—'
          }
          sub="Airframe hours"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent documents */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Recent Documents</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/documents/upload?aircraft=${aircraft.id}`}>
                <Upload className="h-4 w-4" />
                Upload
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentDocs.length === 0 ? (
              <div className="text-center py-6">
                <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No documents yet</p>
                <Button size="sm" variant="outline" className="mt-3" asChild>
                  <Link href={`/documents/upload?aircraft=${aircraft.id}`}>
                    Upload first document
                  </Link>
                </Button>
              </div>
            ) : (
              recentDocs.map(doc => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-accent transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type} ·{' '}
                      {formatDate(doc.uploaded_at)}
                    </p>
                  </div>
                  <StatusBadge status={doc.parsing_status} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Maintenance events */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Maintenance Events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentEvents.length === 0 ? (
              <div className="text-center py-6">
                <Wrench className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No maintenance events extracted yet
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Upload logbooks or work orders to populate timeline
                </p>
              </div>
            ) : (
              recentEvents.map(event => (
                <div
                  key={event.id}
                  className="flex items-start gap-3 p-2 rounded-md hover:bg-accent transition-colors"
                >
                  <div className="mt-0.5">
                    {event.is_verified ? (
                      <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {event.event_type ?? 'Maintenance'}
                    </p>
                    {event.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {event.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {event.event_date ? formatDate(event.event_date) : 'Date unknown'}
                      {event.airframe_tt != null && ` · ${event.airframe_tt} hrs`}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ─── Documents tab ────────────────────────────────────────────────────────────

function DocumentsTab({
  aircraft,
  documents,
}: {
  aircraft: Aircraft
  documents: Document[]
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {documents.length} {documents.length === 1 ? 'document' : 'documents'}
        </p>
        <Button size="sm" asChild>
          <Link href={`/documents/upload?aircraft=${aircraft.id}`}>
            <Upload className="mr-1 h-4 w-4" />
            Upload
          </Link>
        </Button>
      </div>

      {documents.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="font-semibold text-foreground mb-1">No documents</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Upload documents for {aircraft.tail_number} to get started.
            </p>
            <Button asChild>
              <Link href={`/documents/upload?aircraft=${aircraft.id}`}>
                <Upload className="mr-2 h-4 w-4" />
                Upload documents
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-border">
            {documents.map(doc => (
              <div
                key={doc.id}
                className="flex items-center gap-4 p-4 hover:bg-accent/50 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                  <FileText className="h-4 w-4 text-brand-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
                    </span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(doc.uploaded_at)}
                    </span>
                    {doc.page_count != null && (
                      <>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">
                          {doc.page_count} pages
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <StatusBadge status={doc.parsing_status} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Ask tab ──────────────────────────────────────────────────────────────────

function AskTab({ aircraft }: { aircraft: Aircraft }) {
  return (
    <Card>
      <CardContent className="py-16 text-center">
        <MessageSquare className="h-10 w-10 text-brand-300 mx-auto mb-3" />
        <h3 className="font-semibold text-foreground mb-1">
          Ask questions about {aircraft.tail_number}
        </h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
          Use AI-powered search to query maintenance records, POH procedures, service bulletins,
          and all other documents for this aircraft.
        </p>
        <Button asChild>
          <Link href={`/ask?aircraft=${aircraft.id}`}>
            <MessageSquare className="mr-2 h-4 w-4" />
            Open Ask — {aircraft.tail_number}
            <ExternalLink className="ml-2 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

// ─── Timeline tab ─────────────────────────────────────────────────────────────

function TimelineTab({ maintenanceEvents }: { maintenanceEvents: MaintenanceEvent[] }) {
  if (maintenanceEvents.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <Wrench className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="font-semibold text-foreground mb-1">No maintenance events</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Maintenance events are automatically extracted when you upload logbooks and work orders.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {maintenanceEvents.map((event, idx) => (
        <div key={event.id} className="flex gap-4">
          {/* Timeline line */}
          <div className="flex flex-col items-center">
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                event.is_verified
                  ? 'bg-emerald-100 text-emerald-600'
                  : 'bg-amber-100 text-amber-600'
              )}
            >
              <Wrench className="h-3.5 w-3.5" />
            </div>
            {idx < maintenanceEvents.length - 1 && (
              <div className="w-px flex-1 bg-border mt-2" />
            )}
          </div>

          {/* Event content */}
          <Card className="flex-1 mb-4">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h4 className="text-sm font-semibold text-foreground">
                  {event.event_type ?? 'Maintenance Event'}
                </h4>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {event.is_verified ? (
                    <Badge variant="success" className="text-xs">Verified</Badge>
                  ) : (
                    <Badge variant="warning" className="text-xs">Unverified</Badge>
                  )}
                </div>
              </div>

              {event.description && (
                <p className="text-sm text-muted-foreground mb-2">{event.description}</p>
              )}

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {event.event_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(event.event_date)}
                  </span>
                )}
                {event.airframe_tt != null && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {event.airframe_tt} hrs airframe
                  </span>
                )}
                {event.mechanic_name && (
                  <span className="flex items-center gap-1">
                    <Wrench className="h-3 w-3" />
                    {event.mechanic_name}
                    {event.mechanic_cert && ` · ${event.mechanic_cert}`}
                  </span>
                )}
                {event.shop_name && <span>{event.shop_name}</span>}
                {event.ad_reference && (
                  <span className="font-mono text-amber-700">AD: {event.ad_reference}</span>
                )}
                {event.sb_reference && (
                  <span className="font-mono text-blue-700">SB: {event.sb_reference}</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  )
}

// ─── Settings tab ─────────────────────────────────────────────────────────────

function SettingsTab({ aircraft }: { aircraft: Aircraft }) {
  // Field rows helper
  const Field = ({ label, value }: { label: string; value?: string | number | null }) => (
    <div className="grid grid-cols-3 gap-4 py-3">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="col-span-2 text-sm text-foreground">
        {value != null && value !== '' ? String(value) : <span className="text-muted-foreground/50">—</span>}
      </dd>
    </div>
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Aircraft Details</CardTitle>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/aircraft/${aircraft.id}/edit`}>
              <Settings className="mr-1 h-3.5 w-3.5" />
              Edit
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border">
            <Field label="Tail number" value={aircraft.tail_number} />
            <Field label="Make" value={aircraft.make} />
            <Field label="Model" value={aircraft.model} />
            <Field label="Year" value={aircraft.year} />
            <Field label="Serial number" value={aircraft.serial_number} />
            <Field label="Base airport" value={aircraft.base_airport} />
            <Field label="Operator" value={aircraft.operator_name} />
            <Field label="Total time (hrs)" value={aircraft.total_time_hours} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Engine</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border">
            <Field label="Engine make" value={aircraft.engine_make} />
            <Field label="Engine model" value={aircraft.engine_model} />
            <Field label="Engine serial" value={aircraft.engine_serial} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Propeller</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border">
            <Field label="Prop make" value={aircraft.prop_make} />
            <Field label="Prop model" value={aircraft.prop_model} />
            <Field label="Prop serial" value={aircraft.prop_serial} />
          </dl>
        </CardContent>
      </Card>

      {(aircraft.avionics_notes || aircraft.notes) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {aircraft.avionics_notes && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Avionics
                </p>
                <p className="text-sm whitespace-pre-wrap">{aircraft.avionics_notes}</p>
              </div>
            )}
            {aircraft.notes && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  General
                </p>
                <p className="text-sm whitespace-pre-wrap">{aircraft.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Danger zone */}
      <Card className="border-destructive/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Archive this aircraft</p>
              <p className="text-xs text-muted-foreground">
                Removes from active fleet. Documents are preserved. Owner/admin only.
              </p>
            </div>
            <Button variant="destructive" size="sm" asChild>
              <Link href={`/aircraft/${aircraft.id}/archive`}>Archive</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AircraftDetailPage({
  params,
}: {
  params: { id: string }
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
      .select('organization_id, role')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single(),
  ])

  const profile = profileRes.data as UserProfile
  if (!profile) redirect('/login')

  const membership = membershipRes.data
  if (!membership) redirect('/onboarding')

  // Fetch aircraft
  const { data: aircraftData, error: aircraftError } = await supabase
    .from('aircraft')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', membership.organization_id)
    .single()

  if (aircraftError || !aircraftData) notFound()

  const aircraft = aircraftData as Aircraft

  // Parallel fetches
  const [documentsRes, maintenanceRes, lastQueryRes] = await Promise.all([
    supabase
      .from('documents')
      .select('*')
      .eq('aircraft_id', params.id)
      .eq('organization_id', membership.organization_id)
      .order('uploaded_at', { ascending: false }),
    supabase
      .from('maintenance_events')
      .select('*')
      .eq('aircraft_id', params.id)
      .eq('organization_id', membership.organization_id)
      .order('event_date', { ascending: false }),
    supabase
      .from('queries')
      .select('created_at')
      .eq('aircraft_id', params.id)
      .eq('organization_id', membership.organization_id)
      .order('created_at', { ascending: false })
      .limit(1),
  ])

  const documents = (documentsRes.data ?? []) as Document[]
  const maintenanceEvents = (maintenanceRes.data ?? []) as MaintenanceEvent[]
  const lastQueryAt = lastQueryRes.data?.[0]?.created_at ?? null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Aircraft', href: '/aircraft' },
          { label: aircraft.tail_number },
        ]}
        actions={
          <Button size="sm" asChild>
            <Link href={`/documents/upload?aircraft=${aircraft.id}`}>
              <Upload className="mr-1 h-4 w-4" />
              Upload
            </Link>
          </Button>
        }
      />

      <main className="flex-1 overflow-y-auto">
        {/* Aircraft header */}
        <div className="px-6 pt-6 pb-4 border-b border-border bg-card">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                <Plane className="h-7 w-7 text-brand-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="font-mono text-3xl font-bold text-foreground tracking-wide">
                  {aircraft.tail_number}
                </h1>
                <p className="text-muted-foreground mt-0.5">
                  {aircraft.make} {aircraft.model}
                  {aircraft.year && ` · ${aircraft.year}`}
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {aircraft.base_airport && (
                    <Badge variant="outline" className="text-xs flex items-center gap-1">
                      <MapPin className="h-2.5 w-2.5" />
                      {aircraft.base_airport}
                    </Badge>
                  )}
                  {aircraft.total_time_hours != null && (
                    <Badge variant="outline" className="text-xs flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {aircraft.total_time_hours.toLocaleString()} hrs TT
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-xs">
                    {documents.length} {documents.length === 1 ? 'document' : 'documents'}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 py-6">
          <div className="max-w-7xl mx-auto">
            <Tabs defaultValue="overview">
              <TabsList className="mb-6">
                <TabsTrigger value="overview" className="flex items-center gap-1.5">
                  <Plane className="h-3.5 w-3.5" />
                  Overview
                </TabsTrigger>
                <TabsTrigger value="documents" className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Documents
                  {documents.length > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs py-0 px-1.5 h-4">
                      {documents.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="ask" className="flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Ask
                </TabsTrigger>
                <TabsTrigger value="timeline" className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Timeline
                  {maintenanceEvents.length > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs py-0 px-1.5 h-4">
                      {maintenanceEvents.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="settings" className="flex items-center gap-1.5">
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview">
                <OverviewTab
                  aircraft={aircraft}
                  documents={documents}
                  maintenanceEvents={maintenanceEvents}
                  lastQueryAt={lastQueryAt}
                />
              </TabsContent>

              <TabsContent value="documents">
                <DocumentsTab aircraft={aircraft} documents={documents} />
              </TabsContent>

              <TabsContent value="ask">
                <AskTab aircraft={aircraft} />
              </TabsContent>

              <TabsContent value="timeline">
                <TimelineTab maintenanceEvents={maintenanceEvents} />
              </TabsContent>

              <TabsContent value="settings">
                <SettingsTab aircraft={aircraft} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  )
}
