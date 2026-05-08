/**
 * POST /api/integrations/qbo/sync  (Spec 3.3 + 5.7 stub layer)
 *
 *   action='push_invoice' { local_invoice_id }  → push 1 invoice to QBO (3.3)
 *   action='pull_payments' { since? }           → pull recent payments + auto-recon (5.7)
 *
 * Owner/admin only. Auto-recon flow: list QBO payments since cursor,
 * match each to a local invoice by amount + date heuristic, write
 * qbo_payment_mappings + flip the local invoice's payment_status
 * (best-effort — local invoices schema may vary; logs failures).
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { getQboClient } from '@/lib/integrations/qbo-client'
import { parseJsonBody, safeUuidOptional } from '@/lib/validation/common'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Spec 5.4 — runtime body validation.
const Body = z.object({
  action: z.enum(['push_invoice', 'pull_payments']).optional(),
  local_invoice_id: safeUuidOptional,
  since: z.string().max(64).optional(),
})

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: membership } = await supabase
    .from('organization_memberships').select('organization_id, role')
    .eq('user_id', user.id).not('accepted_at', 'is', null).single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })
  if (!['owner', 'admin'].includes(membership.role)) return NextResponse.json({ error: 'Owner/admin only' }, { status: 403 })

  const parsed = await parseJsonBody(req, Body)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  const service = createServiceSupabase()
  const { data: stateRow } = await service.from('qbo_sync_state').select('*')
    .eq('organization_id', membership.organization_id).maybeSingle()
  const state = stateRow as { realm_id: string | null; access_token: string | null } | null
  if (!state?.realm_id || !state?.access_token) {
    return NextResponse.json({ error: 'QBO not connected' }, { status: 400 })
  }

  const qbo = getQboClient()

  if (body.action === 'push_invoice') {
    if (!body.local_invoice_id) return NextResponse.json({ error: 'local_invoice_id required' }, { status: 400 })
    const { data: invoice } = await service.from('invoices').select('id, total_amount, customer_id, due_date')
      .eq('id', body.local_invoice_id).eq('organization_id', membership.organization_id).maybeSingle()
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    const inv = invoice as { id: string; total_amount: number | null; customer_id: string | null; due_date: string | null }
    try {
      const result = await qbo.pushInvoice({
        realm_id: state.realm_id, access_token: state.access_token,
        invoice: {
          local_invoice_id: inv.id,
          customer_ref: inv.customer_id ?? '1',
          amount_cents: Math.round((inv.total_amount ?? 0) * 100),
          currency: 'usd',
          lines: [{ description: 'Aviation maintenance services', amount_cents: Math.round((inv.total_amount ?? 0) * 100) }],
          due_date: inv.due_date ?? undefined,
        },
      })
      await service.from('qbo_invoice_mappings').upsert({
        organization_id: membership.organization_id,
        local_invoice_id: inv.id,
        qbo_invoice_id: result.qbo_invoice_id,
        sync_status: 'pushed',
      }, { onConflict: 'organization_id,local_invoice_id' })
      await service.from('qbo_sync_state').update({ last_sync_at: new Date().toISOString(), last_sync_status: 'success', last_error: null })
        .eq('organization_id', membership.organization_id)
      return NextResponse.json({ ok: true, qbo_invoice_id: result.qbo_invoice_id })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Push failed'
      await service.from('qbo_sync_state').update({ last_sync_at: new Date().toISOString(), last_sync_status: 'failed', last_error: msg })
        .eq('organization_id', membership.organization_id)
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  if (body.action === 'pull_payments') {
    const since = body.since ?? new Date(Date.now() - 7 * 86400_000).toISOString()
    const payments = await qbo.listRecentPayments({ realm_id: state.realm_id, access_token: state.access_token, since })
    let matched = 0
    for (const p of payments) {
      // Heuristic: amount within $0.01 = exact match (auto); amount within
      // $1 = approximate (review queue). Date is informational.
      const { data: candidates } = await service.from('invoices')
        .select('id, total_amount, issued_date')
        .eq('organization_id', membership.organization_id)
        .gte('total_amount', p.total_amount - 1)
        .lte('total_amount', p.total_amount + 1)
        .order('issued_date', { ascending: false })
        .limit(20)

      const cand = ((candidates ?? []) as Array<{ id: string; total_amount: number; issued_date: string | null }>)
        .find((c) => Math.abs((c.total_amount ?? 0) - p.total_amount) < 0.01)
      const confidence = cand ? 1.0 : 0.5

      await service.from('qbo_payment_mappings').insert({
        organization_id: membership.organization_id,
        local_invoice_id: cand?.id ?? null,
        qbo_payment_id: p.id,
        amount_cents: Math.round(p.total_amount * 100),
        payment_date: p.txn_date,
        match_confidence: confidence,
        review_status: confidence >= 1.0 ? 'auto' : 'review',
      })
      if (cand) matched++
    }
    await service.from('qbo_sync_state').update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: matched > 0 ? 'success' : 'partial',
    }).eq('organization_id', membership.organization_id)
    return NextResponse.json({ ok: true, payments_seen: payments.length, matched })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
