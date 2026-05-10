/**
 * /admin/customer-signals — Phase 16 Sprint 16.9
 *
 * Lists churn_signals with severity, type, and last-detected. Per-row
 * link drills into the org. Surfaces the trailing-30d feedback buckets
 * for context.
 */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Topbar } from '@/components/shared/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import type { UserProfile } from '@/types'

export const metadata = { title: 'Admin — Customer signals' }
export const dynamic = 'force-dynamic'

const SEVERITY_TINT: Record<string, string> = {
  P0: 'bg-red-100 text-red-900 border-red-300',
  P1: 'bg-orange-100 text-orange-900 border-orange-300',
  P2: 'bg-amber-100 text-amber-900 border-amber-300',
  P3: 'bg-slate-100 text-slate-700 border-slate-300',
}

function fmtAge(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 60) return `${m}m ago`
  if (m < 60 * 24) return `${Math.round(m / 60)}h ago`
  return `${Math.round(m / (60 * 24))}d ago`
}

interface ChurnSignalRow {
  id: string
  organization_id: string
  signal_type: string
  severity: string
  summary: string
  metadata: Record<string, unknown>
  detected_at: string
  organizations: { name?: string; slug?: string } | { name?: string; slug?: string }[] | null
}

interface FeedbackBucket { sentiment: string; n: number }

export default async function CustomerSignalsPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profileRow } = await supabase.from('user_profiles').select('*').eq('id', user.id).single()
  if (!profileRow) redirect('/login')
  const profile = profileRow as UserProfile
  if (!profile.is_platform_admin) redirect('/dashboard')

  const service = createServiceSupabase()

  const [{ data: signalsRaw }, { data: feedbackRaw }] = await Promise.all([
    service
      .from('churn_signals')
      .select('id, organization_id, signal_type, severity, summary, metadata, detected_at, organizations(name, slug)')
      .eq('status', 'open')
      // Phase 17 Sprint 17.6 — exclude the system-org sentinel.
      .neq('organization_id', '00000000-0000-0000-0000-000000000000')
      .order('severity', { ascending: true })
      .order('detected_at', { ascending: false })
      .limit(100),
    service
      .from('feedback_items')
      .select('sentiment')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString()),
  ])

  const signals = (signalsRaw ?? []) as unknown as ChurnSignalRow[]
  const fbCounts: Record<string, number> = { positive: 0, neutral: 0, negative: 0 }
  for (const r of (feedbackRaw ?? []) as Array<{ sentiment: string }>) {
    fbCounts[r.sentiment] = (fbCounts[r.sentiment] ?? 0) + 1
  }
  const fbTotal = Object.values(fbCounts).reduce((a, b) => a + b, 0)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'Customer signals' },
      ]} />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl tracking-tight" style={{ fontWeight: 700 }}>Customer signals</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Open churn signals + 30d feedback sentiment.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <FeedbackCard label="Positive" n={fbCounts.positive ?? 0} total={fbTotal} accent="emerald" />
            <FeedbackCard label="Neutral" n={fbCounts.neutral ?? 0} total={fbTotal} accent="slate" />
            <FeedbackCard label="Negative" n={fbCounts.negative ?? 0} total={fbTotal} accent="rose" />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Open churn signals ({signals.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {signals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open churn signals.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {signals.map((s) => {
                    const orgInfo = Array.isArray(s.organizations) ? s.organizations[0] : s.organizations
                    return (
                      <li key={s.id} className="py-3 flex items-start gap-3">
                        <span className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-mono ${SEVERITY_TINT[s.severity] ?? ''}`}>
                          {s.severity}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm" style={{ fontWeight: 500 }}>{s.summary}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.signal_type.replace(/_/g, ' ')} ·{' '}
                            {orgInfo?.slug ? <Link href={`/${orgInfo.slug}/dashboard`} className="text-primary hover:underline">{orgInfo.name ?? orgInfo.slug}</Link> : 'unknown org'}
                            {' · '}{fmtAge(s.detected_at)}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

function FeedbackCard({ label, n, total, accent }: { label: string; n: number; total: number; accent: 'emerald' | 'slate' | 'rose' }) {
  const tint =
    accent === 'emerald' ? 'border-emerald-200 bg-emerald-50' :
    accent === 'rose' ? 'border-rose-200 bg-rose-50' :
    'border-slate-200 bg-slate-50'
  return (
    <div className={`rounded-lg border ${tint} p-4`}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label} (30d)</p>
      <p className="text-3xl font-mono mt-1">{n}</p>
      <p className="text-xs text-muted-foreground">{total > 0 ? `${Math.round((n / total) * 100)}%` : '—'} of total</p>
    </div>
  )
}
