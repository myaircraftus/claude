import { NextRequest, NextResponse } from "next/server";
import { resolveRequestOrgContext } from "@/lib/auth/context";
import { createServerSupabase } from "@/lib/supabase/server";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(_req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
  const orgId = ctx.organizationId;

  const { data: workOrder } = await supabase
    .from("work_orders")
    .select(`
      *,
      customer_complaint:complaint,
      customer_notes:customer_visible_notes,
      total:total_amount,
      aircraft:aircraft_id (id, tail_number, make, model, serial_number, year),
      customer:customer_id (id, name, email, company, billing_address),
      lines:work_order_lines (*),
      checklist:work_order_checklist_items (*),
      thread:thread_id (
        id,
        messages:thread_messages (
          id,
          role,
          content,
          intent,
          metadata,
          created_at
        )
      )
    `)
    .eq("id", params.id)
    .eq("organization_id", orgId)
    .single();

  if (!workOrder) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }

  const lines = ((workOrder.lines ?? []) as any[]).sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
  const checklist = ((workOrder.checklist ?? []) as any[]).sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
  const messages = ((((workOrder.thread as any)?.messages ?? []) as any[]).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  ));

  const lineRows = lines
    .map((line) => {
      const typeLabel =
        line.line_type === "labor"
          ? "Labor"
          : line.line_type === "part"
            ? "Part"
            : line.line_type === "outside_service"
              ? "Outside Service"
              : "Item";
      return `
        <tr>
          <td>${escapeHtml(typeLabel)}</td>
          <td>${escapeHtml(line.description ?? "")}</td>
          <td class="num">${escapeHtml(line.quantity ?? 1)}</td>
          <td class="num">${formatCurrency(Number(line.unit_price ?? 0))}</td>
          <td class="num strong">${formatCurrency(Number(line.line_total ?? 0))}</td>
        </tr>
      `;
    })
    .join("");

  const checklistRows = checklist.length
    ? checklist
        .map(
          (item) => `
            <tr>
              <td>${item.completed ? "Completed" : item.required ? "Required" : "Optional"}</td>
              <td>${escapeHtml(item.template_label ?? item.section ?? "")}</td>
              <td>${escapeHtml(item.item_label ?? "")}</td>
              <td>${escapeHtml(item.source ?? "")}</td>
            </tr>
          `
        )
        .join("")
    : `
      <tr>
        <td colspan="4" class="empty">No checklist items were stored for this work order.</td>
      </tr>
    `;

  const activityRows = messages.length
    ? messages
        .map((message) => {
          const metadata = (message.metadata ?? {}) as Record<string, unknown>;
          const author =
            (typeof metadata.author === "string" && metadata.author) ||
            (message.role === "assistant" ? "AI" : message.role === "system" ? "System" : "Team");
          return `
            <div class="activity-row">
              <div class="activity-meta">
                <span class="strong">${escapeHtml(author)}</span>
                <span>${escapeHtml(message.role)}</span>
                <span>${formatDate(message.created_at)}</span>
              </div>
              <div class="activity-body">${escapeHtml(message.content).replace(/\n/g, "<br />")}</div>
            </div>
          `;
        })
        .join("")
    : `<div class="empty">No recorded work order activity yet.</div>`;

  const html = `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(workOrder.work_order_number)} Work Order</title>
      <style>
        @page { size: letter; margin: 0.65in; }
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
        .status {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 999px;
          background: #e2e8f0;
          color: #0f172a;
          font-size: 12px;
          font-weight: 700;
        }
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
        .activity-row {
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 12px 14px;
          margin-bottom: 10px;
        }
        .activity-meta {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          color: #64748b;
          font-size: 11px;
          margin-bottom: 6px;
        }
        .activity-body {
          font-size: 13px;
          color: #0f172a;
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
        .empty {
          padding: 16px;
          text-align: center;
          color: #64748b;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div>
            <div class="title">${escapeHtml(workOrder.work_order_number)}</div>
            <div class="subtle">${escapeHtml(workOrder.service_type ?? "Maintenance Work Order")}</div>
          </div>
          <div style="text-align:right">
            <div class="status">${escapeHtml(workOrder.status ?? "draft")}</div>
            <div class="subtle" style="margin-top:10px">Opened ${formatDate(workOrder.opened_at ?? workOrder.created_at)}</div>
            <div class="subtle">Closed ${formatDate(workOrder.closed_at)}</div>
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <div class="label">Aircraft</div>
            <div class="value strong">${escapeHtml((workOrder.aircraft as any)?.tail_number ?? "—")}</div>
            <div class="subtle">${escapeHtml([(workOrder.aircraft as any)?.make, (workOrder.aircraft as any)?.model].filter(Boolean).join(" "))}</div>
          </div>
          <div class="card">
            <div class="label">Customer</div>
            <div class="value strong">${escapeHtml((workOrder.customer as any)?.name ?? "—")}</div>
            <div class="subtle">${escapeHtml((workOrder.customer as any)?.company ?? "")}</div>
          </div>
        </div>

        <div class="section-title">Discrepancy / Work Performed</div>
        <div class="narrative">${escapeHtml(
          [
            workOrder.customer_complaint ? `Customer Complaint: ${workOrder.customer_complaint}` : "",
            workOrder.discrepancy ? `Discrepancy: ${workOrder.discrepancy}` : "",
            workOrder.corrective_action ? `Corrective Action: ${workOrder.corrective_action}` : "",
            workOrder.findings ? `Findings: ${workOrder.findings}` : "",
          ]
            .filter(Boolean)
            .join("\n\n")
        )}</div>

        <div class="section-title">Line Items</div>
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Description</th>
              <th class="num">Qty</th>
              <th class="num">Rate</th>
              <th class="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${lineRows || `<tr><td colspan="5" class="empty">No line items recorded.</td></tr>`}
          </tbody>
        </table>

        <table class="totals">
          <tbody>
            <tr><td>Labor</td><td class="num">${formatCurrency(Number(workOrder.labor_total ?? 0))}</td></tr>
            <tr><td>Parts</td><td class="num">${formatCurrency(Number(workOrder.parts_total ?? 0))}</td></tr>
            <tr><td>Outside Services</td><td class="num">${formatCurrency(Number(workOrder.outside_services_total ?? 0))}</td></tr>
            <tr class="grand"><td>Total</td><td class="num">${formatCurrency(Number(workOrder.total ?? 0))}</td></tr>
          </tbody>
        </table>

        <div class="section-title">Checklist</div>
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Section</th>
              <th>Item</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>${checklistRows}</tbody>
        </table>

        <div class="section-title">Activity History</div>
        ${activityRows}
      </div>
    </body>
  </html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${workOrder.work_order_number}.html"`,
    },
  });
}
