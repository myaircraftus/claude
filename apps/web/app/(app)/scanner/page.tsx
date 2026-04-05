import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import { cn, formatDate } from '@/lib/utils'
import { ScanLine, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'
import type { UserProfile } from '@/types'
import { NewBatchButton } from './components/new-batch-button'

export const metadata = { title: 'Scanner' }

const STATUS_COLOR: Record<string, string> = {
  capturing: 'bg-blue-50 text-blue-700 border-blue-200',
  submitted: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  uploading: 'bg-sky-50 text-sky-700 border-sky-200',
  assembled: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  processing: 'bg-amber-50 text-amber-700 border-amber-200',
  review: 'bg-orange-50 text-orange-700 border-orange-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  abandoned: 'bg-slate-50 text-slate-500 border-slate-200',
}

export default async function ScannerPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
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
  if (!profile || !membershipRes.data) redirect('/login')

  const orgId = membershipRes.data.organization_id

  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model')
    .eq('organization_id', orgId)
    .eq('is_archived', false)
    .order('tail_number')

  const { data: batches } = await supabase
    .from('scan_batches')
    .select(`
      id, title, batch_type, source_mode, status, page_count,
      submitted_at, created_at, updated_at, aircraft_id,
      aircraft:aircraft_id (id, tail_number)
    `)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(50)

  const stats = {
    capturing: batches?.filter(b => b.status === 'capturing').length ?? 0,
    processing: batches?.filter(b => ['submitted','uploading','assembled','processing'].includes(b.status)).length ?? 0,
    completed: batches?.filter(b => b.status === 'completed').length ?? 0,
    review: batches?.filter(b => b.status === 'review').length ?? 0,
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[{ label: 'Scanner' }]}
        actions={<NewBatchButton aircraft={(aircraft ?? []) as any} />}
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Scanner</h1>
            <p className="text-muted-foreground text-sm">Capture logbooks, work orders, and evidence from your phone or tablet.</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Capturing', value: stats.capturing, Icon: ScanLine, bg: 'bg-blue-50', color: 'text-blue-600' },
              { label: 'Processing', value: stats.processing, Icon: Clock, bg: 'bg-amber-50', color: 'text-amber-600' },
              { label: 'Completed', value: stats.completed, Icon: CheckCircle2, bg: 'bg-emerald-50', color: 'text-emerald-600' },
              { label: 'Needs Review', value: stats.review, Icon: AlertTriangle, bg: 'bg-orange-50', color: 'text-orange-600' },
            ].map(s => {
              const I = s.Icon
              return (
                <div key={s.label} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
                  <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', s.bg)}>
                    <I className={cn('h-4 w-4', s.color)} />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-foreground leading-none">{s.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Batches */}
          {(!batches || batches.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-20 rounded-xl border border-dashed border-border text-center">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
                <ScanLine className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">No scan batches yet</p>
              <p className="text-xs text-muted-foreground mt-1">Start a new batch to capture logbook pages or evidence photos.</p>
              <div className="mt-4">
                <NewBatchButton aircraft={(aircraft ?? []) as any} />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Title</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Aircraft</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Pages</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-card">
                    {(batches as any[]).map(b => (
                      <tr key={b.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/scanner/${b.id}`} className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline">
                            {b.title ?? `Batch ${b.id.slice(0, 8)}`}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          {b.aircraft ? <span className="text-xs font-mono">{b.aircraft.tail_number}</span> : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-foreground capitalize">{b.batch_type.replace(/_/g, ' ')}</td>
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border', STATUS_COLOR[b.status] ?? STATUS_COLOR.capturing)}>
                            {b.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs tabular-nums">{b.page_count}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(b.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
