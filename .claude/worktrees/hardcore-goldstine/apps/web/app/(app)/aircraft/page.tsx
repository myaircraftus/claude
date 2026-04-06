import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import { Plane, Plus, FileText, Clock, Wrench } from 'lucide-react'
import type { Aircraft, UserProfile } from '@/types'

export const metadata = { title: 'Aircraft' }

function AircraftCard({
  aircraft,
  documentCount,
}: {
  aircraft: Aircraft
  documentCount: number
}) {
  return (
    <Link href={`/aircraft/${aircraft.id}`}>
      <div
        className="bg-white rounded-xl p-5 hover:shadow-md transition-all cursor-pointer group"
        style={{ border: '1px solid rgba(15,23,42,0.08)' }}
      >
        {/* Header row */}
        <div className="flex items-start justify-between mb-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 group-hover:opacity-90 transition-opacity"
            style={{ background: 'rgba(12,45,107,0.08)' }}
          >
            <Plane className="w-6 h-6 text-[#0c2d6b]" />
          </div>
          <span
            className="text-[11px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: '#ecfdf5', color: '#065f46' }}
          >
            Airworthy
          </span>
        </div>

        {/* Identity */}
        <p className="font-mono text-[20px] font-bold text-[#0f172a] tracking-wide">
          {aircraft.tail_number}
        </p>
        <p className="text-[13px] text-[#0f172a] font-medium mt-0.5">
          {[aircraft.year, aircraft.make, aircraft.model].filter(Boolean).join(' ')}
        </p>
        {aircraft.serial_number && (
          <p className="text-[11px] text-[#64748b] mt-0.5">S/N: {aircraft.serial_number}</p>
        )}

        {/* Stats grid */}
        <div
          className="mt-4 pt-4 grid grid-cols-2 gap-x-4 gap-y-2"
          style={{ borderTop: '1px solid rgba(15,23,42,0.06)' }}
        >
          {aircraft.engine_make && (
            <div>
              <p className="text-[10px] text-[#64748b] uppercase tracking-wider font-semibold">Engine</p>
              <p className="text-[12px] text-[#0f172a] font-medium truncate">
                {aircraft.engine_make} {aircraft.engine_model}
              </p>
            </div>
          )}
          {aircraft.total_time_hours != null && (
            <div>
              <p className="text-[10px] text-[#64748b] uppercase tracking-wider font-semibold">TTAF</p>
              <p className="text-[12px] text-[#0f172a] font-medium">
                {aircraft.total_time_hours.toLocaleString()} hrs
              </p>
            </div>
          )}
          <div>
            <p className="text-[10px] text-[#64748b] uppercase tracking-wider font-semibold">Documents</p>
            <p className="text-[12px] text-[#0f172a] font-medium flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {documentCount}
            </p>
          </div>
          {aircraft.base_airport && (
            <div>
              <p className="text-[10px] text-[#64748b] uppercase tracking-wider font-semibold">Base</p>
              <p className="text-[12px] text-[#0f172a] font-medium">{aircraft.base_airport}</p>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

function EmptyState() {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: 'rgba(12,45,107,0.08)' }}
      >
        <Plane className="w-8 h-8 text-[#0c2d6b]" style={{ opacity: 0.4 }} />
      </div>
      <h3 className="text-[16px] font-semibold text-[#0f172a] mb-1">No aircraft yet</h3>
      <p className="text-[13px] text-[#64748b] mb-6 max-w-xs">
        Add your first aircraft to start organizing documents and maintenance records.
      </p>
      <Link
        href="/aircraft/new"
        className="inline-flex items-center gap-2 text-white px-4 py-2 rounded-lg text-[13px] font-medium transition-colors"
        style={{ background: '#0c2d6b' }}
      >
        <Plus className="w-4 h-4" />
        Add aircraft
      </Link>
    </div>
  )
}

export default async function AircraftPage() {
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

  // Fetch document counts
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
          <Link
            href="/aircraft/new"
            className="inline-flex items-center gap-2 text-white px-4 py-2 rounded-lg text-[13px] font-medium transition-colors"
            style={{ background: '#0c2d6b' }}
          >
            <Plus className="w-4 h-4" />
            Add Aircraft
          </Link>
        }
      />

      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-[22px] font-bold text-[#0f172a] tracking-tight">Aircraft</h1>
            <p className="text-[13px] text-[#64748b] mt-0.5">
              {aircraft.length} {aircraft.length === 1 ? 'aircraft' : 'aircraft'} in your portfolio
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
