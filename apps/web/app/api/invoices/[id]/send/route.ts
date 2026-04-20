import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { exportAccountingInvoices, type ExportableInvoice } from '@/lib/integrations/accounting'
const nodemailer = require('nodemailer')

async function getOrgId(supabase: any, userId: string) {
  const { data } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', userId)
    .not('accepted_at', 'is', null)
    .single()
  return data?.organization_id ?? null
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(date))
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgId(supabase, user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return NextResponse.json({ error: 'Email not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.' }, { status: 503 })
  }

  // Fetch invoice with relations
  const { data: invoice } = await supabase
    .from('invoices')
    .select(`
      *,
      line_items:invoice_line_items (*),
      customer:customer_id (id, name, email, billing_address),
      aircraft:aircraft_id (id, tail_number),
      organization:organization_id (id, name)
    `)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const recipientEmail = body.recipient_email ?? (invoice.customer as any)?.email
  if (!recipientEmail) {
    return NextResponse.json({ error: 'No recipient email. Provide recipient_email or set customer email.' }, { status: 400 })
  }

  const orgName = (invoice.organization as any)?.name ?? 'Your MRO'
  const customer = invoice.customer as any
  const aircraft = invoice.aircraft as any
  const lineItems = ((invoice.line_items ?? []) as any[]).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  // Build HTML email
  const lineItemsHtml = lineItems.map((li: any) => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px;">${li.description}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; text-align: center;">${li.quantity}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; text-align: right;">${formatCurrency(li.unit_price)}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; text-align: right; font-weight: 600;">${formatCurrency(li.line_total ?? li.quantity * li.unit_price)}</td>
    </tr>
  `).join('')

  const payLink = invoice.stripe_payment_link_url
    ? `<div style="text-align: center; margin: 24px 0;">
        <a href="${invoice.stripe_payment_link_url}" style="display: inline-block; padding: 12px 32px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">Pay Now</a>
      </div>`
    : ''

  const html = `
  <!DOCTYPE html>
  <html>
  <body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <div style="max-width: 600px; margin: 0 auto; padding: 32px 16px;">
      <div style="background: white; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden;">
        <!-- Header -->
        <div style="padding: 24px; border-bottom: 1px solid #e5e7eb;">
          <h1 style="margin: 0; font-size: 20px; color: #111827;">Invoice ${invoice.invoice_number}</h1>
          <p style="margin: 4px 0 0; font-size: 14px; color: #6b7280;">From ${orgName}</p>
        </div>

        <!-- Details -->
        <div style="padding: 24px;">
          <table style="width: 100%; margin-bottom: 24px;">
            <tr>
              <td style="vertical-align: top; width: 50%;">
                <p style="margin: 0; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Bill To</p>
                <p style="margin: 4px 0 0; font-size: 14px; color: #111827; font-weight: 600;">${customer?.name ?? 'Customer'}</p>
                ${customer?.billing_address ? `<p style="margin: 2px 0 0; font-size: 13px; color: #6b7280;">${customer.billing_address}</p>` : ''}
              </td>
              <td style="vertical-align: top; text-align: right;">
                <p style="margin: 0; font-size: 13px; color: #6b7280;">Issue Date: <strong>${formatDate(invoice.invoice_date)}</strong></p>
                <p style="margin: 4px 0 0; font-size: 13px; color: #6b7280;">Due Date: <strong>${formatDate(invoice.due_date)}</strong></p>
                ${aircraft ? `<p style="margin: 4px 0 0; font-size: 13px; color: #6b7280;">Aircraft: <strong>${aircraft.tail_number}</strong></p>` : ''}
                <p style="margin: 4px 0 0; font-size: 13px; color: #6b7280;">Terms: <strong>${invoice.payment_terms ?? 'Net 30'}</strong></p>
              </td>
            </tr>
          </table>

          <!-- Line Items -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
            <thead>
              <tr style="background-color: #f9fafb;">
                <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #6b7280; text-transform: uppercase; border-bottom: 2px solid #e5e7eb;">Description</th>
                <th style="padding: 8px 12px; text-align: center; font-size: 12px; color: #6b7280; text-transform: uppercase; border-bottom: 2px solid #e5e7eb;">Qty</th>
                <th style="padding: 8px 12px; text-align: right; font-size: 12px; color: #6b7280; text-transform: uppercase; border-bottom: 2px solid #e5e7eb;">Rate</th>
                <th style="padding: 8px 12px; text-align: right; font-size: 12px; color: #6b7280; text-transform: uppercase; border-bottom: 2px solid #e5e7eb;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${lineItemsHtml}
            </tbody>
          </table>

          <!-- Totals -->
          <table style="width: 280px; margin-left: auto;">
            <tr>
              <td style="padding: 4px 0; font-size: 14px; color: #6b7280;">Subtotal</td>
              <td style="padding: 4px 0; font-size: 14px; text-align: right;">${formatCurrency(invoice.subtotal)}</td>
            </tr>
            ${invoice.tax_amount > 0 ? `
            <tr>
              <td style="padding: 4px 0; font-size: 14px; color: #6b7280;">Tax</td>
              <td style="padding: 4px 0; font-size: 14px; text-align: right;">${formatCurrency(invoice.tax_amount)}</td>
            </tr>` : ''}
            ${invoice.discount_amount > 0 ? `
            <tr>
              <td style="padding: 4px 0; font-size: 14px; color: #6b7280;">Discount</td>
              <td style="padding: 4px 0; font-size: 14px; text-align: right; color: #16a34a;">-${formatCurrency(invoice.discount_amount)}</td>
            </tr>` : ''}
            <tr style="border-top: 2px solid #111827;">
              <td style="padding: 8px 0 4px; font-size: 16px; font-weight: 700; color: #111827;">Total Due</td>
              <td style="padding: 8px 0 4px; font-size: 16px; font-weight: 700; text-align: right; color: #111827;">${formatCurrency(invoice.balance_due ?? invoice.total)}</td>
            </tr>
          </table>

          ${payLink}

          ${invoice.notes ? `
          <div style="margin-top: 24px; padding: 12px; background: #f9fafb; border-radius: 6px;">
            <p style="margin: 0; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Notes</p>
            <p style="margin: 4px 0 0; font-size: 13px; color: #374151;">${invoice.notes}</p>
          </div>` : ''}
        </div>
      </div>

      <p style="text-align: center; margin-top: 24px; font-size: 12px; color: #9ca3af;">
        Sent via myaircraft.us
      </p>
    </div>
  </body>
  </html>`

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    })

    await transporter.sendMail({
      from: `"${orgName}" <${process.env.GMAIL_USER}>`,
      to: recipientEmail,
      subject: `Invoice ${invoice.invoice_number} from ${orgName}`,
      html,
    })

    // Update invoice
    const statusUpdate = invoice.status === 'draft' ? 'sent' : invoice.status
    const { data: updated } = await supabase
      .from('invoices')
      .update({
        email_sent_at: new Date().toISOString(),
        email_sent_to: recipientEmail,
        status: statusUpdate,
        sent_at: invoice.sent_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .eq('organization_id', orgId)
      .select()
      .single()

    const { data: connectedAccountingIntegrations } = await supabase
      .from('integrations')
      .select('id, provider, credentials_encrypted, settings')
      .eq('organization_id', orgId)
      .eq('status', 'connected')
      .in('provider', ['quickbooks', 'freshbooks'])

    const accountingResults: Array<Record<string, unknown>> = []

    for (const integration of connectedAccountingIntegrations ?? []) {
      try {
        const result = await exportAccountingInvoices({
          provider: integration.provider as 'quickbooks' | 'freshbooks',
          integrationId: integration.id,
          credentials: integration.credentials_encrypted,
          settings: (integration.settings ?? {}) as Record<string, unknown>,
          invoices: [invoice as ExportableInvoice],
          orgId,
          supabase,
        })
        accountingResults.push({
          provider: integration.provider,
          exported: result.exported,
          skipped: result.skipped,
          failures: result.failures,
        })
      } catch (accountingError) {
        accountingResults.push({
          provider: integration.provider,
          exported: 0,
          skipped: 0,
          failures: [
            accountingError instanceof Error
              ? accountingError.message
              : 'Unknown accounting export error',
          ],
        })
      }
    }

    return NextResponse.json({ sent: true, invoice: updated, accounting_export: accountingResults })
  } catch (err: any) {
    console.error('Email send error:', err)
    return NextResponse.json({ error: 'Failed to send email: ' + err.message }, { status: 500 })
  }
}
