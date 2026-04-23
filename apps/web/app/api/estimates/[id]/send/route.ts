import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import { buildTenantAppUrl } from '@/lib/approvals'
const nodemailer = require('nodemailer')

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function formatDate(date: string | null | undefined): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(date))
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return NextResponse.json(
      { error: 'Email not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.' },
      { status: 503 }
    )
  }

  const ctx = await resolveRequestOrgContext(req, { includeOrganization: true })
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!MECHANIC_AND_ABOVE.includes(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const { data: estimate } = await supabase
    .from('estimates')
    .select(`
      *,
      aircraft:aircraft_id (id, tail_number, make, model, year, serial_number),
      customer:customer_id (id, name, email, company, billing_address),
      organization:organization_id (id, name, slug),
      line_items:estimate_line_items (*)
    `)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (!estimate) return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })

  // Fetch linked squawks for notes section
  const squawkIds: string[] = Array.isArray(estimate.linked_squawk_ids)
    ? estimate.linked_squawk_ids
    : []
  let squawks: any[] = []
  if (squawkIds.length > 0) {
    const { data } = await supabase
      .from('squawks')
      .select('id, title, description, severity')
      .in('id', squawkIds)
    squawks = data ?? []
  }

  let body: any = {}
  try { body = await req.json() } catch {}
  const recipientEmail = body.recipient_email ?? (estimate.customer as any)?.email
  if (!recipientEmail) {
    return NextResponse.json(
      { error: 'No recipient email. Provide recipient_email or set customer email.' },
      { status: 400 }
    )
  }

  const orgName = (estimate.organization as any)?.name ?? 'Your MRO'
  const customer = estimate.customer as any
  const aircraft = estimate.aircraft as any
  const lineItems = ((estimate.line_items ?? []) as any[]).sort(
    (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  )

  const lineItemsHtml = lineItems.map((li: any) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;">${escapeHtml(li.item_type ?? 'service')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;">${escapeHtml(li.description)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;color:#374151;">${escapeHtml(li.hours ?? li.quantity ?? 1)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;color:#374151;">${formatCurrency(Number(li.unit_price ?? 0))}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;font-weight:600;color:#111827;">${formatCurrency(Number(li.line_total ?? 0))}</td>
    </tr>
  `).join('')
  const reviewEstimateUrl = buildTenantAppUrl(
    `/estimates/${estimate.id}`,
    (estimate.organization as any)?.slug ?? ctx.organization?.slug ?? null
  )

  // Squawks notes section
  const squawksSection = squawks.length > 0
    ? `
    <div style="margin-top:24px;padding:16px;background:#fefce8;border:1px solid #fde68a;border-radius:6px;">
      <p style="margin:0 0 8px;font-size:12px;color:#92400e;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">Reported Issues (Squawks)</p>
      ${squawks.map((s: any) => `
        <div style="margin-bottom:6px;">
          <span style="font-size:13px;font-weight:600;color:#111827;">${escapeHtml(s.title)}</span>
          ${s.description ? `<p style="margin:2px 0 0;font-size:12px;color:#6b7280;">${escapeHtml(s.description)}</p>` : ''}
        </div>
      `).join('')}
    </div>`
    : ''

  // AI summary section
  const aiSummarySection = estimate.ai_summary
    ? `
    <div style="margin-top:24px;padding:16px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;">
      <p style="margin:0 0 8px;font-size:12px;color:#0c4a6e;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">Summary</p>
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;white-space:pre-wrap;">${escapeHtml(estimate.ai_summary)}</p>
    </div>`
    : ''

  const html = `
  <!DOCTYPE html>
  <html>
  <body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:640px;margin:0 auto;padding:32px 16px;">
      <div style="background:white;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
        <div style="padding:24px;border-bottom:1px solid #e5e7eb;background:#1e293b;">
          <h1 style="margin:0;font-size:20px;color:white;">Estimate ${escapeHtml(estimate.estimate_number)}</h1>
          <p style="margin:4px 0 0;font-size:14px;color:#94a3b8;">From ${escapeHtml(orgName)}</p>
        </div>

        <div style="padding:24px;">
          <table style="width:100%;margin-bottom:20px;">
            <tr>
              <td style="vertical-align:top;width:50%;">
                <p style="margin:0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Prepared For</p>
                <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#111827;">${escapeHtml(customer?.name ?? 'Customer')}</p>
                ${customer?.company ? `<p style="margin:2px 0 0;font-size:13px;color:#6b7280;">${escapeHtml(customer.company)}</p>` : ''}
              </td>
              <td style="vertical-align:top;text-align:right;">
                ${aircraft ? `<p style="margin:0;font-size:13px;color:#6b7280;">Aircraft: <strong style="color:#111827;">${escapeHtml(aircraft.tail_number)}</strong></p>` : ''}
                ${aircraft?.make ? `<p style="margin:2px 0 0;font-size:12px;color:#6b7280;">${escapeHtml([aircraft.make, aircraft.model].filter(Boolean).join(' '))}</p>` : ''}
                <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Valid Until: <strong style="color:#111827;">${formatDate(estimate.valid_until)}</strong></p>
              </td>
            </tr>
          </table>

          ${squawksSection}

          ${aiSummarySection}

          <h3 style="font-size:14px;font-weight:700;color:#111827;margin:24px 0 10px;">Proposed Work</h3>
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Type</th>
                <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Description</th>
                <th style="padding:8px 12px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Qty/Hrs</th>
                <th style="padding:8px 12px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Rate</th>
                <th style="padding:8px 12px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${lineItemsHtml || '<tr><td colspan="5" style="padding:12px;font-size:13px;color:#6b7280;">No line items.</td></tr>'}
            </tbody>
          </table>

          <table style="width:280px;margin-left:auto;">
            <tr><td style="padding:4px 0;font-size:14px;color:#6b7280;">Labor</td><td style="padding:4px 0;font-size:14px;text-align:right;">${formatCurrency(Number(estimate.labor_total ?? 0))}</td></tr>
            <tr><td style="padding:4px 0;font-size:14px;color:#6b7280;">Parts</td><td style="padding:4px 0;font-size:14px;text-align:right;">${formatCurrency(Number(estimate.parts_total ?? 0))}</td></tr>
            <tr><td style="padding:4px 0;font-size:14px;color:#6b7280;">Outside Services</td><td style="padding:4px 0;font-size:14px;text-align:right;">${formatCurrency(Number(estimate.outside_services_total ?? 0))}</td></tr>
            <tr style="border-top:2px solid #0f172a;">
              <td style="padding:10px 0 4px;font-size:16px;font-weight:700;color:#111827;">Total</td>
              <td style="padding:10px 0 4px;font-size:16px;font-weight:700;text-align:right;color:#111827;">${formatCurrency(Number(estimate.total ?? 0))}</td>
            </tr>
          </table>

          <div style="margin-top:24px;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;text-align:center;">
            <p style="margin:0 0 12px;font-size:14px;color:#166534;">Review this estimate in myaircraft.us to approve or reject it.</p>
            <a href="${reviewEstimateUrl}" style="display:inline-block;padding:12px 28px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
              Review Estimate
            </a>
            <p style="margin:10px 0 0;font-size:13px;color:#4ade80;">Approval will create the work order in the app and notify the shop.</p>
          </div>

          ${estimate.customer_notes ? `
          <div style="margin-top:16px;padding:12px;background:#f9fafb;border-radius:6px;">
            <p style="margin:0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Customer Scope</p>
            <p style="margin:4px 0 0;font-size:13px;color:#374151;">${escapeHtml(estimate.customer_notes)}</p>
          </div>` : ''}
        </div>
      </div>
      <p style="text-align:center;margin-top:20px;font-size:12px;color:#9ca3af;">Sent via myaircraft.us</p>
    </div>
  </body>
  </html>`

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    })

    await transporter.sendMail({
      from: `"${orgName}" <${process.env.GMAIL_USER}>`,
      to: recipientEmail,
      subject: `Estimate ${estimate.estimate_number} from ${orgName} — ${formatCurrency(Number(estimate.total ?? 0))}`,
      html,
    })

    // Mark as sent
    const { data: updated } = await supabase
      .from('estimates')
      .update({
        status: estimate.status === 'draft' ? 'sent' : estimate.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .eq('organization_id', orgId)
      .select()
      .single()

    await supabase.from('audit_logs').insert({
      organization_id: orgId,
      user_id: ctx.user.id,
      action: 'estimate.sent_for_approval',
      entity_type: 'estimate',
      entity_id: params.id,
      metadata_json: {
        recipient_email: recipientEmail,
        estimate_number: estimate.estimate_number,
      },
    })

    return NextResponse.json({ sent: true, estimate: updated })
  } catch (err: any) {
    console.error('[estimate/send] Email error:', err)
    return NextResponse.json({ error: 'Failed to send email: ' + err.message }, { status: 500 })
  }
}
