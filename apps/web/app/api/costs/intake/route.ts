/**
 * GET /api/costs/intake (Spec 7.2)
 *
 * Lists intake_documents for the operator's queue. Defaults to
 * non-terminal statuses (received / extracting / extracted / review).
 * Filter via ?status=received|extracting|extracted|review|posted|rejected.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const TERMINAL = new Set(['posted', 'rejected'])
const ALL_STATUSES = ['received', 'extracting', 'extracted', 'review', 'posted', 'rejected']

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })

  const sp = new URL(req.url).searchParams
  const statusFilter = sp.get('status')
  const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '100', 10)))

  let q = supabase
    .from('intake_documents')
    .select('*')
    .eq('organization_id', membership.organization_id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (statusFilter && ALL_STATUSES.includes(statusFilter)) {
    q = q.eq('status', statusFilter)
  } else {
    // Default: non-terminal only.
    q = q.not('status', 'in', `(${[...TERMINAL].map((s) => `"${s}"`).join(',')})`)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ intake: data ?? [] })
}
