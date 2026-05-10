/**
 * /api/costs/[id]  (Spec 7.1)
 *
 *   GET    → single cost entry
 *   PATCH  → edit (mechanic+); approve via { approved: true } payload
 *   DELETE → remove (admin/owner only — costs feed P&L)
 *
 * Phase 15.5 Task 4 — closed the security-audit §5.4 zod gap on the
 * PATCH body. Every field is now zod-validated AND the route only
 * writes columns the caller explicitly sent (omitted vs null vs value
 * are three distinct states; the previous `'X' in body` check had the
 * same intent but no input validation). Uses lib/validation/common.ts
 * parsePatchBody helper.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  parsePatchBody,
  safeShortStr,
  safeStrOptional,
  safeUuidOptional,
} from '@/lib/validation/common'
import type { CostBucket } from '@/lib/costs/categories'

// Mirror of `CostBucket` so we can use z.enum() — keeping it inline
// avoids touching lib/costs/categories.ts (not in this task's scope).
const COST_BUCKETS = [
  'variable_per_hour',
  'scheduled_per_hour',
  'annual_fixed',
  'monthly_fixed',
  'one_time',
  'loan',
  'depreciation',
] as const satisfies readonly CostBucket[]

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

// PATCH body — every field optional; null is preserved; omission means
// "don't touch the column". Schema is the security boundary; the
// parsePatchBody helper retains the set of explicitly-sent keys so we
// don't blow away unsent fields.
const PatchBody = z.object({
  category:    safeShortStr.optional(),
  bucket:      z.enum(COST_BUCKETS).optional(),
  vendor_id:   safeUuidOptional.nullable(),
  aircraft_id: safeUuidOptional.nullable(),
  description: safeStrOptional.nullable(),
  amount:      z.number().finite().min(0).max(100_000_000).optional(),
  currency:    z.string().length(3).regex(/^[A-Z]{3}$/).optional(),
  cost_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'cost_date must be YYYY-MM-DD').optional(),
  is_estimate: z.boolean().optional(),
  approved:    z.boolean().optional(),
  notes:       safeStrOptional.nullable(),
}).strict()

const PATCH_FIELDS: ReadonlyArray<keyof z.infer<typeof PatchBody>> = [
  'category', 'bucket', 'vendor_id', 'aircraft_id', 'description',
  'amount', 'currency', 'cost_date', 'is_estimate', 'approved', 'notes',
] as const

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const c = await ctx(req)
  if ('error' in c) return c.error
  if (!WRITE_ROLES.has(c.membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const parsed = await parsePatchBody(req, PatchBody)
  if (!parsed.ok) return parsed.response
  const { data: body, keys } = parsed

  // Empty body → no-op. Return the current row so callers can still
  // refresh their state without a follow-up GET.
  if (keys.size === 0) {
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

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of PATCH_FIELDS) {
    if (!keys.has(k)) continue
    if (k === 'amount') {
      // amount has already been validated by zod; just round to 2 decimals.
      patch.amount = body.amount === undefined ? null : Math.round(body.amount * 100) / 100
    } else {
      patch[k] = (body as Record<string, unknown>)[k]
    }
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
  // Spec polish.cross-rollout — soft-delete via deleted_at; trash + 30d purge.
  const { error } = await c.supabase
    .from('cost_entries')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('organization_id', c.membership.organization_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, soft: true })
}
