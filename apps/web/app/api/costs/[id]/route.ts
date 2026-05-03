/**
 * /api/costs/[id]  (Spec 7.1)
 *
 *   GET    → single cost entry
 *   PATCH  → edit (mechanic+); approve via { approved: true } payload
 *   DELETE → remove (admin/owner only — costs feed P&L)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import type { CostBucket } from '@/lib/costs/categories'

export const dynamic = 'force-dynamic'

const WRITE_ROLES = new Set(['owner', 'admin', 'mechanic', 'pilot'])
const DELETE_ROLES = new Set(['owner', 'admin'])

async function ctx(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return { error: NextResponse.json({ error: 'No org' }, { status: 403 }) }
  return { supabase, user, membership }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const c = await ctx(req)
  if ('error' in c) return c.error
  const { data, error } = await c.supabase
    .from('cost_entries')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', c.membership.organization_id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ entry: data })
}

interface PatchBody {
  category?: string
  bucket?: CostBucket
  vendor_id?: string | null
  aircraft_id?: string | null
  description?: string | null
  amount?: number
  currency?: string
  cost_date?: string
  is_estimate?: boolean
  approved?: boolean
  notes?: string | null
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const c = await ctx(req)
  if ('error' in c) return c.error
  if (!WRITE_ROLES.has(c.membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  let body: PatchBody
  try { body = (await req.json()) as PatchBody } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of [
    'category', 'bucket', 'vendor_id', 'aircraft_id', 'description',
    'currency', 'cost_date', 'notes',
  ] as const) {
    if (k in body) patch[k] = (body as Record<string, unknown>)[k]
  }
  if ('amount' in body) {
    const a = Number(body.amount)
    if (!Number.isFinite(a) || a < 0) return NextResponse.json({ error: 'amount invalid' }, { status: 400 })
    patch.amount = Math.round(a * 100) / 100
  }
  if ('is_estimate' in body) patch.is_estimate = !!body.is_estimate
  if ('approved' in body) patch.approved = !!body.approved
  if (body.cost_date != null && !/^\d{4}-\d{2}-\d{2}$/.test(body.cost_date)) {
    return NextResponse.json({ error: 'cost_date must be YYYY-MM-DD' }, { status: 400 })
  }

  const { data, error } = await c.supabase
    .from('cost_entries')
    .update(patch)
    .eq('id', params.id)
    .eq('organization_id', c.membership.organization_id)
    .select('*')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ entry: data })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const c = await ctx(req)
  if ('error' in c) return c.error
  if (!DELETE_ROLES.has(c.membership.role)) {
    return NextResponse.json({ error: 'Only admin/owner can delete cost entries' }, { status: 403 })
  }
  const { error } = await c.supabase
    .from('cost_entries')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', c.membership.organization_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
