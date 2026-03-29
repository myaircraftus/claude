import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plane, FileText, MessageSquare, HardDrive, Plus, Upload, Clock } from 'lucide-react'
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

          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
