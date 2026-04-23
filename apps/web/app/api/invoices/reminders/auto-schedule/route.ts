import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const body = await req.json()
  const { invoice_id } = body

  if (!invoice_id) {
    return NextResponse.json({ error: 'Missing required field: invoice_id' }, { status: 400 })
  }

  // Fetch invoice with customer
  const { data: invoice } = await supabase
    .from('invoices')
    .select(`
      id, due_date, customer_id,
      customer:customer_id (id, name, email)
    `)
    .eq('id', invoice_id)
    .eq('organization_id', orgId)
    .single()

  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  if (!invoice.due_date) {
    return NextResponse.json({ error: 'Invoice has no due date set' }, { status: 400 })
  }

  const customer = invoice.customer as any
  const recipientEmail = customer?.email
  if (!recipientEmail) {
    return NextResponse.json(
      { error: 'No customer email found. Set the customer email first.' },
      { status: 400 }
    )
  }

  // Check if reminders already exist for this invoice
  const { data: existing } = await supabase
    .from('invoice_reminders')
    .select('id')
    .eq('invoice_id', invoice_id)
    .eq('organization_id', orgId)
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: 'Reminders already exist for this invoice. Delete existing reminders first to re-schedule.' },
      { status: 409 }
    )
  }

  // Build 4-reminder schedule based on due_date
  const dueDate = new Date(invoice.due_date)

  const schedule: { kind: string; offset_days: number }[] = [
    { kind: 'upcoming_due', offset_days: -7 },   // 7 days before due
    { kind: 'polite_reminder', offset_days: 0 },  // Day of due
    { kind: 'overdue', offset_days: 3 },           // 3 days after due
    { kind: 'final_notice', offset_days: 14 },     // 14 days after due
  ]

  const now = new Date()
  const remindersToInsert = schedule
    .map(({ kind, offset_days }) => {
      const scheduledFor = new Date(dueDate)
      scheduledFor.setDate(scheduledFor.getDate() + offset_days)
      // Set to 2pm UTC (matches the cron schedule)
      scheduledFor.setUTCHours(14, 0, 0, 0)
      return {
        organization_id: orgId,
        invoice_id,
        scheduled_for: scheduledFor.toISOString(),
        kind,
        recipient_email: recipientEmail,
        status: 'scheduled' as const,
      }
    })
    // Skip reminders that are already in the past
    .filter((r) => new Date(r.scheduled_for) > now)

  if (remindersToInsert.length === 0) {
    return NextResponse.json(
      { error: 'All reminder dates are in the past. Cannot schedule reminders for overdue invoices this way.' },
      { status: 400 }
    )
  }

  const { data: created, error } = await supabase
    .from('invoice_reminders')
    .insert(remindersToInsert)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    scheduled: created?.length ?? 0,
    skipped_past: schedule.length - remindersToInsert.length,
    reminders: created ?? [],
  }, { status: 201 })
}
