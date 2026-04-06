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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(date))
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgId(supabase, user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  // Fetch invoice with relations
  const { data: invoice } = await supabase
    .from('invoices')
    .select(`
      *,
      line_items:invoice_line_items (*),
      customer:customer_id (id, name, email, address_line1, address_line2, city, state, zip),
      aircraft:aircraft_id (id, tail_number),
      organization:organization_id (id, name)
    `)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  const orgName = (invoice.organization as any)?.name ?? 'Your MRO'
  const customer = invoice.customer as any
  const aircraft = invoice.aircraft as any
  const lineItems = ((invoice.line_items ?? []) as any[]).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  // Build line items HTML
  const lineItemsHtml = lineItems.map((li: any) => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px;">${li.description}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; text-align: center;">${li.quantity}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; text-align: right;">${formatCurrency(li.unit_price)}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; text-align: right; font-weight: 600;">${formatCurrency(li.line_total ?? li.quantity * li.unit_price)}</td>
    </tr>
  `).join('')

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>Invoice ${invoice.invoice_number} - ${orgName}</title>
    <style>
      /* Print-optimized CSS */
      @page {
        size: letter;
        margin: 0.75in;
      }

      @media print {
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        nav, .no-print, button, a[href]:after { display: none !important; }
        table { page-break-inside: avoid; }
        tr { page-break-inside: avoid; }
      }

      * { box-sizing: border-box; margin: 0; padding: 0; }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        color: #111827;
        background: #fff;
        line-height: 1.5;
      }

      .invoice-container {
        max-width: 800px;
        margin: 0 auto;
        padding: 32px;
      }

      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 32px;
        padding-bottom: 24px;
        border-bottom: 2px solid #111827;
      }

      .header h1 {
        font-size: 28px;
        font-weight: 700;
        color: #111827;
      }

      .header .org-name {
        font-size: 14px;
        color: #6b7280;
        margin-top: 4px;
      }

      .header .invoice-meta {
        text-align: right;
        font-size: 13px;
        color: #6b7280;
      }

      .header .invoice-meta strong {
        color: #111827;
      }

      .details-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 32px;
      }

      .bill-to {
        flex: 1;
      }

      .bill-to .label {
        font-size: 11px;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 600;
        margin-bottom: 4px;
      }

      .bill-to .name {
        font-size: 14px;
        font-weight: 600;
        color: #111827;
      }

      .bill-to .address {
        font-size: 13px;
        color: #6b7280;
        margin-top: 2px;
      }

      .invoice-details {
        text-align: right;
        font-size: 13px;
        color: #6b7280;
      }

      .invoice-details strong {
        color: #111827;
      }

      .invoice-details p {
        margin: 3px 0;
      }

      /* Table */
      .items-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 24px;
      }

      .items-table thead tr {
        background-color: #f9fafb;
      }

      .items-table th {
        padding: 10px 12px;
        text-align: left;
        font-size: 11px;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 600;
        border-bottom: 2px solid #e5e7eb;
      }

      .items-table th:nth-child(2) { text-align: center; }
      .items-table th:nth-child(3) { text-align: right; }
      .items-table th:nth-child(4) { text-align: right; }

      /* Totals */
      .totals-section {
        display: flex;
        justify-content: flex-end;
        margin-bottom: 32px;
      }

      .totals-table {
        width: 280px;
      }

      .totals-table td {
        padding: 4px 0;
        font-size: 14px;
      }

      .totals-table .label {
        color: #6b7280;
      }

      .totals-table .value {
        text-align: right;
      }

      .totals-table .total-row td {
        padding-top: 10px;
        font-size: 18px;
        font-weight: 700;
        color: #111827;
        border-top: 2px solid #111827;
      }

      .totals-table .discount {
        color: #16a34a;
      }

      /* Notes */
      .notes-section {
        margin-top: 32px;
        padding: 16px;
        background: #f9fafb;
        border-radius: 6px;
      }

      .notes-section .label {
        font-size: 11px;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 600;
        margin-bottom: 4px;
      }

      .notes-section p {
        font-size: 13px;
        color: #374151;
      }

      .footer {
        text-align: center;
        margin-top: 48px;
        font-size: 12px;
        color: #9ca3af;
      }
    </style>
  </head>
  <body>
    <div class="invoice-container">
      <!-- Header -->
      <div class="header">
        <div>
          <h1>Invoice ${invoice.invoice_number}</h1>
          <p class="org-name">${orgName}</p>
        </div>
        <div class="invoice-meta">
          <p>Issue Date: <strong>${formatDate(invoice.issue_date)}</strong></p>
          <p>Due Date: <strong>${formatDate(invoice.due_date)}</strong></p>
          <p>Terms: <strong>${invoice.payment_terms ?? 'Net 30'}</strong></p>
          <p>Status: <strong>${(invoice.status ?? 'draft').replace('_', ' ').toUpperCase()}</strong></p>
        </div>
      </div>

      <!-- Bill To / Aircraft -->
      <div class="details-row">
        <div class="bill-to">
          <p class="label">Bill To</p>
          <p class="name">${customer?.name ?? 'Customer'}</p>
          ${customer?.address_line1 ? `<p class="address">${customer.address_line1}</p>` : ''}
          ${customer?.address_line2 ? `<p class="address">${customer.address_line2}</p>` : ''}
          ${customer?.city ? `<p class="address">${customer.city}, ${customer.state ?? ''} ${customer.zip ?? ''}</p>` : ''}
          ${customer?.email ? `<p class="address">${customer.email}</p>` : ''}
        </div>
        <div class="invoice-details">
          ${aircraft ? `<p>Aircraft: <strong>${aircraft.tail_number}</strong></p>` : ''}
        </div>
      </div>

      <!-- Line Items -->
      <table class="items-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Rate</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineItemsHtml}
        </tbody>
      </table>

      <!-- Totals -->
      <div class="totals-section">
        <table class="totals-table">
          <tr>
            <td class="label">Subtotal</td>
            <td class="value">${formatCurrency(invoice.subtotal)}</td>
          </tr>
          ${invoice.tax_amount > 0 ? `
          <tr>
            <td class="label">Tax${invoice.tax_rate ? ` (${invoice.tax_rate}%)` : ''}</td>
            <td class="value">${formatCurrency(invoice.tax_amount)}</td>
          </tr>` : ''}
          ${invoice.discount_amount > 0 ? `
          <tr>
            <td class="label">Discount</td>
            <td class="value discount">-${formatCurrency(invoice.discount_amount)}</td>
          </tr>` : ''}
          <tr class="total-row">
            <td>Total Due</td>
            <td class="value">${formatCurrency(invoice.balance_due ?? invoice.total)}</td>
          </tr>
        </table>
      </div>

      ${invoice.notes ? `
      <div class="notes-section">
        <p class="label">Notes</p>
        <p>${invoice.notes}</p>
      </div>` : ''}

      <div class="footer">
        <p>Generated by ${orgName} via myaircraft.us</p>
        <p style="margin-top: 4px;">To save as PDF: File &rarr; Print &rarr; Save as PDF</p>
      </div>
    </div>
  </body>
  </html>`

  const filename = `invoice-${invoice.invoice_number ?? params.id}.html`

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
