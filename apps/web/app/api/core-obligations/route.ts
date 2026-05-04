/**
 * /api/core-obligations  (Spec 3.2)
 *
 *   GET  ?status= ?work_order_id= → org-scoped list (default: all statuses)
 *   POST → create new core obligation (mechanic+)
 *
 * Status auto-flips to 'overdue' is the responsibility of a future cron;
 * today the API does no implicit status transition on read.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import type { CoreObligation, CoreObligationStatus } from '@/types'

export const dynamic = 'force-dynamic'

const VALID_STATUS = new Set<CoreObligationStatus>(['pending', 'received', 'overdue', 'waived'])
const WRITE_ROLES = new Set(['owner', 'admin', 'mechanic'])

interface CreateBody {
  work_order_id?: string | null
  customer_id?: string | null
  part_number?: string
  description?: string | null
  core_charge?: number
  due_date?: string | null
  status?: CoreObligationStatus
  notes?: string | null
}

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

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const woId = url.searchParams.get('work_order_id')

  let q = supabase
    .from('core_obligations')
    .select('*')
    .eq('organization_id', membership.organization_id)
    // Spec polish.cross-rollout — exclude soft-deleted rows.
    .is('deleted_at', null)
  if (status && VALID_STATUS.has(status as CoreObligationStatus)) q = q.eq('status', status)
  if (woId) q = q.eq('work_order_id', woId)

  const { data, error } = await q.order('due_date', { ascending: true, nullsFirst: false }).limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ obligations: (data as CoreObligation[]) ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })
  if (!WRITE_ROLES.has(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let body: CreateBody
  try { body = (await req.json()) as CreateBody } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.part_number) return NextResponse.json({ error: 'part_number required' }, { status: 400 })
  if (body.status && !VALID_STATUS.has(body.status)) return NextResponse.json({ error: 'invalid status' }, { status: 400 })

  const { data, error } = await supabase
    .from('core_obligations')
    .insert({
      organization_id: membership.organization_id,
      work_order_id: body.work_order_id ?? null,
      customer_id: body.customer_id ?? null,
      part_number: body.part_number,
      description: body.description ?? null,
      core_charge: typeof body.core_charge === 'number' ? body.core_charge : 0,
      due_date: body.due_date ?? null,
      status: body.status ?? 'pending',
      notes: body.notes ?? null,
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ obligation: data as CoreObligation }, { status: 201 })
}
