import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  normalizePaymentMethod,
  paymentRequiresVerification,
  paymentStatusForTotals,
  writeInvoiceAudit,
  writeInvoiceTimeline,
} from '@/lib/invoices/workflow'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, invoice_number, total, amount_paid, balance_due, status, due_date, aircraft_id, customer_id, payee_id')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  const body = await req.json()
  const amount = Number(body.amount ?? 0)
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Valid payment amount required' }, { status: 400 })
  }

  const method = normalizePaymentMethod(body.payment_method ?? body.method)
  const needsVerification = paymentRequiresVerification(method)
  const verificationStatus = body.verification_status ?? (needsVerification ? 'pending' : 'verified')
  const paymentStatus = body.status ?? (needsVerification ? 'pending' : 'verified')
  const now = new Date().toISOString()
  const paymentDate = body.payment_date ?? now.split('T')[0]

  const { data: payment, error: payErr } = await supabase
    .from('payments')
    .insert({
      organization_id: orgId,
      invoice_id: params.id,
      aircraft_id: invoice.aircraft_id,
      owner_id: invoice.payee_id ?? invoice.customer_id,
      amount,
      payment_method: method,
      reference_number: body.reference_number ?? body.manual_reference ?? body.processor_reference ?? null,
      processor_reference: body.processor_reference ?? null,
      manual_reference: body.manual_reference ?? body.reference_number ?? null,
      notes: body.notes ?? null,
      payment_date: paymentDate,
      recorded_by: ctx.user.id,
      received_by: ctx.user.id,
      received_at: now,
      status: paymentStatus,
      proof_attachment_id: body.proof_attachment_id ?? null,
      verification_status: verificationStatus,
      verified_by: verificationStatus === 'verified' ? ctx.user.id : null,
      verified_at: verificationStatus === 'verified' ? now : null,
      metadata: body.metadata ?? {},
    })
    .select()
    .single()

  if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 })

  if (body.proof_attachment_id || body.proof_metadata) {
    await supabase.from('payment_proofs').insert({
      organization_id: orgId,
      payment_id: payment.id,
      file_id: body.proof_attachment_id ?? null,
      proof_type: body.proof_type ?? (method === 'zelle' ? 'zelle' : 'upload'),
      uploaded_by: ctx.user.id,
      verified_by: verificationStatus === 'verified' ? ctx.user.id : null,
      verified_at: verificationStatus === 'verified' ? now : null,
      verification_status: verificationStatus === 'verified' ? 'verified' : 'pending',
      metadata: body.proof_metadata ?? {},
    })
  }

  const shouldCountPayment = ['received', 'verified'].includes(paymentStatus) && verificationStatus !== 'pending'
  const newAmountPaid = Number(invoice.amount_paid ?? 0) + (shouldCountPayment ? amount : 0)
  const state = paymentStatusForTotals(Number(invoice.total ?? 0), newAmountPaid, invoice.due_date)
  const updates: Record<string, unknown> = {
    amount_paid: newAmountPaid,
    payment_total: newAmountPaid,
    payment_status: shouldCountPayment ? state.paymentStatus : 'pending',
    status: shouldCountPayment ? state.invoiceStatus : invoice.status,
    updated_at: now,
  }
  if (state.invoiceStatus === 'paid') updates.paid_at = now

  const { data: updatedInvoice } = await supabase
    .from('invoices')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .select()
    .single()

  let receipt = null
  if (shouldCountPayment) {
    const receiptNumber = `RCPT-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`
    const { data: receiptRow } = await supabase
      .from('invoice_receipts')
      .insert({
        organization_id: orgId,
        payment_id: payment.id,
        invoice_id: params.id,
        receipt_number: receiptNumber,
        delivered_to: body.receipt_delivered_to ?? null,
        delivered_at: body.receipt_delivered_to ? now : null,
        metadata: { method, amount },
      })
      .select()
      .single()
    receipt = receiptRow ?? null

    await supabase
      .from('payments')
      .update({
        receipt_number: receiptNumber,
        receipt_delivered_to: body.receipt_delivered_to ?? null,
        receipt_delivered_at: body.receipt_delivered_to ? now : null,
      })
      .eq('id', payment.id)
      .eq('organization_id', orgId)
  }

  await writeInvoiceAudit(supabase, req, {
    organizationId: orgId,
    userId: ctx.user.id,
    action: shouldCountPayment ? 'invoice_payment_recorded' : 'invoice_payment_pending_verification',
    invoiceId: params.id,
    aircraftId: invoice.aircraft_id,
    metadata: { payment_id: payment.id, method, amount, verification_status: verificationStatus },
  })

  await writeInvoiceTimeline(supabase, {
    organizationId: orgId,
    aircraftId: invoice.aircraft_id,
    actorId: ctx.user.id,
    action: shouldCountPayment ? 'payment_recorded' : 'payment_pending_verification',
    invoiceId: params.id,
    title: `Payment ${shouldCountPayment ? 'recorded' : 'pending review'} for ${invoice.invoice_number}`,
    summary: `$${amount.toFixed(2)} via ${method.replace(/_/g, ' ')}.`,
    ownerVisible: shouldCountPayment,
    metadata: { payment_id: payment.id, method, amount, status: paymentStatus },
  })

  return NextResponse.json({ payment, receipt, invoice: updatedInvoice }, { status: 201 })
}
