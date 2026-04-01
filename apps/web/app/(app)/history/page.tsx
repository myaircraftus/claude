import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import { HistoryClient } from './history-client'
import type { UserProfile } from '@/types'

export const metadata = { title: 'Query History' }

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: { aircraft?: string; confidence?: string; page?: string; query?: string }
}) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileRes, membershipRes] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', user.id).single(),
    supabase.from('organization_memberships')
      .select('organization_id')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single(),
  ])

  const profile = profileRes.data as UserProfile
  const membership = membershipRes.data
  if (!membership) redirect('/onboarding')

  const orgId = membership.organization_id
  const page = parseInt(searchParams.page ?? '1')
  const pageSize = 25
  const offset = (page - 1) * pageSize

  let query = supabase
    .from('queries')
    .select(`
      id, question, answer, confidence, confidence_score,
      chunks_retrieved, chunks_used, latency_ms,
      is_bookmarked, user_feedback, warning_flags, follow_up_questions,
      created_at, aircraft_id,
      aircraft:aircraft(tail_number, make, model)
    `, { count: 'exact' })
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (searchParams.aircraft) {
    query = query.eq('aircraft_id', searchParams.aircraft)
  }
  if (searchParams.confidence) {
    query = query.eq('confidence', searchParams.confidence)
  }

  const { data: queries, count } = await query

  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model')
    .eq('organization_id', orgId)
    .eq('is_archived', false)

  const totalPages = Math.ceil((count ?? 0) / pageSize)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[{ label: 'History' }]}
      />
      <HistoryClient
        queries={(queries ?? []) as any}
        aircraft={aircraft ?? []}
        totalPages={totalPages}
        currentPage={page}
        selectedQueryId={searchParams.query}
      />
    </div>
  )
}
