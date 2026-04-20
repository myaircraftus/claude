export type UiWorkOrderStatus =
  | "Draft"
  | "Open"
  | "In Progress"
  | "Awaiting Parts"
  | "Awaiting Approval"
  | "Waiting Customer"
  | "Ready for Signoff"
  | "Closed"
  | "Invoice Paid"
  | "Archived";

export const UI_TO_DB_WORK_ORDER_STATUS: Record<UiWorkOrderStatus, string> = {
  Draft: "draft",
  Open: "open",
  "In Progress": "in_progress",
  "Awaiting Parts": "awaiting_parts",
  "Awaiting Approval": "awaiting_approval",
  "Waiting Customer": "waiting_on_customer",
  "Ready for Signoff": "ready_for_signoff",
  Closed: "closed",
  "Invoice Paid": "paid",
  Archived: "archived",
};

const DB_TO_UI_WORK_ORDER_STATUS: Record<string, UiWorkOrderStatus> = {
  draft: "Draft",
  open: "Open",
  in_progress: "In Progress",
  awaiting_parts: "Awaiting Parts",
  awaiting_approval: "Awaiting Approval",
  waiting_on_customer: "Waiting Customer",
  ready_for_signoff: "Ready for Signoff",
  closed: "Closed",
  invoiced: "Invoice Paid",
  paid: "Invoice Paid",
  archived: "Archived",
};

export function toDbWorkOrderStatus(status?: string | null): string {
  if (!status) return "open";
  if (status in UI_TO_DB_WORK_ORDER_STATUS) {
    return UI_TO_DB_WORK_ORDER_STATUS[status as UiWorkOrderStatus];
  }

  const normalized = String(status).trim().toLowerCase().replace(/\s+/g, "_");
  if (normalized === "waiting_customer") return "waiting_on_customer";
  if (normalized === "invoice_paid") return "paid";
  if (normalized === "in_progress") return "in_progress";
  if (normalized === "ready_for_signoff") return "ready_for_signoff";
  if (normalized === "awaiting_parts") return "awaiting_parts";
  if (normalized === "awaiting_approval") return "awaiting_approval";
  if (normalized === "closed") return "closed";
  if (normalized === "archived") return "archived";
  if (normalized === "draft") return "draft";
  return "open";
}

export function toUiWorkOrderStatus(status?: string | null): UiWorkOrderStatus {
  if (!status) return "Open";
  if (status in DB_TO_UI_WORK_ORDER_STATUS) {
    return DB_TO_UI_WORK_ORDER_STATUS[String(status)];
  }
  if (status in UI_TO_DB_WORK_ORDER_STATUS) {
    return status as UiWorkOrderStatus;
  }
  return "Open";
}
