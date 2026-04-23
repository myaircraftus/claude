import { withTenantPrefix } from '@/lib/auth/tenant-routing'

const nodemailer = require('nodemailer')

interface ApprovalEmailInput {
  recipientEmail: string | null | undefined
  orgName: string
  tenantSlug?: string | null
  subject: string
  heading: string
  intro: string
  actionLabel: string
  actionPath: string
  detailRows?: Array<{ label: string; value: string | null | undefined }>
  footerNote?: string
}

interface WorkOrderFromEstimateInput {
  supabase: any
  organizationId: string
  estimate: any
  fallbackAssignedMechanicId?: string | null
}

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

function toAbsoluteTenantUrl(pathname: string, tenantSlug?: string | null): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.myaircraft.us').replace(/\/$/, '')
  const tenantPath = withTenantPrefix(pathname.startsWith('/') ? pathname : `/${pathname}`, tenantSlug)
  return `${appUrl}${tenantPath}`
}

export function buildTenantAppUrl(pathname: string, tenantSlug?: string | null): string {
  return toAbsoluteTenantUrl(pathname, tenantSlug)
}

export async function sendOwnerApprovalEmail(input: ApprovalEmailInput): Promise<{ sent: boolean; error?: string }> {
  if (!input.recipientEmail) return { sent: false, error: 'No recipient email' }
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return { sent: false, error: 'Email not configured' }
  }

  const actionUrl = toAbsoluteTenantUrl(input.actionPath, input.tenantSlug)
  const detailsHtml = (input.detailRows ?? [])
    .filter((row) => row.value)
    .map(
      (row) => `
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#6b7280;">${escapeHtml(row.label)}</td>
          <td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;text-align:right;">${escapeHtml(row.value)}</td>
        </tr>
      `
    )
    .join('')

  const html = `
  <!DOCTYPE html>
  <html>
    <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="max-width:640px;margin:0 auto;padding:32px 16px;">
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <div style="padding:24px;background:#0f172a;border-bottom:1px solid #1e293b;">
            <p style="margin:0 0 6px;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Approval requested</p>
            <h1 style="margin:0;font-size:22px;color:#ffffff;">${escapeHtml(input.heading)}</h1>
            <p style="margin:6px 0 0;font-size:14px;color:#cbd5e1;">${escapeHtml(input.orgName)}</p>
          </div>
          <div style="padding:24px;">
            <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#334155;">${escapeHtml(input.intro)}</p>
            ${detailsHtml ? `<table style="width:100%;margin-bottom:20px;">${detailsHtml}</table>` : ''}
            <div style="text-align:center;margin:24px 0;">
              <a href="${actionUrl}" style="display:inline-block;padding:12px 28px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
                ${escapeHtml(input.actionLabel)}
              </a>
            </div>
            <p style="margin:0;font-size:12px;color:#64748b;line-height:1.5;">
              ${escapeHtml(input.footerNote ?? 'Open the app to review the full details and approve or reject.' )}
            </p>
          </div>
        </div>
      </div>
    </body>
  </html>`

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  })

  await transporter.sendMail({
    from: `"${input.orgName}" <${process.env.GMAIL_USER}>`,
    to: input.recipientEmail,
    subject: input.subject,
    html,
  })

  return { sent: true }
}

export async function createWorkOrderFromEstimate({
  supabase,
  organizationId,
  estimate,
  fallbackAssignedMechanicId = null,
}: WorkOrderFromEstimateInput) {
  if (estimate.linked_work_order_id) {
    const { data: existing } = await supabase
      .from('work_orders')
      .select('id, work_order_number, status')
      .eq('id', estimate.linked_work_order_id)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (existing) return existing
  }

  let complaint = estimate.service_type || `Approved estimate ${estimate.estimate_number}`
  const squawkIds: string[] = Array.isArray(estimate.linked_squawk_ids) ? estimate.linked_squawk_ids : []
  if (squawkIds.length > 0) {
    const { data: squawks } = await supabase
      .from('squawks')
      .select('title')
      .in('id', squawkIds)

    const titles = (squawks ?? []).map((s: any) => s.title).filter(Boolean)
    if (titles.length > 0) complaint = titles.join('; ')
  }

  const { count } = await supabase
    .from('work_orders')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)

  const year = new Date().getFullYear()
  const seq = String((count ?? 0) + 1).padStart(4, '0')
  const workOrderNumber = `WO-${year}-${seq}`

  const { data: workOrder, error: workOrderError } = await supabase
    .from('work_orders')
    .insert({
      organization_id: organizationId,
      work_order_number: workOrderNumber,
      aircraft_id: estimate.aircraft_id ?? null,
      customer_id: estimate.customer_id ?? null,
      assigned_mechanic_id: estimate.created_by ?? fallbackAssignedMechanicId ?? null,
      status: 'open',
      service_type: estimate.service_type ?? null,
      complaint,
      discrepancy: complaint,
      customer_visible_notes: estimate.customer_notes ?? null,
      internal_notes: estimate.internal_notes ?? null,
      labor_total: estimate.labor_total ?? 0,
      parts_total: estimate.parts_total ?? 0,
      outside_services_total: estimate.outside_services_total ?? 0,
      total_amount: estimate.total ?? 0,
    })
    .select()
    .single()

  if (workOrderError || !workOrder) {
    throw new Error(workOrderError?.message ?? 'Failed to create work order')
  }

  const lineItems = Array.isArray(estimate.line_items) ? estimate.line_items : []
  if (lineItems.length > 0) {
    const { error: linesError } = await supabase.from('work_order_lines').insert(
      lineItems.map((line: any, index: number) => ({
        work_order_id: workOrder.id,
        organization_id: organizationId,
        line_type: line.item_type === 'service' ? 'labor' : (line.item_type ?? 'labor'),
        description: line.description ?? 'Line item',
        quantity: line.quantity ?? 1,
        unit_price: line.unit_price ?? 0,
        part_number: line.part_number ?? null,
        vendor: line.vendor ?? null,
        condition: line.condition ?? null,
        status: line.line_status ?? 'pending',
        hours: line.hours ?? null,
        rate: line.hours ? line.unit_price ?? null : null,
        sort_order: line.sort_order ?? index,
      }))
    )

    if (linesError) {
      throw new Error(linesError.message)
    }
  }

  return workOrder
}

export function describeEstimateTotal(amount: unknown): string {
  return formatCurrency(Number(amount ?? 0))
}
