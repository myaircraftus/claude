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
  Shield,
  Bell,
  ClipboardList,
  RefreshCw,
  Plus,
  AlertTriangle,
  HelpCircle,
  XCircle,
  ChevronRight,
} from 'lucide-react'
import {
  formatDate,
  formatDateTime,
  DOC_TYPE_LABELS,
  PARSING_STATUS_LABELS,
  cn,
} from '@/lib/utils'
import type {
  Aircraft,
  Document,
  MaintenanceEvent,
  UserProfile,
  Reminder,
  AircraftADApplicability,
  MaintenanceEntryDraft,
} from '@/types'
import { LiveTrackingSection } from '@/components/aircraft/tracking/LiveTrackingSection'
import { IntelligenceTab } from '@/components/intelligence/IntelligenceTab'
import type { AircraftComputedStatus, RecordFinding, FindingsRun, ReportJob } from '@/types/intelligence'

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

      {/* Live Tracking — feature-flagged, renders nothing when flag is off */}
      <LiveTrackingSection
        aircraftId={aircraft.id}
        registration={aircraft.tail_number}
        enabled={process.env.NEXT_PUBLIC_ENABLE_AIRCRAFT_LIVE_TRACKING === 'true'}
      />
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

// ─── ADs tab ──────────────────────────────────────────────────────────────────

function ADsTab({
  aircraftId,
  adApplicability,
}: {
  aircraftId: string
  adApplicability: AircraftADApplicability[]
}) {
  const compliant = adApplicability.filter(a => a.compliance_status === 'compliant').length
  const overdue = adApplicability.filter(a => a.compliance_status === 'overdue').length
  const unknown = adApplicability.filter(a => a.compliance_status === 'unknown').length
  const notApplicable = adApplicability.filter(
    a => a.applicability_status === 'not_applicable'
  ).length

  const statusIcon = (status: string) => {
    switch (status) {
      case 'compliant':
        return <CheckCircle className="h-4 w-4 text-emerald-500" />
      case 'overdue':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'unknown':
        return <HelpCircle className="h-4 w-4 text-muted-foreground" />
      default:
        return <AlertTriangle className="h-4 w-4 text-amber-500" />
    }
  }

  const statusBadgeVariant = (
    status: string
  ): 'success' | 'danger' | 'warning' | 'secondary' => {
    switch (status) {
      case 'compliant':
        return 'success'
      case 'overdue':
        return 'danger'
      case 'unknown':
        return 'secondary'
      default:
        return 'warning'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">AD Tracking</h2>
          <p className="text-sm text-muted-foreground">
            Airworthiness Directives applicable to this aircraft
          </p>
        </div>
        <Button size="sm" variant="outline" asChild>
          <Link href={`/aircraft/${aircraftId}/ads/sync`}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Sync ADs
          </Link>
        </Button>
      </div>

      {adApplicability.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Shield className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="font-semibold text-foreground mb-1">No ADs loaded yet</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              Click Sync ADs to fetch applicable Airworthiness Directives for this aircraft.
            </p>
            <Button asChild>
              <Link href={`/aircraft/${aircraftId}/ads/sync`}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync ADs now
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Status summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">{compliant}</p>
              <p className="text-xs text-muted-foreground mt-1">Compliant</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{overdue}</p>
              <p className="text-xs text-muted-foreground mt-1">Overdue</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-2xl font-bold text-muted-foreground">{unknown}</p>
              <p className="text-xs text-muted-foreground mt-1">Unknown</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-2xl font-bold text-muted-foreground">{notApplicable}</p>
              <p className="text-xs text-muted-foreground mt-1">Not Applicable</p>
            </div>
          </div>

          {/* AD list */}
          <Card>
            <div className="divide-y divide-border">
              {adApplicability.map(ad => (
                <div
                  key={ad.id}
                  className="flex items-center gap-4 p-4 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-shrink-0">{statusIcon(ad.compliance_status)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono font-medium">{ad.ad_number}</p>
                    {ad.faa_airworthiness_directives?.title && (
                      <p className="text-xs text-muted-foreground truncate">
                        {ad.faa_airworthiness_directives.title}
                      </p>
                    )}
                    {ad.last_compliance_date && (
                      <p className="text-xs text-muted-foreground">
                        Last complied: {formatDate(ad.last_compliance_date)}
                      </p>
                    )}
                    {ad.next_due_date && (
                      <p className="text-xs text-amber-700">
                        Next due: {formatDate(ad.next_due_date)}
                      </p>
                    )}
                  </div>
                  <Badge variant={statusBadgeVariant(ad.compliance_status)} className="text-xs flex-shrink-0">
                    {ad.compliance_status.replace('_', ' ')}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          {/* Full report CTA */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/50">
            <div>
              <p className="text-sm font-medium">View full AD report</p>
              <p className="text-xs text-muted-foreground">
                Detailed compliance history and upcoming due dates
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/aircraft/${aircraftId}/ads`}>
                View report
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </>
      )}

      {/* Auto-sync note */}
      <p className="text-xs text-muted-foreground text-center">
        AD tracking syncs automatically when aircraft details are updated.
      </p>
    </div>
  )
}

// ─── Reminders tab ────────────────────────────────────────────────────────────

const PRIORITY_VARIANT: Record<string, 'danger' | 'warning' | 'secondary' | 'info'> = {
  critical: 'danger',
  high: 'warning',
  normal: 'info',
  low: 'secondary',
}

const REMINDER_TYPE_LABELS: Record<string, string> = {
  annual: 'Annual Inspection',
  '100hr': '100-Hour',
  transponder: 'Transponder',
  elt: 'ELT',
  static_pitot: 'Static/Pitot',
  vor: 'VOR Check',
  ad_compliance: 'AD Compliance',
  ad_due: 'AD Due',
  ad_overdue: 'AD Overdue',
  custom: 'Custom',
}

function RemindersTab({
  aircraftId,
  reminders,
}: {
  aircraftId: string
  reminders: Reminder[]
}) {
  const activeReminders = reminders.filter(r => r.status === 'active')
  const overdueReminders = activeReminders.filter(
    r => r.days_remaining != null && r.days_remaining < 0
  )
  const dueSoonReminders = activeReminders.filter(
    r => r.days_remaining != null && r.days_remaining >= 0 && r.days_remaining <= 30
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Maintenance Reminders</h2>
          <p className="text-sm text-muted-foreground">
            Due items and scheduled maintenance for this aircraft
          </p>
        </div>
        <Button size="sm" asChild>
          <Link href={`/reminders/new?aircraft=${aircraftId}`}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Reminder
          </Link>
        </Button>
      </div>

      {reminders.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Bell className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="font-semibold text-foreground mb-1">No reminders set</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              Add reminders to track annual inspections, 100-hour checks, AD compliance, and
              custom maintenance intervals.
            </p>
            <Button asChild>
              <Link href={`/reminders/new?aircraft=${aircraftId}`}>
                <Plus className="mr-2 h-4 w-4" />
                Add first reminder
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Alert banners */}
          {overdueReminders.length > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
              <XCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-700 font-medium">
                {overdueReminders.length} item{overdueReminders.length > 1 ? 's' : ''} overdue
              </p>
            </div>
          )}
          {dueSoonReminders.length > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-700 font-medium">
                {dueSoonReminders.length} item{dueSoonReminders.length > 1 ? 's' : ''} due within
                30 days
              </p>
            </div>
          )}

          {/* Reminder list */}
          <Card>
            <div className="divide-y divide-border">
              {reminders.map(reminder => (
                <div
                  key={reminder.id}
                  className="flex items-center gap-4 p-4 hover:bg-accent/50 transition-colors"
                >
                  <div
                    className={cn(
                      'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                      reminder.priority === 'critical'
                        ? 'bg-red-100'
                        : reminder.priority === 'high'
                        ? 'bg-amber-100'
                        : 'bg-muted'
                    )}
                  >
                    <Bell
                      className={cn(
                        'h-4 w-4',
                        reminder.priority === 'critical'
                          ? 'text-red-600'
                          : reminder.priority === 'high'
                          ? 'text-amber-600'
                          : 'text-muted-foreground'
                      )}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{reminder.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        {REMINDER_TYPE_LABELS[reminder.reminder_type] ?? reminder.reminder_type}
                      </span>
                      {reminder.due_date && (
                        <>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Due {formatDate(reminder.due_date)}
                          </span>
                        </>
                      )}
                      {reminder.due_hours != null && (
                        <>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Timer className="h-3 w-3" />
                            Due at {reminder.due_hours.toLocaleString()} hrs
                          </span>
                        </>
                      )}
                    </div>
                    {reminder.days_remaining != null && (
                      <p
                        className={cn(
                          'text-xs mt-0.5',
                          reminder.days_remaining < 0
                            ? 'text-red-600 font-medium'
                            : reminder.days_remaining <= 30
                            ? 'text-amber-600 font-medium'
                            : 'text-muted-foreground'
                        )}
                      >
                        {reminder.days_remaining < 0
                          ? `${Math.abs(reminder.days_remaining)} days overdue`
                          : reminder.days_remaining === 0
                          ? 'Due today'
                          : `${reminder.days_remaining} days remaining`}
                      </p>
                    )}
                    {reminder.hours_remaining != null && (
                      <p
                        className={cn(
                          'text-xs mt-0.5',
                          reminder.hours_remaining < 0
                            ? 'text-red-600 font-medium'
                            : reminder.hours_remaining <= 10
                            ? 'text-amber-600 font-medium'
                            : 'text-muted-foreground'
                        )}
                      >
                        {reminder.hours_remaining < 0
                          ? `${Math.abs(reminder.hours_remaining)} hrs overdue`
                          : `${reminder.hours_remaining} hrs remaining`}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={PRIORITY_VARIANT[reminder.priority] ?? 'secondary'}
                    className="text-xs flex-shrink-0"
                  >
                    {reminder.priority}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" asChild>
              <Link href="/reminders">
                View all reminders
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Entries tab ──────────────────────────────────────────────────────────────

const ENTRY_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'secondary' | 'info'> = {
  signed: 'success',
  draft: 'warning',
  pending_review: 'info',
  rejected: 'secondary',
}

const ENTRY_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_review: 'Pending Review',
  signed: 'Signed',
  rejected: 'Rejected',
}

function EntriesTab({
  aircraftId,
  entries,
}: {
  aircraftId: string
  entries: MaintenanceEntryDraft[]
}) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Maintenance Entries</h2>
          <p className="text-sm text-muted-foreground">
            Logbook entry drafts and recent entries for this aircraft
          </p>
        </div>
        <Button size="sm" asChild>
          <Link href={`/maintenance/new?aircraft=${aircraftId}`}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Entry
          </Link>
        </Button>
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="font-semibold text-foreground mb-1">No entries yet</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              Create AI-assisted maintenance logbook entries for this aircraft. Drafts are saved
              automatically until signed.
            </p>
            <Button asChild>
              <Link href={`/maintenance/new?aircraft=${aircraftId}`}>
                <Plus className="mr-2 h-4 w-4" />
                Create first entry
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <div className="divide-y divide-border">
              {entries.map(entry => (
                <Link
                  key={entry.id}
                  href={`/maintenance/${entry.id}`}
                  className="flex items-center gap-4 p-4 hover:bg-accent/50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {entry.title ?? entry.entry_type ?? 'Untitled entry'}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {entry.entry_type && (
                        <span className="text-xs text-muted-foreground">{entry.entry_type}</span>
                      )}
                      {entry.logbook_type && (
                        <>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground capitalize">
                            {entry.logbook_type} logbook
                          </span>
                        </>
                      )}
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(entry.updated_at)}
                      </span>
                    </div>
                  </div>
                  <Badge
                    variant={ENTRY_STATUS_VARIANT[entry.status] ?? 'secondary'}
                    className="text-xs flex-shrink-0"
                  >
                    {ENTRY_STATUS_LABELS[entry.status] ?? entry.status}
                  </Badge>
                </Link>
              ))}
            </div>
          </Card>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/maintenance?aircraft=${aircraftId}`}>
                View all entries
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </>
      )}
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

  // Core parallel fetches
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

  // New tab data — graceful fallback if tables don't exist yet
  let reminders: Reminder[] = []
  let adApplicability: AircraftADApplicability[] = []
  let entries: MaintenanceEntryDraft[] = []

  try {
    const { data } = await supabase
      .from('reminders')
      .select('*')
      .eq('aircraft_id', params.id)
      .eq('organization_id', membership.organization_id)
      .eq('status', 'active')
      .order('due_date', { ascending: true })
      .limit(50)
    reminders = (data ?? []) as Reminder[]
  } catch {}

  try {
    const { data } = await supabase
      .from('aircraft_ad_applicability')
      .select('*, faa_airworthiness_directives(*)')
      .eq('aircraft_id', params.id)
      .order('ad_number', { ascending: true })
      .limit(100)
    adApplicability = (data ?? []) as AircraftADApplicability[]
  } catch {}

  try {
    const { data } = await supabase
      .from('maintenance_entry_drafts')
      .select('*')
      .eq('aircraft_id', params.id)
      .eq('organization_id', membership.organization_id)
      .order('updated_at', { ascending: false })
      .limit(20)
    entries = (data ?? []) as MaintenanceEntryDraft[]
  } catch {}

  // Intelligence tab data — graceful fallback if tables don't exist yet
  let computedStatus: AircraftComputedStatus | null = null
  let intelligenceFindings: RecordFinding[] = []
  let intelligenceRun: FindingsRun | null = null
  let reportJobs: ReportJob[] = []

  try {
    const { data } = await supabase
      .from('aircraft_computed_status')
      .select('*')
      .eq('aircraft_id', params.id)
      .single()
    computedStatus = data as AircraftComputedStatus | null
  } catch {}

  try {
    const { data: latestRun } = await supabase
      .from('findings_runs')
      .select('*')
      .eq('aircraft_id', params.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    intelligenceRun = latestRun as FindingsRun | null

    if (latestRun) {
      const { data: findingsData } = await supabase
        .from('record_findings')
        .select('*')
        .eq('findings_run_id', latestRun.id)
        .eq('is_resolved', false)
        .order('severity')
      intelligenceFindings = (findingsData ?? []) as RecordFinding[]
    }
  } catch {}

  try {
    const { data } = await supabase
      .from('report_jobs')
      .select('*')
      .eq('aircraft_id', params.id)
      .order('created_at', { ascending: false })
      .limit(20)
    reportJobs = (data ?? []) as ReportJob[]
  } catch {}

  const overdueADs = adApplicability.filter(a => a.compliance_status === 'overdue').length
  const activeRemindersCount = reminders.length
  const draftEntriesCount = entries.filter(e => e.status === 'draft').length

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
                  {overdueADs > 0 && (
                    <Badge variant="danger" className="text-xs flex items-center gap-1">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      {overdueADs} AD{overdueADs > 1 ? 's' : ''} overdue
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 py-6">
          <div className="max-w-7xl mx-auto">
            <Tabs defaultValue="overview">
              <TabsList className="mb-6 flex-wrap h-auto gap-1">
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
                <TabsTrigger value="ads" className="flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  ADs
                  {overdueADs > 0 && (
                    <Badge variant="danger" className="ml-1 text-xs py-0 px-1.5 h-4">
                      {overdueADs}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="reminders" className="flex items-center gap-1.5">
                  <Bell className="h-3.5 w-3.5" />
                  Reminders
                  {activeRemindersCount > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs py-0 px-1.5 h-4">
                      {activeRemindersCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="entries" className="flex items-center gap-1.5">
                  <ClipboardList className="h-3.5 w-3.5" />
                  Entries
                  {draftEntriesCount > 0 && (
                    <Badge variant="warning" className="ml-1 text-xs py-0 px-1.5 h-4">
                      {draftEntriesCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="intelligence" className="flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  Intelligence
                  {computedStatus && computedStatus.health_score < 70 && (
                    <Badge variant="warning" className="ml-1 text-xs py-0 px-1.5 h-4">
                      {computedStatus.health_score}
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

              <TabsContent value="ads">
                <ADsTab aircraftId={aircraft.id} adApplicability={adApplicability} />
              </TabsContent>

              <TabsContent value="reminders">
                <RemindersTab aircraftId={aircraft.id} reminders={reminders} />
              </TabsContent>

              <TabsContent value="entries">
                <EntriesTab aircraftId={aircraft.id} entries={entries} />
              </TabsContent>

              <TabsContent value="intelligence">
                <IntelligenceTab
                  aircraftId={aircraft.id}
                  initialStatus={computedStatus}
                  initialFindings={intelligenceFindings}
                  initialRun={intelligenceRun}
                  initialReports={reportJobs}
                />
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
