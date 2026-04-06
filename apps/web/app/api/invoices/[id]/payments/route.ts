import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

async function getOrgId(supabase: any, userId: string) {
  const { data } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', userId)
    .not('accepted_at', 'is', null)
    .single()
  return data?.organization_id ?? null
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgId(supabase, user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  // Fetch invoice
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, total, amount_paid, status')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  const body = await req.json()

  if (!body.amount || body.amount <= 0) {
    return NextResponse.json({ error: 'Valid payment amount required' }, { status: 400 })
  }

  // Record payment
  const { data: payment, error: payErr } = await supabase
    .from('payments')
    .insert({
      organization_id: orgId,
      invoice_id: params.id,
      amount: body.amount,
      payment_method: body.payment_method ?? 'other',
      reference_number: body.reference_number ?? null,
      notes: body.notes ?? null,
      payment_date: body.payment_date ?? new Date().toISOString().split('T')[0],
      recorded_by: user.id,
    })
    .select()
    .single()

  if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 })

  // Update invoice amount_paid and status
  const newAmountPaid = (invoice.amount_paid ?? 0) + body.amount
  const isPaidInFull = newAmountPaid >= invoice.total
  const newStatus = isPaidInFull ? 'paid' : 'partially_paid'

  const updates: Record<string, unknown> = {
    amount_paid: newAmountPaid,
    status: newStatus,
    updated_at: new Date().toISOString(),
  }

  if (isPaidInFull) {
    updates.paid_at = new Date().toISOString()
  }

  const { data: updatedInvoice } = await supabase
    .from('invoices')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .select()
    .single()

  return NextResponse.json({ payment, invoice: updatedInvoice }, { status: 201 })
}
