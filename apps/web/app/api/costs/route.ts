/**
 * /api/costs  (Spec 7.1)
 *
 *   GET   → list cost_entries for the org. Filter via ?aircraft_id=&category=&from=&to=&approved=
 *   POST  → manual cost entry (mechanic+/pilot). Defaults source=manual,
 *           source_priority=4, approved=true.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { DEFAULT_BUCKET, type CostCategory, type CostBucket } from '@/lib/costs/categories'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'mechanic', 'pilot'])

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
  const aircraftId = sp.get('aircraft_id')
  const category = sp.get('category')
  const from = sp.get('from')
  const to = sp.get('to')
  const approvedParam = sp.get('approved')
  const limit = Math.min(500, Math.max(1, parseInt(sp.get('limit') ?? '200', 10)))

  let q = supabase
    .from('cost_entries')
    .select('*')
    .eq('organization_id', membership.organization_id)
    // Spec polish.cross-rollout — exclude soft-deleted rows.
    .is('deleted_at', null)
    .order('cost_date', { ascending: false })
    .limit(limit)
  if (aircraftId) q = q.eq('aircraft_id', aircraftId)
  if (category) q = q.eq('category', category)
  if (from) q = q.gte('cost_date', from)
  if (to) q = q.lte('cost_date', to)
  if (approvedParam === '1') q = q.eq('approved', true)
  if (approvedParam === '0') q = q.eq('approved', false)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entries: data ?? [] })
}

interface CreateBody {
  aircraft_id?: string | null
  category?: string
  bucket?: CostBucket
  vendor_id?: string | null
  description?: string | null
  amount?: number
  currency?: string
  cost_date?: string
  is_estimate?: boolean
  notes?: string | null
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
  if (!ALLOWED_ROLES.has(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let body: CreateBody
  try { body = (await req.json()) as CreateBody } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const category = (body.category ?? '').toString().trim()
  if (!category) return NextResponse.json({ error: 'category required' }, { status: 400 })

  const amount = Number(body.amount)
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: 'amount must be a non-negative number' }, { status: 400 })
  }

  const cost_date = (body.cost_date ?? '').toString().trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cost_date)) {
    return NextResponse.json({ error: 'cost_date must be YYYY-MM-DD' }, { status: 400 })
  }

  const bucket = body.bucket ?? DEFAULT_BUCKET[category as CostCategory] ?? 'one_time'

  const { data, error } = await supabase
    .from('cost_entries')
    .insert({
      organization_id: membership.organization_id,
      aircraft_id: body.aircraft_id ?? null,
      category,
      bucket,
      vendor_id: body.vendor_id ?? null,
      description: body.description ?? null,
      amount: Math.round(amount * 100) / 100,
      currency: body.currency || 'USD',
      cost_date,
      is_estimate: !!body.is_estimate,
      source: 'manual',
      source_priority: 4,
      approved: true,
      notes: body.notes ?? null,
      created_by: user.id,
    })
    .select('*')
    .single()
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })
  }
  return NextResponse.json({ entry: data }, { status: 201 })
}
