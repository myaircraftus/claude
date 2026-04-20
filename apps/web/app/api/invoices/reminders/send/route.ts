import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
const nodemailer = require('nodemailer')

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(date))
}

function getSubjectForKind(kind: string, invoiceNumber: string, dueDate: string): string {
  switch (kind) {
    case 'upcoming_due':
      return `Friendly reminder: Invoice ${invoiceNumber} is due on ${formatDate(dueDate)}`
    case 'overdue':
      return `Invoice ${invoiceNumber} is now past due`
    case 'polite_reminder':
      return `Reminder: Invoice ${invoiceNumber} - payment requested`
    case 'final_notice':
      return `Final notice: Invoice ${invoiceNumber} requires immediate payment`
    default:
      return `Regarding Invoice ${invoiceNumber}`
  }
}

function getGreetingForKind(kind: string): string {
  switch (kind) {
    case 'upcoming_due':
      return 'This is a friendly reminder that the following invoice will be due soon.'
    case 'overdue':
      return 'Our records indicate the following invoice is now past its due date. We would appreciate your prompt attention to this matter.'
    case 'polite_reminder':
      return 'We wanted to follow up regarding the outstanding balance on the following invoice.'
    case 'final_notice':
      return 'This is a final notice regarding the overdue balance on the following invoice. Immediate payment is required to avoid further action.'
    default:
      return 'Please see the details regarding your invoice below.'
  }
}

function buildReminderHtml(
  kind: string,
  invoice: any,
  orgName: string,
  customerName: string,
  customMessage: string | null,
): string {
  const greeting = getGreetingForKind(kind)
  const balanceDue = invoice.balance_due ?? invoice.total
  const payLink = invoice.stripe_payment_link_url
    ? `<div style="text-align: center; margin: 24px 0;">
        <a href="${invoice.stripe_payment_link_url}" style="display: inline-block; padding: 12px 32px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">Pay Now</a>
      </div>`
    : ''

  return `
  <!DOCTYPE html>
  <html>
  <body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <div style="max-width: 600px; margin: 0 auto; padding: 32px 16px;">
      <div style="background: white; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden;">
        <!-- Header -->
        <div style="padding: 24px; border-bottom: 1px solid #e5e7eb;">
          <h1 style="margin: 0; font-size: 20px; color: #111827;">Payment Reminder</h1>
          <p style="margin: 4px 0 0; font-size: 14px; color: #6b7280;">From ${orgName}</p>
        </div>

        <!-- Body -->
        <div style="padding: 24px;">
          <p style="margin: 0 0 16px; font-size: 14px; color: #374151;">Dear ${customerName},</p>
          <p style="margin: 0 0 24px; font-size: 14px; color: #374151;">${greeting}</p>

          <!-- Invoice summary -->
          <div style="background: #f9fafb; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
            <table style="width: 100%;">
              <tr>
                <td style="padding: 4px 0; font-size: 14px; color: #6b7280;">Invoice</td>
                <td style="padding: 4px 0; font-size: 14px; text-align: right; font-weight: 600; color: #111827;">${invoice.invoice_number}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-size: 14px; color: #6b7280;">Due Date</td>
                <td style="padding: 4px 0; font-size: 14px; text-align: right; color: #111827;">${formatDate(invoice.due_date)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-size: 14px; color: #6b7280;">Invoice Total</td>
                <td style="padding: 4px 0; font-size: 14px; text-align: right; color: #111827;">${formatCurrency(invoice.total)}</td>
              </tr>
              ${invoice.amount_paid > 0 ? `
              <tr>
                <td style="padding: 4px 0; font-size: 14px; color: #6b7280;">Amount Paid</td>
                <td style="padding: 4px 0; font-size: 14px; text-align: right; color: #16a34a;">${formatCurrency(invoice.amount_paid)}</td>
              </tr>` : ''}
              <tr style="border-top: 1px solid #e5e7eb;">
                <td style="padding: 8px 0 4px; font-size: 16px; font-weight: 700; color: #111827;">Balance Due</td>
                <td style="padding: 8px 0 4px; font-size: 16px; font-weight: 700; text-align: right; color: ${kind === 'final_notice' ? '#dc2626' : '#111827'};">${formatCurrency(balanceDue)}</td>
              </tr>
            </table>
          </div>

          ${payLink}

          ${customMessage ? `
          <div style="margin-top: 16px; padding: 12px; background: #eff6ff; border-radius: 6px; border-left: 3px solid #3b82f6;">
            <p style="margin: 0; font-size: 13px; color: #374151;">${customMessage}</p>
          </div>` : ''}

          <p style="margin: 24px 0 0; font-size: 13px; color: #6b7280;">
            If you have already made this payment, please disregard this message. For questions, reply to this email.
          </p>
        </div>
      </div>

      <p style="text-align: center; margin-top: 24px; font-size: 12px; color: #9ca3af;">
        Sent via myaircraft.us
      </p>
    </div>
  </body>
  </html>`
}

export async function POST(req: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return NextResponse.json({ error: 'Email not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.' }, { status: 503 })
  }

  // Use service-role client to bypass RLS -- this runs as a cron job, not a user session
  const supabase = createServiceSupabase()

  // Fetch all due reminders
  const { data: reminders, error: fetchErr } = await supabase
    .from('invoice_reminders')
    .select('*')
    .lte('scheduled_for', new Date().toISOString())
    .eq('status', 'scheduled')
    .order('scheduled_for', { ascending: true })

  if (fetchErr) {
    console.error('Failed to fetch reminders:', fetchErr.message)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  if (!reminders || reminders.length === 0) {
    return NextResponse.json({ processed: 0, sent: 0, failed: 0 })
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  })

  let sent = 0
  let failed = 0

  for (const reminder of reminders) {
    try {
      // Fetch invoice with customer and org details
      const { data: invoice } = await supabase
        .from('invoices')
        .select(`
          *,
          customer:customer_id (id, name, email),
          organization:organization_id (id, name)
        `)
        .eq('id', reminder.invoice_id)
        .single()

      if (!invoice) {
        console.error(`Invoice ${reminder.invoice_id} not found for reminder ${reminder.id}`)
        await supabase
          .from('invoice_reminders')
          .update({ status: 'failed' })
          .eq('id', reminder.id)
        failed++
        continue
      }

      // Skip if invoice is already paid or void
      if (invoice.status === 'paid' || invoice.status === 'void') {
        await supabase
          .from('invoice_reminders')
          .update({ status: 'cancelled' })
          .eq('id', reminder.id)
        continue
      }

      const customer = invoice.customer as any
      const orgName = (invoice.organization as any)?.name ?? 'Your MRO'
      const customerName = customer?.name ?? 'Customer'
      const recipientEmail = reminder.recipient_email ?? customer?.email

      if (!recipientEmail) {
        console.error(`No recipient email for reminder ${reminder.id}`)
        await supabase
          .from('invoice_reminders')
          .update({ status: 'failed' })
          .eq('id', reminder.id)
        failed++
        continue
      }

      const subject = getSubjectForKind(reminder.kind, invoice.invoice_number, invoice.due_date)
      const html = buildReminderHtml(
        reminder.kind,
        invoice,
        orgName,
        customerName,
        reminder.message,
      )

      await transporter.sendMail({
        from: `"${orgName}" <${process.env.GMAIL_USER}>`,
        to: recipientEmail,
        subject,
        html,
      })

      await supabase
        .from('invoice_reminders')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', reminder.id)

      sent++
    } catch (err: any) {
      console.error(`Failed to send reminder ${reminder.id}:`, err.message)
      await supabase
        .from('invoice_reminders')
        .update({ status: 'failed' })
        .eq('id', reminder.id)
      failed++
    }
  }

  return NextResponse.json({
    processed: reminders.length,
    sent,
    failed,
  })
}
