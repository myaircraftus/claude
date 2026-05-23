/**
 * POST /api/invoices/[id]/mark-paid
 *
 * One-click "this is paid" action. Inserts a payment row for the
 * current balance_due (or whatever amount the caller passes) with
 * the chosen method, writes an audit + timeline entry, lets the
 * trigger-backed recompute take the totals from there.
 *
 * Convenience-only — for an itemised partial payment use
 * /api/invoices/[id]/payments directly.
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  normalizePaymentMethod,
  writeInvoiceAudit,
  writeInvoiceTimeline,
} from '@/lib/invoices/workflow'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('id, invoice_number, total, balance_due, amount_paid, aircraft_id, customer_id, payee_id, status')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (invErr || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }
  if (
    ['paid', 'void', 'refunded', 'writeoff', 'written_off'].includes(
      (invoice as { status: string }).status,
    )
  ) {
    return NextResponse.json(
      {
        error: 'Invoice already in a terminal payment state',
        current_status: (invoice as { status: string }).status,
      },
      { status: 409 },
    )
  }

  const body = (await req.json().catch(() => ({}))) as {
    amount?: number
    payment_method?: string
    method?: string
    reference_number?: string
    notes?: string
  }
  const remaining = Number((invoice as { balance_due: number | null }).balance_due ?? 0)
  const amount = typeof body.amount === 'number' && body.amount > 0 ? body.amount : remaining
  if (!(amount > 0)) {
    return NextResponse.json(
      { error: 'No remaining balance to mark as paid' },
      { status: 400 },
    )
  }
  const method = normalizePaymentMethod(body.payment_method ?? body.method ?? 'check')

  const now = new Date().toISOString()
  const { data: payment, error: payErr } = await supabase
    .from('payments')
    .insert({
      organization_id: orgId,
      invoice_id: params.id,
      aircraft_id: (invoice as { aircraft_id: string | null }).aircraft_id,
      owner_id:
        (invoice as { payee_id: string | null }).payee_id ??
        (invoice as { customer_id: string | null }).customer_id,
      amount,
      payment_method: method,
      reference_number: body.reference_number ?? null,
      manual_reference: body.reference_number ?? null,
      notes: body.notes ?? null,
      payment_date: now.split('T')[0],
      recorded_by: ctx.user.id,
      received_by: ctx.user.id,
      received_at: now,
      status: 'received',
      verification_status: 'verified',
      verified_by: ctx.user.id,
      verified_at: now,
    })
    .select('id')
    .single()
  if (payErr) {
    return NextResponse.json({ error: payErr.message }, { status: 500 })
  }

  // The recompute trigger has already updated amount_paid + payment_total
  // + total. We still need to flip status to 'paid' when fully paid,
  // and stamp paid_at.
  const { data: refreshed } = await supabase
    .from('invoices')
    .select('total, amount_paid, balance_due, status')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .maybeSingle()
  const balance = Number((refreshed as { balance_due?: number | null } | null)?.balance_due ?? 0)
  const newStatus = balance <= 0.01 ? 'paid' : 'partially_paid'

  await supabase
    .from('invoices')
    .update({
      status: newStatus,
      payment_status: balance <= 0.01 ? 'paid' : 'partially_paid',
      paid_at: balance <= 0.01 ? now : null,
      updated_at: now,
    })
    .eq('id', params.id)
    .eq('organization_id', orgId)

  await writeInvoiceAudit(supabase, req, {
    organizationId: orgId,
    userId: ctx.user.id,
    action: balance <= 0.01 ? 'invoice_marked_paid' : 'invoice_partial_payment',
    invoiceId: params.id,
    aircraftId: (invoice as { aircraft_id: string | null }).aircraft_id,
    metadata: { payment_id: (payment as { id: string }).id, method, amount },
  })
  await writeInvoiceTimeline(supabase, {
    organizationId: orgId,
    aircraftId: (invoice as { aircraft_id: string | null }).aircraft_id,
    actorId: ctx.user.id,
    action: balance <= 0.01 ? 'marked_paid' : 'partial_payment',
    invoiceId: params.id,
    title:
      balance <= 0.01
        ? `Invoice ${(invoice as { invoice_number: string }).invoice_number} marked paid`
        : `Partial payment recorded on ${(invoice as { invoice_number: string }).invoice_number}`,
    summary: `$${amount.toFixed(2)} via ${method.replace(/_/g, ' ')}`,
    ownerVisible: true,
    metadata: { payment_id: (payment as { id: string }).id, method, amount },
  })

  return NextResponse.json({
    ok: true,
    invoice_id: params.id,
    payment_id: (payment as { id: string }).id,
    new_status: newStatus,
    balance_due: balance,
  })
}
