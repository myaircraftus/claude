import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Plane,
  FileText,
  MessageSquare,
  HardDrive,
  Plus,
  Upload,
  Clock,
  Wrench,
  Bell,
  AlertTriangle,
} from 'lucide-react'
import { formatBytes, formatDateTime, DOC_TYPE_LABELS, PARSING_STATUS_LABELS } from '@/lib/utils'
import type { UserProfile } from '@/types'

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileRes, membershipRes] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', user.id).single(),
    supabase.from('organization_memberships')
      .select('organization_id, role, organizations(*)')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single(),
  ])

  const profile = profileRes.data as UserProfile
  const membership = membershipRes.data
  if (!membership) redirect('/onboarding')

  const orgId = membership.organization_id
  const org = (membership as any).organizations

  // Parallel data fetch
  const [aircraftRes, documentsRes, queriesRes] = await Promise.all([
    supabase.from('aircraft').select('id, tail_number, make, model, is_archived').eq('organization_id', orgId).eq('is_archived', false),
    supabase.from('documents').select('id, title, doc_type, parsing_status, file_size_bytes, uploaded_at, aircraft_id').eq('organization_id', orgId).order('uploaded_at', { ascending: false }).limit(8),
    supabase.from('queries').select('id, question, confidence, created_at, aircraft_id').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(5),
  ])

  const aircraft = aircraftRes.data ?? []
  const documents = documentsRes.data ?? []
  const queries = queriesRes.data ?? []

  // Calculate storage
  const { data: storageData } = await supabase
    .from('documents')
    .select('file_size_bytes')
    .eq('organization_id', orgId)

  const totalBytes = storageData?.reduce((sum, d) => sum + (d.file_size_bytes ?? 0), 0) ?? 0
  const completedDocs = documents.filter(d => d.parsing_status === 'completed').length

  // Fetch reminders count (gracefully handle missing table)
  let activeRemindersCount = 0
  let overdueRemindersCount = 0
  let dueSoonRemindersCount = 0
  const today = new Date()
  const in30Days = new Date(today)
  in30Days.setDate(today.getDate() + 30)

  try {
    const { data: remindersData } = await supabase
      .from('reminders')
      .select('id, due_date, status')
      .eq('organization_id', orgId)
      .in('status', ['active'])
      .not('due_date', 'is', null)

    if (remindersData) {
      activeRemindersCount = remindersData.length
      for (const r of remindersData) {
        if (!r.due_date) continue
        const due = new Date(r.due_date)
        if (due < today) {
          overdueRemindersCount++
        } else if (due <= in30Days) {
          dueSoonRemindersCount++
        }
      }
    }
  } catch {
    // Table may not exist yet
  }

  // Check AD status — find aircraft with 0 AD records
  let aircraftWithNoADs = 0
  try {
    const { data: adData } = await (supabase as any)
      .from('aircraft_ad_applicability')
      .select('aircraft_id')
      .eq('organization_id', orgId)

    const aircraftWithADs = new Set((adData ?? []).map((r: any) => r.aircraft_id))
    aircraftWithNoADs = aircraft.filter(ac => !aircraftWithADs.has(ac.id)).length
  } catch {
    // Table may not exist yet
  }

  const reminderColor =
    overdueRemindersCount > 0
      ? 'text-red-600'
      : dueSoonRemindersCount > 0
      ? 'text-orange-500'
      : 'text-emerald-600'

  const reminderSubtext =
    overdueRemindersCount > 0
      ? `${overdueRemindersCount} overdue`
      : dueSoonRemindersCount > 0
      ? `${dueSoonRemindersCount} due within 30 days`
      : 'All current'

  const confidenceColors: Record<string, string> = {
    high: 'success',
    medium: 'warning',
    low: 'warning',
    insufficient_evidence: 'danger',
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[{ label: 'Dashboard' }]}
        actions={
          <Button size="sm" asChild>
            <Link href="/documents/upload"><Upload className="h-4 w-4" />Upload</Link>
          </Button>
        }
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Greeting */}
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {getGreeting()}, {profile.full_name?.split(' ')[0] ?? 'Pilot'}
            </h1>
            <p className="text-muted-foreground">{org.name} · {org.plan} plan</p>
          </div>

          {/* AD Compliance Alert Banner */}
          {aircraft.length > 0 && aircraftWithNoADs > 0 && (
            <div className="flex items-start gap-3 p-4 rounded-lg border border-yellow-300 bg-yellow-50 text-yellow-900">
              <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">AD Tracking Available</p>
                <p className="text-sm text-yellow-800 mt-0.5">
                  Sync your aircraft to automatically track applicable Airworthiness Directives.{' '}
                  {aircraftWithNoADs === 1 ? '1 aircraft has' : `${aircraftWithNoADs} aircraft have`} no AD records.
                </p>
              </div>
              <Button size="sm" variant="outline" className="border-yellow-400 text-yellow-900 hover:bg-yellow-100 flex-shrink-0" asChild>
                <Link href="/aircraft">Sync Now</Link>
              </Button>
            </div>
          )}

          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard
              icon={<Plane className="h-5 w-5 text-brand-500" />}
              label="Aircraft"
              value={aircraft.length}
              sub={`of ${org.plan_aircraft_limit} limit`}
            />
            <StatCard
              icon={<FileText className="h-5 w-5 text-emerald-500" />}
              label="Documents"
              value={completedDocs}
              sub="indexed & searchable"
            />
            <StatCard
              icon={<MessageSquare className="h-5 w-5 text-sky-500" />}
              label="Queries this month"
              value={org.queries_used_this_month}
              sub={`of ${org.plan_queries_monthly}`}
            />
            <StatCard
              icon={<HardDrive className="h-5 w-5 text-purple-500" />}
              label="Storage used"
              value={formatBytes(totalBytes)}
              sub={`of ${org.plan_storage_gb} GB`}
            />
            {/* Reminders stat card */}
            <Link href="/reminders" className="block">
              <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Reminders</p>
                      <p className={`text-2xl font-bold mt-1 ${reminderColor}`}>
                        {activeRemindersCount > 0 ? `${activeRemindersCount} Due` : 'None'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{reminderSubtext}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-muted">
                      <Bell className={`h-5 w-5 ${reminderColor}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* Quick ask */}
          <Card>
            <CardContent className="pt-6">
              <Link href="/ask">
                <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-brand-300 hover:border-brand-500 hover:bg-brand-50 transition-colors cursor-pointer">
                  <MessageSquare className="h-5 w-5 text-brand-400" />
                  <span className="text-muted-foreground text-sm">Ask a question about your aircraft records…</span>
                </div>
              </Link>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <div>
            <h2 className="text-base font-semibold text-foreground mb-3">Quick Actions</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <QuickAction
                href="/maintenance/new"
                icon={<Wrench className="h-5 w-5 text-blue-600" />}
                label="New Maintenance Entry"
                color="blue"
              />
              <QuickAction
                href="/documents/upload"
                icon={<Upload className="h-5 w-5 text-emerald-600" />}
                label="Upload Documents"
                color="green"
              />
              <QuickAction
                href="/ask"
                icon={<MessageSquare className="h-5 w-5 text-purple-600" />}
                label="Ask AI"
                color="purple"
              />
              <QuickAction
                href="/reminders"
                icon={<Bell className="h-5 w-5 text-orange-500" />}
                label="Check Reminders"
                color="orange"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent aircraft */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Aircraft</CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/aircraft"><Plus className="h-4 w-4" />Add</Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {aircraft.length === 0 ? (
                  <EmptyState
                    icon={<Plane className="h-8 w-8 text-muted-foreground/40" />}
                    message="No aircraft yet"
                    action={{ label: 'Add aircraft', href: '/aircraft/new' }}
                  />
                ) : (
                  aircraft.map(ac => (
                    <Link key={ac.id} href={`/aircraft/${ac.id}`}>
                      <div className="flex items-center gap-3 p-2 rounded-md hover:bg-accent transition-colors">
                        <div className="w-8 h-8 rounded bg-brand-50 flex items-center justify-center">
                          <Plane className="h-4 w-4 text-brand-500" />
                        </div>
                        <div>
                          <p className="font-mono text-sm font-semibold">{ac.tail_number}</p>
                          <p className="text-xs text-muted-foreground">{ac.make} {ac.model}</p>
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Recent documents */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Recent Documents</CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/documents/upload"><Upload className="h-4 w-4" />Upload</Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {documents.length === 0 ? (
                  <EmptyState
                    icon={<FileText className="h-8 w-8 text-muted-foreground/40" />}
                    message="No documents yet"
                    action={{ label: 'Upload documents', href: '/documents/upload' }}
                  />
                ) : (
                  documents.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-accent cursor-pointer">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.title}</p>
                        <p className="text-xs text-muted-foreground">{DOC_TYPE_LABELS[doc.doc_type]}</p>
                      </div>
                      <ProcessingBadge status={doc.parsing_status} />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent queries */}
          {queries.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Recent Questions</CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/history"><Clock className="h-4 w-4" />View all</Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {queries.map(q => (
                  <Link key={q.id} href={`/history?query=${q.id}`}>
                    <div className="flex items-center gap-3 p-2 rounded-md hover:bg-accent transition-colors">
                      <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm truncate flex-1">{q.question}</span>
                      <Badge variant={confidenceColors[q.confidence] as any} className="flex-shrink-0 text-xs">
                        {q.confidence.replace('_', ' ')}
                      </Badge>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {formatDateTime(q.created_at)}
                      </span>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{sub}</p>
          </div>
          <div className="p-2 rounded-lg bg-muted">{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}

const quickActionColors: Record<string, { bg: string; border: string; hover: string }> = {
  blue: { bg: 'bg-blue-50', border: 'border-blue-200', hover: 'hover:border-blue-400 hover:bg-blue-100' },
  green: { bg: 'bg-emerald-50', border: 'border-emerald-200', hover: 'hover:border-emerald-400 hover:bg-emerald-100' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', hover: 'hover:border-purple-400 hover:bg-purple-100' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', hover: 'hover:border-orange-400 hover:bg-orange-100' },
}

function QuickAction({ href, icon, label, color }: { href: string; icon: React.ReactNode; label: string; color: string }) {
  const c = quickActionColors[color] ?? quickActionColors.blue
  return (
    <Link href={href}>
      <div className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors cursor-pointer text-center ${c.bg} ${c.border} ${c.hover}`}>
        <div className="p-2 rounded-lg bg-white/60">{icon}</div>
        <span className="text-xs font-medium text-foreground leading-tight">{label}</span>
      </div>
    </Link>
  )
}

function EmptyState({ icon, message, action }: { icon: React.ReactNode; message: string; action?: { label: string; href: string } }) {
  return (
    <div className="text-center py-6 space-y-2">
      <div className="flex justify-center">{icon}</div>
      <p className="text-sm text-muted-foreground">{message}</p>
      {action && (
        <Button size="sm" variant="outline" asChild>
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  )
}

function ProcessingBadge({ status }: { status: string }) {
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

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}
