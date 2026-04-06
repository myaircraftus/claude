import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import {
  Plane,
  FileText,
  AlertTriangle,
  Clock,
  ArrowRight,
  MessageSquare,
  Upload,
  Eye,
  Sparkles,
  Wrench,
  Bell,
} from 'lucide-react'
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

  // Parallel data fetch
  const [aircraftRes, documentsRes] = await Promise.all([
    supabase.from('aircraft').select('id, tail_number, make, model, is_archived').eq('organization_id', orgId).eq('is_archived', false),
    supabase.from('documents').select('id, parsing_status').eq('organization_id', orgId),
  ])

  const aircraft = aircraftRes.data ?? []
  const documents = documentsRes.data ?? []
  const indexedDocs = documents.filter(d => d.parsing_status === 'completed').length

  // Fetch reminders count
  let activeRemindersCount = 0
  try {
    const { count } = await supabase
      .from('reminders')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .in('status', ['active'])
      .not('due_date', 'is', null)
    activeRemindersCount = count ?? 0
  } catch {}

  // Open squawks / overdue ADs
  let openSquawks = 0
  try {
    const { count } = await (supabase as any)
      .from('aircraft_ad_applicability')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('compliance_status', 'overdue')
    openSquawks = count ?? 0
  } catch {}

  const stats = [
    { label: 'Aircraft', value: aircraft.length > 0 ? String(aircraft.length) : '—', icon: Plane, iconBg: 'bg-[#0c2d6b]/10', iconColor: 'text-[#0c2d6b]' },
    { label: 'Documents Indexed', value: indexedDocs > 0 ? String(indexedDocs) : '—', icon: FileText, iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
    { label: 'Upcoming Reminders', value: activeRemindersCount > 0 ? String(activeRemindersCount) : '—', icon: Clock, iconBg: 'bg-amber-50', iconColor: 'text-amber-600' },
    { label: 'Open Squawks', value: openSquawks > 0 ? String(openSquawks) : '—', icon: AlertTriangle, iconBg: 'bg-red-50', iconColor: 'text-red-600' },
  ]

  const quickActions = [
    { icon: Upload, label: 'Upload Documents', href: '/documents/upload' },
    { icon: MessageSquare, label: 'Ask Your Aircraft', href: '/ask' },
    { icon: Wrench, label: 'Generate Entry', href: '/maintenance' },
    { icon: Eye, label: 'Review Queue', href: '/documents/review' },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[{ label: 'Dashboard' }]}
      />

      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-[22px] tracking-tight text-[#0f172a] font-bold">Operations Overview</h1>
              <p className="text-[13px] text-[#64748b]">Welcome back. Here&apos;s your fleet status.</p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/workspace"
                className="inline-flex items-center gap-2 text-white px-4 py-2 rounded-lg text-[13px] transition-colors font-medium"
                style={{ background: '#0c2d6b' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                <Sparkles className="w-4 h-4" /> Open Workspace
              </Link>
              <Link
                href="/ask"
                className="inline-flex items-center gap-2 text-[#0f172a] px-4 py-2 rounded-lg text-[13px] hover:bg-[#f1f3f8] transition-colors font-medium"
                style={{ border: '1px solid rgba(15,23,42,0.08)' }}
              >
                <MessageSquare className="w-4 h-4" /> Ask Your Aircraft
              </Link>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {stats.map((s) => (
              <div
                key={s.label}
                className="bg-white rounded-xl p-4"
                style={{ border: '1px solid rgba(15,23,42,0.08)' }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-9 h-9 rounded-lg ${s.iconBg} ${s.iconColor} flex items-center justify-center`}>
                    <s.icon className="w-[18px] h-[18px]" />
                  </div>
                </div>
                <div className="text-[24px] text-[#0f172a] tracking-tight font-bold">{s.value}</div>
                <div className="text-[12px] text-[#64748b] font-medium">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Fleet */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[15px] text-[#0f172a] font-semibold">Fleet Status</h2>
                <Link href="/aircraft" className="text-[12px] text-[#0c2d6b] flex items-center gap-1 font-medium hover:underline">
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              {aircraft.length === 0 ? (
                <div
                  className="bg-white rounded-xl p-8 text-center"
                  style={{ border: '1px solid rgba(15,23,42,0.08)' }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
                    style={{ background: 'rgba(12,45,107,0.08)' }}
                  >
                    <Plane className="w-6 h-6 text-[#0c2d6b]" />
                  </div>
                  <p className="text-[14px] text-[#0f172a] font-medium mb-1">No aircraft yet</p>
                  <p className="text-[13px] text-[#64748b] mb-4">Add your first aircraft to get started.</p>
                  <Link
                    href="/aircraft/new"
                    className="inline-flex items-center gap-2 text-white px-4 py-2 rounded-lg text-[13px] transition-colors font-medium"
                    style={{ background: '#0c2d6b' }}
                  >
                    Add Aircraft
                  </Link>
                </div>
              ) : (
                <div
                  className="bg-white rounded-xl divide-y divide-[rgba(15,23,42,0.06)]"
                  style={{ border: '1px solid rgba(15,23,42,0.08)' }}
                >
                  {aircraft.map(ac => (
                    <Link
                      key={ac.id}
                      href={`/aircraft/${ac.id}`}
                      className="flex items-center gap-4 p-4 hover:bg-[#f1f3f8]/30 transition-colors first:rounded-t-xl last:rounded-b-xl"
                    >
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: 'rgba(12,45,107,0.08)' }}
                      >
                        <Plane className="w-5 h-5 text-[#0c2d6b]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-[14px] font-bold text-[#0f172a]">{ac.tail_number}</p>
                        <p className="text-[12px] text-[#64748b]">{ac.make} {ac.model}</p>
                      </div>
                      <span
                        className="text-[11px] font-medium text-emerald-700 px-2 py-0.5 rounded-full"
                        style={{ background: '#ecfdf5' }}
                      >
                        Airworthy
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div>
              <h2 className="text-[15px] text-[#0f172a] font-semibold mb-3">Quick Actions</h2>
              <div className="space-y-2">
                {quickActions.map((a) => (
                  <Link
                    key={a.label}
                    href={a.href}
                    className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 hover:bg-[#f1f3f8]/30 transition-colors"
                    style={{ border: '1px solid rgba(15,23,42,0.08)' }}
                  >
                    <a.icon className="w-4 h-4 text-[#0c2d6b]" />
                    <span className="text-[13px] text-[#0f172a] font-medium">{a.label}</span>
                  </Link>
                ))}
              </div>

              {/* Reminders callout */}
              {activeRemindersCount > 0 && (
                <Link
                  href="/reminders"
                  className="mt-4 flex items-center gap-3 rounded-xl px-4 py-3 transition-colors"
                  style={{ background: '#fffbeb', border: '1px solid #fde68a' }}
                >
                  <Bell className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    <p className="text-[13px] text-amber-800 font-medium">{activeRemindersCount} active reminder{activeRemindersCount !== 1 ? 's' : ''}</p>
                    <p className="text-[11px] text-amber-600">View and manage reminders</p>
                  </div>
                </Link>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
