import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

function formatDate(date: string | null | undefined): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const { data: estimate } = await supabase
    .from('estimates')
    .select(`
      *,
      aircraft:aircraft_id (id, tail_number, make, model, serial_number, year),
      customer:customer_id (id, name, email, company, billing_address),
      organization:organization_id (id, name),
      line_items:estimate_line_items (*)
    `)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (!estimate) {
    return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
  }

  // Fetch linked squawks
  const squawkIds: string[] = Array.isArray((estimate as any).linked_squawk_ids)
    ? (estimate as any).linked_squawk_ids
    : []
  let linkedSquawks: any[] = []
  if (squawkIds.length > 0) {
    const { data } = await supabase
      .from('squawks')
      .select('id, title, description, severity')
      .in('id', squawkIds)
    linkedSquawks = data ?? []
  }

  const lineItems = (((estimate.line_items ?? []) as any[]).sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  ))
  const orgName = (estimate.organization as any)?.name ?? 'Your MRO'
  const customer = estimate.customer as any
  const aircraft = estimate.aircraft as any

  const rows = lineItems.map((item: any) => `
    <tr>
      <td>${escapeHtml(item.item_type ?? 'service')}</td>
      <td>${escapeHtml(item.description ?? '')}</td>
      <td class="num">${escapeHtml(item.quantity ?? 1)}</td>
      <td class="num">${formatCurrency(Number(item.unit_price ?? 0))}</td>
      <td class="num strong">${formatCurrency(Number(item.line_total ?? 0))}</td>
    </tr>
  `).join('')

  const html = `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(estimate.estimate_number)} Estimate</title>
      <style>
        @page { size: letter; margin: 0.75in; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #0f172a;
          background: #ffffff;
          line-height: 1.45;
        }
        * { box-sizing: border-box; }
        .container { max-width: 860px; margin: 0 auto; }
        .header {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          border-bottom: 2px solid #0f172a;
          padding-bottom: 16px;
          margin-bottom: 20px;
        }
        .title { font-size: 28px; font-weight: 700; margin-bottom: 4px; }
        .subtle { color: #64748b; font-size: 13px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 18px; }
        .card {
          border: 1px solid #dbe2ea;
          border-radius: 12px;
          padding: 14px 16px;
          background: #fff;
        }
        .label {
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-size: 11px;
          font-weight: 700;
          margin-bottom: 6px;
        }
        .value { font-size: 14px; }
        .section-title {
          font-size: 15px;
          font-weight: 700;
          margin: 22px 0 10px;
        }
        table { width: 100%; border-collapse: collapse; }
        th, td {
          padding: 10px 12px;
          border-bottom: 1px solid #e5e7eb;
          font-size: 13px;
          text-align: left;
          vertical-align: top;
        }
        th {
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-size: 11px;
          font-weight: 700;
          background: #f8fafc;
        }
        .num { text-align: right; }
        .strong { font-weight: 700; }
        .narrative {
          white-space: pre-wrap;
          background: #f8fafc;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 14px 16px;
          font-size: 13px;
        }
        .totals {
          width: 320px;
          margin-left: auto;
          margin-top: 10px;
        }
        .totals td { border-bottom: none; padding: 6px 0; }
        .totals .grand td {
          border-top: 2px solid #0f172a;
          padding-top: 10px;
          font-size: 16px;
          font-weight: 700;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div>
            <div class="title">${escapeHtml(estimate.estimate_number)}</div>
            <div class="subtle">${escapeHtml(orgName)} · Estimate</div>
          </div>
          <div>
            <div class="subtle">Status</div>
            <div class="value strong">${escapeHtml(estimate.status ?? 'draft')}</div>
            <div class="subtle">Valid Until ${formatDate(estimate.valid_until)}</div>
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <div class="label">Aircraft</div>
            <div class="value strong">${escapeHtml(aircraft?.tail_number ?? '—')}</div>
            <div class="subtle">${escapeHtml([aircraft?.make, aircraft?.model].filter(Boolean).join(' '))}</div>
            <div class="subtle">Serial ${escapeHtml(aircraft?.serial_number ?? '—')}</div>
          </div>
          <div class="card">
            <div class="label">Customer</div>
            <div class="value strong">${escapeHtml(customer?.name ?? '—')}</div>
            <div class="subtle">${escapeHtml(customer?.company ?? '')}</div>
            <div class="subtle">${escapeHtml(customer?.email ?? '')}</div>
          </div>
        </div>

        ${(estimate as any).ai_summary ? `
          <div class="section-title">Summary</div>
          <div class="narrative">${escapeHtml((estimate as any).ai_summary)}</div>
        ` : ''}

        ${linkedSquawks.length > 0 ? `
          <div class="section-title">Reported Issues (Squawks)</div>
          <table>
            <thead>
              <tr>
                <th style="width:100px;">Severity</th>
                <th>Issue</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              ${linkedSquawks.map((s: any) => `
                <tr>
                  <td>${escapeHtml(s.severity ?? 'normal')}</td>
                  <td>${escapeHtml(s.title)}</td>
                  <td>${escapeHtml(s.description ?? '—')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}

        <div class="section-title">Line Items</div>
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Description</th>
              <th class="num">Qty/Hrs</th>
              <th class="num">Rate</th>
              <th class="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `
              <tr>
                <td colspan="5">No estimate line items recorded.</td>
              </tr>
            `}
          </tbody>
        </table>

        <table class="totals">
          <tbody>
            <tr><td>Labor</td><td class="num">${formatCurrency(Number(estimate.labor_total ?? 0))}</td></tr>
            <tr><td>Parts</td><td class="num">${formatCurrency(Number(estimate.parts_total ?? 0))}</td></tr>
            <tr><td>Outside Services</td><td class="num">${formatCurrency(Number(estimate.outside_services_total ?? 0))}</td></tr>
            <tr class="grand"><td>Total</td><td class="num">${formatCurrency(Number(estimate.total ?? 0))}</td></tr>
          </tbody>
        </table>

        ${estimate.customer_notes ? `
          <div class="section-title">Customer Scope</div>
          <div class="narrative">${escapeHtml(estimate.customer_notes)}</div>
        ` : ''}

        ${estimate.assumptions ? `
          <div class="section-title">Assumptions</div>
          <div class="narrative">${escapeHtml(estimate.assumptions)}</div>
        ` : ''}

        ${estimate.internal_notes ? `
          <div class="section-title">Internal Notes</div>
          <div class="narrative">${escapeHtml(estimate.internal_notes)}</div>
        ` : ''}
      </div>
    </body>
  </html>`

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `inline; filename="${estimate.estimate_number}.html"`,
      'Cache-Control': 'no-store',
    },
  })
}
