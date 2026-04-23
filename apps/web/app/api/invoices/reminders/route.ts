import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const { searchParams } = new URL(req.url)
  const invoice_id = searchParams.get('invoice_id')
  const status = searchParams.get('status')

  let query = supabase
    .from('invoice_reminders')
    .select(`
      *,
      invoice:invoice_id (id, invoice_number, due_date, total, balance_due, status)
    `)
    .eq('organization_id', orgId)
    .order('scheduled_for', { ascending: true })

  if (invoice_id) query = query.eq('invoice_id', invoice_id)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ reminders: data ?? [] })
}

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const body = await req.json()
  const { invoice_id, scheduled_for, kind, recipient_email, message } = body

  if (!invoice_id || !scheduled_for || !kind) {
    return NextResponse.json(
      { error: 'Missing required fields: invoice_id, scheduled_for, kind' },
      { status: 400 }
    )
  }

  const validKinds = ['upcoming_due', 'overdue', 'polite_reminder', 'final_notice', 'custom']
  if (!validKinds.includes(kind)) {
    return NextResponse.json(
      { error: `Invalid kind. Must be one of: ${validKinds.join(', ')}` },
      { status: 400 }
    )
  }

  // Verify invoice belongs to this org
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, customer_id')
    .eq('id', invoice_id)
    .eq('organization_id', orgId)
    .single()

  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  // If no recipient_email provided, look up customer email
  let email = recipient_email
  if (!email && invoice.customer_id) {
    const { data: customer } = await supabase
      .from('customers')
      .select('email')
      .eq('id', invoice.customer_id)
      .single()
    email = customer?.email
  }

  if (!email) {
    return NextResponse.json(
      { error: 'No recipient email. Provide recipient_email or set customer email.' },
      { status: 400 }
    )
  }

  const { data: reminder, error } = await supabase
    .from('invoice_reminders')
    .insert({
      organization_id: orgId,
      invoice_id,
      scheduled_for,
      kind,
      recipient_email: email,
      message: message ?? null,
      status: 'scheduled',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(reminder, { status: 201 })
}
