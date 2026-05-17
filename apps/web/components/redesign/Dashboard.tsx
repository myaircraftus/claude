"use client";

import { useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  Plane,
  Plus,
  Receipt,
  Upload,
  X,
} from "lucide-react";
import Link, { useTenantRouter } from "@/components/shared/tenant-link";
import { CreateWorkOrderModal } from "@/components/work-orders/create-work-order-modal";
import { CreateInvoiceModal } from "@/components/redesign/CreateInvoiceModal";
import {
  useDataStore,
  type Estimate,
  type Invoice,
  type LogbookEntry,
  type WorkOrder,
} from "./workspace/DataStore";

type BadgeTone = "blue" | "green" | "amber" | "red" | "purple" | "slate";
type CreateKind =
  | "squawk"
  | "estimate"
  | "work-order"
  | "invoice"
  | "logbook"
  | "aircraft"
  | "upload";

interface DashboardRecord {
  id: string;
  record: string;
  aircraft: string;
  action: string;
  status: string;
  tone: BadgeTone;
  href: string;
}

interface CreateAction {
  kind: CreateKind;
  title: string;
  description: string;
  rule: string;
  tone: BadgeTone;
  icon: ComponentType<{ className?: string }>;
  href?: string;
}

const CREATE_ACTIONS: CreateAction[] = [
  {
    kind: "squawk",
    title: "Squawk / Discrepancy",
    description: "Fast intake: issue, photo, severity, aircraft.",
    rule: "Creates an aircraft-linked squawk.",
    tone: "red",
    icon: AlertTriangle,
    href: "/squawks",
  },
  {
    kind: "estimate",
    title: "Estimate / Quote",
    description: "Build quote, request approval, collect deposit.",
    rule: "Can convert to work order.",
    tone: "amber",
    icon: DollarSign,
    href: "/estimates",
  },
  {
    kind: "work-order",
    title: "Work Order",
    description: "Create execution workflow from aircraft, estimate, or squawk.",
    rule: "Uses checklist/task setup.",
    tone: "blue",
    icon: ClipboardList,
  },
  {
    kind: "invoice",
    title: "Invoice",
    description: "Create invoice from completed work or standalone sale.",
    rule: "Requires reviewed line items.",
    tone: "green",
    icon: Receipt,
  },
  {
    kind: "logbook",
    title: "Logbook Entry",
    description: "Create maintenance/inspection/AD entry.",
    rule: "Requires aircraft and signer.",
    tone: "purple",
    icon: BookOpen,
    href: "/logbook-entries",
  },
  {
    kind: "aircraft",
    title: "Aircraft",
    description: "Add aircraft profile, owner, times, documents.",
    rule: "Creates master record.",
    tone: "blue",
    icon: Plane,
    href: "/aircraft/new",
  },
  {
    kind: "upload",
    title: "Upload / AI Intake",
    description: "Upload paper WO, PDF, estimate, receipt, logbook.",
    rule: "AI extracts draft records.",
    tone: "slate",
    icon: Upload,
    href: "/costs/intake",
  },
];

const BADGE_TONES: Record<BadgeTone, string> = {
  blue: "bg-blue-50 text-blue-700 border-blue-100",
  green: "bg-emerald-50 text-emerald-700 border-emerald-100",
  amber: "bg-amber-50 text-amber-700 border-amber-100",
  red: "bg-red-50 text-red-700 border-red-100",
  purple: "bg-violet-50 text-violet-700 border-violet-100",
  slate: "bg-slate-100 text-slate-600 border-slate-200",
};

const ICON_TONES: Record<BadgeTone, string> = {
  blue: "bg-blue-50 text-blue-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  purple: "bg-violet-50 text-violet-700",
  slate: "bg-slate-100 text-slate-600",
};

const CARD =
  "rounded-2xl border border-slate-200 bg-white shadow-[0_1px_0_rgba(15,23,42,0.02)]";

function money(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function statusTone(status: string): BadgeTone {
  const normalized = status.toLowerCase();
  if (normalized.includes("blocked") || normalized.includes("overdue") || normalized.includes("rejected")) return "red";
  if (normalized.includes("approval") || normalized.includes("waiting") || normalized.includes("draft")) return "amber";
  if (normalized.includes("ready") || normalized.includes("paid") || normalized.includes("approved")) return "green";
  if (normalized.includes("progress") || normalized.includes("sent") || normalized.includes("open")) return "blue";
  return "slate";
}

function normalizeStatus(status: string) {
  if (!status) return "Open";
  return status.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function isActiveWorkOrder(wo: WorkOrder) {
  return !["Closed", "Invoice Paid", "Archived"].includes(wo.status);
}

function isEstimateWaiting(estimate: Estimate) {
  return ["Draft", "Sent"].includes(estimate.status);
}

function isInvoiceReady(invoice: Invoice) {
  return ["Draft", "Sent", "Overdue"].includes(invoice.status);
}

function createQueueRows(
  workOrders: WorkOrder[],
  estimates: Estimate[],
  invoices: Invoice[],
  logbookEntries: LogbookEntry[],
): DashboardRecord[] {
  const rows: DashboardRecord[] = [];

  workOrders.filter(isActiveWorkOrder).slice(0, 4).forEach((wo) => {
    rows.push({
      id: `wo-${wo.id}`,
      record: wo.woNumber || wo.id.slice(0, 8).toUpperCase(),
      aircraft: wo.aircraft || "Unassigned",
      action: wo.squawk || wo.serviceType || "Work order needs review",
      status: normalizeStatus(wo.status),
      tone: statusTone(wo.status),
      href: `/work-orders/${wo.id}`,
    });
  });

  estimates.filter(isEstimateWaiting).slice(0, 3).forEach((estimate) => {
    rows.push({
      id: `est-${estimate.id}`,
      record: estimate.estimateNumber || estimate.id.slice(0, 8).toUpperCase(),
      aircraft: estimate.aircraft || "Unassigned",
      action: estimate.status === "Sent" ? "Owner approval pending" : "Estimate draft waiting",
      status: estimate.status === "Sent" ? "Approval" : "Draft",
      tone: estimate.status === "Sent" ? "amber" : "slate",
      href: `/estimates/${estimate.id}`,
    });
  });

  invoices.filter(isInvoiceReady).slice(0, 3).forEach((invoice) => {
    rows.push({
      id: `inv-${invoice.id}`,
      record: invoice.invoiceNumber || invoice.id.slice(0, 8).toUpperCase(),
      aircraft: invoice.aircraft || "Unassigned",
      action: invoice.status === "Draft" ? "Invoice ready to review" : "Payment follow-up",
      status: invoice.status,
      tone: statusTone(invoice.status),
      href: `/invoices/${invoice.id}`,
    });
  });

  logbookEntries.filter((entry) => entry.status === "draft").slice(0, 2).forEach((entry) => {
    rows.push({
      id: `log-${entry.id}`,
      record: entry.linkedWO || entry.id.slice(0, 8).toUpperCase(),
      aircraft: entry.aircraft || "Unassigned",
      action: "IA signature required",
      status: "Draft",
      tone: "amber",
      href: `/logbook-entries/${entry.id}`,
    });
  });

  return rows.slice(0, 6);
}

export function Dashboard() {
  const router = useTenantRouter();
  const { aircraft, workOrders, invoices, estimates, logbookEntries } = useDataStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [showWorkOrderModal, setShowWorkOrderModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

  const activeWorkOrders = useMemo(() => workOrders.filter(isActiveWorkOrder), [workOrders]);
  const waitingEstimates = useMemo(() => estimates.filter(isEstimateWaiting), [estimates]);
  const ownerApprovals = useMemo(() => {
    const woApprovals = workOrders.filter((wo) => wo.status === "Awaiting Approval").length;
    const estimateApprovals = estimates.filter((estimate) => estimate.status === "Sent").length;
    return woApprovals + estimateApprovals;
  }, [workOrders, estimates]);
  const billableWorkOrders = useMemo(
    () => workOrders.filter((wo) => ["Ready for Signoff", "Closed"].includes(wo.status) && !wo.linkedInvoice),
    [workOrders],
  );
  const readyInvoiceTotal = billableWorkOrders.reduce((sum, wo) => sum + (wo.grandTotal || 0), 0);
  const estimatesPendingTotal = waitingEstimates.reduce((sum, estimate) => sum + (estimate.total || 0), 0);
  const queueRows = useMemo(
    () => createQueueRows(workOrders, estimates, invoices, logbookEntries),
    [workOrders, estimates, invoices, logbookEntries],
  );

  const riskRows = useMemo(() => {
    const rows = aircraft.map((item) => {
      const tail = item.tail_number;
      const tailWorkOrders = activeWorkOrders.filter((wo) => wo.aircraft === tail);
      const tailEstimates = waitingEstimates.filter((estimate) => estimate.aircraft === tail);
      const tailLogs = logbookEntries.filter((entry) => entry.aircraft === tail && entry.status === "draft");
      const hasUrgentWo = tailWorkOrders.some((wo) =>
        ["Awaiting Approval", "Awaiting Parts", "Waiting Customer"].includes(wo.status),
      );
      const risk: BadgeTone = hasUrgentWo || tailWorkOrders.length >= 3
        ? "red"
        : tailWorkOrders.length > 0 || tailEstimates.length > 0 || tailLogs.length > 0
        ? "amber"
        : "blue";
      const firstContext = tailWorkOrders[0]?.serviceType || tailWorkOrders[0]?.squawk || tailEstimates[0]?.status || "Operational";
      const openItems = [
        tailWorkOrders.length ? `${tailWorkOrders.length} active work order${tailWorkOrders.length === 1 ? "" : "s"}` : null,
        tailEstimates.length ? `${tailEstimates.length} estimate${tailEstimates.length === 1 ? "" : "s"} waiting` : null,
        tailLogs.length ? `${tailLogs.length} draft log entr${tailLogs.length === 1 ? "y" : "ies"}` : null,
      ].filter(Boolean).join(", ") || "No open exceptions";

      return {
        tail,
        openItems,
        context: firstContext,
        riskLabel: risk === "red" ? "High" : risk === "amber" ? "Medium" : "Normal",
        risk,
      };
    });

    return rows
      .sort((a, b) => (a.risk === b.risk ? a.tail.localeCompare(b.tail) : a.risk === "red" ? -1 : b.risk === "red" ? 1 : a.risk === "amber" ? -1 : 1))
      .slice(0, 5);
  }, [aircraft, activeWorkOrders, waitingEstimates, logbookEntries]);

  const revenueRows = useMemo(() => {
    const approvedEstimates = estimates.filter((estimate) => estimate.status === "Approved");
    const draftEstimates = estimates.filter((estimate) => estimate.status === "Draft");
    const readyInvoices = invoices.filter((invoice) => invoice.status === "Draft" || invoice.status === "Sent");
    const today = new Date().toISOString().slice(0, 10);
    const paidToday = invoices.filter((invoice) =>
      invoice.status === "Paid" && (invoice.updatedAt || invoice.issuedDate || "").slice(0, 10) === today,
    );

    return [
      {
        label: "Draft Estimates",
        count: draftEstimates.length,
        amount: draftEstimates.reduce((sum, estimate) => sum + (estimate.total || 0), 0),
        action: "Review",
        href: "/estimates",
      },
      {
        label: "Approved Estimates",
        count: approvedEstimates.length,
        amount: approvedEstimates.reduce((sum, estimate) => sum + (estimate.total || 0), 0),
        action: "Create WO",
        href: "/estimates",
      },
      {
        label: "Ready Invoices",
        count: readyInvoices.length + billableWorkOrders.length,
        amount: readyInvoices.reduce((sum, invoice) => sum + (invoice.total || 0), 0) + readyInvoiceTotal,
        action: "Send",
        href: "/invoices",
      },
      {
        label: "Paid Today",
        count: paidToday.length,
        amount: paidToday.reduce((sum, invoice) => sum + (invoice.amountPaid || invoice.total || 0), 0),
        action: "Receipt",
        href: "/invoices",
      },
    ];
  }, [estimates, invoices, billableWorkOrders, readyInvoiceTotal]);

  const assignmentRows = useMemo(() => {
    const work = activeWorkOrders.slice(0, 4).map((wo) => ({
      id: wo.id,
      task: wo.squawk || wo.serviceType || "Continue work order",
      record: wo.woNumber || wo.id.slice(0, 8).toUpperCase(),
      aircraft: wo.aircraft || "Unassigned",
      status: normalizeStatus(wo.status),
      tone: statusTone(wo.status),
      href: `/work-orders/${wo.id}`,
    }));
    if (work.length > 0) return work;
    return waitingEstimates.slice(0, 4).map((estimate) => ({
      id: estimate.id,
      task: "Owner reply",
      record: estimate.estimateNumber || estimate.id.slice(0, 8).toUpperCase(),
      aircraft: estimate.aircraft || "Unassigned",
      status: estimate.status,
      tone: statusTone(estimate.status),
      href: `/estimates/${estimate.id}`,
    }));
  }, [activeWorkOrders, waitingEstimates]);

  function handleCreate(action: CreateAction) {
    setCreateOpen(false);
    if (action.kind === "work-order") {
      setShowWorkOrderModal(true);
      return;
    }
    if (action.kind === "invoice") {
      setShowInvoiceModal(true);
      return;
    }
    if (action.href) router.push(action.href);
  }

  return (
    <main className="min-h-full bg-[#f4f7fb] px-6 py-7 text-slate-900">
      <div className="mx-auto max-w-[1680px] space-y-6">
        <section className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="text-[34px] font-extrabold leading-none tracking-[0] text-slate-950">
              Dashboard &mdash; Shop Command Center
            </h1>
            <p className="mt-2 text-[15px] text-slate-500">
              Global operating view: current work, approvals, billing, and aircraft risk in one simple place.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/costs/intake"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-[13px] font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
            >
              New Intake
            </Link>
            <button
              type="button"
              onClick={() => setCreateOpen((value) => !value)}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-6 text-[13px] font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create
            </button>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Active Work Orders"
            value={activeWorkOrders.length}
            badge={`${Math.min(activeWorkOrders.length, 4)} due soon`}
            tone="blue"
          />
          <MetricCard
            label="Estimates Waiting"
            value={waitingEstimates.length}
            badge={`${money(estimatesPendingTotal)} pending`}
            tone="amber"
          />
          <MetricCard
            label="Owner Approvals"
            value={ownerApprovals}
            badge={ownerApprovals ? "needs action" : "clear"}
            tone={ownerApprovals ? "red" : "green"}
          />
          <MetricCard
            label="Ready to Invoice"
            value={billableWorkOrders.length}
            badge={`${money(readyInvoiceTotal)} ready`}
            tone="green"
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <DashboardPanel title="Today's Action Queue" subtitle="What needs a human decision now.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-400">
                    <th className="px-0 py-3">Record</th>
                    <th className="px-4 py-3">Aircraft</th>
                    <th className="px-4 py-3">Next Action</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[13px]">
                  {queueRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-9 text-center text-sm text-slate-400">
                        No dashboard exceptions right now.
                      </td>
                    </tr>
                  ) : (
                    queueRows.map((row) => (
                      <tr key={row.id} className="group transition hover:bg-slate-50/70">
                        <td className="py-4 pr-4 font-semibold text-slate-700">
                          <Link href={row.href} className="transition group-hover:text-blue-700">
                            {row.record}
                          </Link>
                        </td>
                        <td className="px-4 py-4 font-medium text-slate-600">{row.aircraft}</td>
                        <td className="px-4 py-4 text-slate-700">{row.action}</td>
                        <td className="px-4 py-4">
                          <Badge tone={row.tone}>{row.status}</Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </DashboardPanel>

          <DashboardPanel title="Aircraft Risk Board" subtitle="Aircraft with operational, compliance, or billing risk.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-400">
                    <th className="px-0 py-3">Tail</th>
                    <th className="px-4 py-3">Open Items</th>
                    <th className="px-4 py-3">Context</th>
                    <th className="px-4 py-3">Risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[13px]">
                  {riskRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-9 text-center text-sm text-slate-400">
                        Add aircraft to start the risk board.
                      </td>
                    </tr>
                  ) : (
                    riskRows.map((row) => (
                      <tr key={row.tail} className="transition hover:bg-slate-50/70">
                        <td className="py-4 pr-4 font-semibold text-slate-700">{row.tail}</td>
                        <td className="px-4 py-4 text-slate-600">{row.openItems}</td>
                        <td className="px-4 py-4 text-slate-700">{row.context}</td>
                        <td className="px-4 py-4">
                          <Badge tone={row.risk}>{row.riskLabel}</Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </DashboardPanel>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <DashboardPanel title="Revenue & Billing Snapshot" subtitle="Commercial pipeline without mixing it into maintenance execution.">
            <div className="space-y-2">
              {revenueRows.map((row) => (
                <Link
                  key={row.label}
                  href={row.href}
                  className="grid grid-cols-[1fr_70px_120px_92px] items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-5 py-3 text-[13px] transition hover:border-blue-200 hover:bg-blue-50/40"
                >
                  <span className="font-semibold text-slate-700">{row.label}</span>
                  <span className="text-center font-medium text-slate-400">{row.count}</span>
                  <span className="text-right font-semibold text-slate-700">{money(row.amount)}</span>
                  <span className="text-right font-semibold text-blue-600">{row.action}</span>
                </Link>
              ))}
            </div>
          </DashboardPanel>

          <DashboardPanel title="My Assignments" subtitle="Personalized to the logged-in mechanic or lead.">
            <div className="space-y-2">
              {assignmentRows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 px-5 py-9 text-center text-sm text-slate-400">
                  No assigned shop work is waiting.
                </div>
              ) : (
                assignmentRows.map((row) => (
                  <Link
                    key={row.id}
                    href={row.href}
                    className="grid grid-cols-[1fr_110px_90px_100px] items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-5 py-3 text-[13px] transition hover:border-blue-200 hover:bg-blue-50/40"
                  >
                    <span className="truncate font-semibold text-slate-700">{row.task}</span>
                    <span className="font-mono text-slate-400">{row.record}</span>
                    <span className="font-semibold text-slate-600">{row.aircraft}</span>
                    <span className="text-right">
                      <Badge tone={row.tone}>{row.status}</Badge>
                    </span>
                  </Link>
                ))
              )}
            </div>
          </DashboardPanel>
        </div>

        <section className={`${CARD} px-6 py-5 text-center text-[15px] text-slate-500`}>
          <strong className="mr-1 text-lg text-slate-900">Dashboard rule:</strong>
          Show exceptions, due items, approvals, and shortcuts. Do not use Dashboard as the permanent record.
          Every card links to its module and to the aircraft timeline.
        </section>
      </div>

      <AnimatePresence>
        {createOpen && (
          <CreateMenu
            actions={CREATE_ACTIONS}
            onClose={() => setCreateOpen(false)}
            onLaunch={handleCreate}
          />
        )}
      </AnimatePresence>

      {showWorkOrderModal && (
        <CreateWorkOrderModal
          aircraft={aircraft.map((item) => ({
            id: item.id,
            tail_number: item.tail_number,
            make: item.make ?? null,
            model: item.model ?? null,
          }))}
          onClose={() => setShowWorkOrderModal(false)}
          onCreated={(id) => {
            setShowWorkOrderModal(false);
            router.push(`/work-orders/${id}`);
          }}
        />
      )}

      {showInvoiceModal && (
        <CreateInvoiceModal
          onClose={() => setShowInvoiceModal(false)}
          onCreated={() => {
            setShowInvoiceModal(false);
          }}
        />
      )}
    </main>
  );
}

function MetricCard({
  label,
  value,
  badge,
  tone,
}: {
  label: string;
  value: number;
  badge: string;
  tone: BadgeTone;
}) {
  return (
    <section className={`${CARD} min-h-[108px] px-6 py-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold text-slate-400">{label}</p>
          <p className="mt-4 text-[34px] font-extrabold leading-none tracking-[0] text-slate-950">{value}</p>
        </div>
        <Badge tone={tone}>{badge}</Badge>
      </div>
    </section>
  );
}

function DashboardPanel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className={`${CARD} min-h-[330px] p-6`}>
      <div className="mb-5">
        <h2 className="text-[24px] font-extrabold leading-none tracking-[0] text-slate-950">{title}</h2>
        <p className="mt-2 text-[13px] font-medium text-slate-400">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  );
}

function CreateMenu({
  actions,
  onClose,
  onLaunch,
}: {
  actions: CreateAction[];
  onClose: () => void;
  onLaunch: (action: CreateAction) => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-40 bg-slate-950/10 backdrop-blur-[1px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.section
        className="absolute right-6 top-20 w-[min(640px,calc(100vw-48px))] rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-900/10"
        initial={{ opacity: 0, y: -12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ duration: 0.18 }}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[24px] font-extrabold leading-none tracking-[0] text-slate-950">Create New</h2>
            <p className="mt-2 text-[13px] font-medium text-slate-400">
              Start from any module. Aircraft can be selected now or required before final save.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close create menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.kind}
                type="button"
                onClick={() => onLaunch(action)}
                className="group grid w-full grid-cols-[44px_1fr_minmax(150px,220px)_18px] items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 text-left transition hover:border-blue-200 hover:bg-blue-50/40"
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-full ${ICON_TONES[action.tone]}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-[14px] font-bold text-slate-800">{action.title}</span>
                  <span className="mt-0.5 block text-[12px] font-medium text-slate-400">{action.description}</span>
                </span>
                <span className="hidden text-[12px] font-semibold text-slate-500 sm:block">{action.rule}</span>
                <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
              </button>
            );
          })}
        </div>

        <div className="mt-4 rounded-xl border border-slate-100 bg-white px-4 py-3 text-[12px] font-medium text-slate-500">
          <CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-500" />
          Official save gate: records must attach to an aircraft or route through aircraft creation first.
        </div>
      </motion.section>
    </motion.div>
  );
}
