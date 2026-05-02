/**
 * /api/ai/inbox/[id] (Spec 0.3) — per-card lifecycle.
 *
 * DELETE → mark dismissed (`dismissed_at = now()`). Cards aren't actually
 *           deleted — kept for audit + dedupe accounting.
 * PATCH  → mark resolved (`resolved_at = now()`). Used when a suggested
 *           action was taken so the dedupe key frees up.
 *
 * RLS already restricts access to the user's org, so we don't re-check
 * membership here — just enforce that the card actually belongs to the
 * user's active org.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('ai_action_cards')
    .update({ dismissed_at: new Date().toISOString(), acted_by: ctx.user.id })
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .is('dismissed_at', null)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { action?: 'resolve' | 'dismiss' }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const stamp = new Date().toISOString()
  const update: Record<string, unknown> = { acted_by: ctx.user.id }
  if (body.action === 'resolve') update.resolved_at = stamp
  else if (body.action === 'dismiss') update.dismissed_at = stamp
  else {
    return NextResponse.json(
      { error: "action must be 'resolve' or 'dismiss'" },
      { status: 400 },
    )
  }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('ai_action_cards')
    .update(update)
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
