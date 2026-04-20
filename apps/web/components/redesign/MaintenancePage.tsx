"use client";

import { useState, useRef, useEffect } from "react";
import {
  Plus, Search, Filter, ChevronDown, Send, Plane, User, Clock,
  Package, Wrench, FileText, Receipt, Sparkles, Camera, Mic,
  Eye, EyeOff, X, Check,
  MessageSquare, Bot, Bell, Download,
  AlarmClock, Layers, RefreshCw,
  CheckCircle, Lock, Timer, StopCircle,
  PlayCircle, Image, Heart, Bookmark, ClipboardCheck, AlertTriangle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useDataStore, type WorkOrder, type Estimate, type ActivityEntry, type Invoice } from "./workspace/DataStore";
import { useAppContext } from "./AppContext";
import { usePartsStore } from "./workspace/PartsStore";
import { CreateWorkOrderModal } from "./CreateWorkOrderModal";
import { CreateEstimateModal } from "./CreateEstimateModal";
import { CreateInvoiceModal } from "./CreateInvoiceModal";
import { getSquawksForAircraft, SEVERITY_COLORS, type Squawk } from "./workspace/squawksData";

/* ─── Status config ─────────────────────────────────────────── */
const WO_STATUS_CONFIG: Record<string, { color: string; dot: string }> = {
  "Draft":             { color: "bg-slate-100 text-slate-600",   dot: "bg-slate-400" },
  "Open":              { color: "bg-blue-50 text-blue-700",      dot: "bg-blue-500" },
  "In Progress":       { color: "bg-indigo-50 text-indigo-700",  dot: "bg-indigo-500" },
  "Awaiting Parts":    { color: "bg-amber-50 text-amber-700",    dot: "bg-amber-500" },
  "Awaiting Approval": { color: "bg-orange-50 text-orange-700",  dot: "bg-orange-500" },
  "Waiting Customer":  { color: "bg-yellow-50 text-yellow-700",  dot: "bg-yellow-500" },
  "Ready for Signoff": { color: "bg-emerald-50 text-emerald-700",dot: "bg-emerald-500" },
  "Closed":            { color: "bg-slate-100 text-slate-500",   dot: "bg-slate-400" },
  "Invoice Paid":      { color: "bg-green-50 text-green-700",    dot: "bg-green-500" },
  "Archived":          { color: "bg-slate-50 text-slate-400",    dot: "bg-slate-300" },
};
const ALL_WO_STATUSES = Object.keys(WO_STATUS_CONFIG) as WorkOrder["status"][];

const EST_STATUS_CONFIG: Record<string, { color: string }> = {
  "Draft":     { color: "bg-slate-100 text-slate-600" },
  "Sent":      { color: "bg-blue-50 text-blue-700" },
  "Approved":  { color: "bg-emerald-50 text-emerald-700" },
  "Rejected":  { color: "bg-red-50 text-red-600" },
  "Converted": { color: "bg-violet-50 text-violet-700" },
};

const INV_STATUS_CONFIG: Record<string, { color: string }> = {
  "Draft":     { color: "bg-slate-100 text-slate-600" },
  "Sent":      { color: "bg-blue-50 text-blue-700" },
  "Paid":      { color: "bg-emerald-50 text-emerald-700" },
  "Overdue":   { color: "bg-red-50 text-red-600" },
  "Cancelled": { color: "bg-slate-100 text-slate-400" },
};

const INV_PAYMENT_CONFIG: Record<string, string> = {
  "Unpaid":  "bg-amber-50 text-amber-700",
  "Partial": "bg-blue-50 text-blue-700",
  "Paid":    "bg-emerald-50 text-emerald-700",
};

/* ─── Seed data ──────────────────────────────────────────────── */
const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();
const minsAgo = (m: number) => new Date(now.getTime() - m * 60000).toISOString();

const SEED_WORK_ORDERS: WorkOrder[] = [];
const SEED_ESTIMATES: Estimate[] = [];
const SEED_INVOICES: Invoice[] = [];

/* ─── Helpers ────────────────────────────────────────────────── */
function formatRelTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

function getAvatarColor(name: string): string {
  const colors = [
    "bg-blue-600", "bg-indigo-600", "bg-violet-600", "bg-emerald-600",
    "bg-amber-600", "bg-rose-600", "bg-teal-600", "bg-primary",
  ];
  const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

/* ── iMessage-style bubble helpers ─────────────────────────────── */
function getBubbleOuter(type: ActivityEntry["type"], visibility: string): string {
  if (visibility === "owner-visible") return "bg-[#2563EB] text-white";
  if (type === "ai-summary") return "bg-[#EFF6FF] text-slate-800 border border-blue-100";
  return "bg-white text-foreground border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.06)]";
}

function getBubbleChip(visibility: string): string {
  if (visibility === "owner-visible") return "bg-white/25 text-white/90";
  return "bg-slate-100 text-slate-600";
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function downloadHtmlArtifact(filename: string, title: string, bodyHtml: string) {
  const html = `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(title)}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          max-width: 860px;
          margin: 0 auto;
          padding: 32px;
          color: #0f172a;
          background: #ffffff;
          line-height: 1.55;
        }
        h1 { font-size: 28px; margin-bottom: 8px; }
        h2 { font-size: 16px; margin: 24px 0 10px; }
        .subtle { color: #64748b; font-size: 13px; margin-bottom: 18px; }
        .card {
          border: 1px solid #dbe2ea;
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 14px;
        }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td {
          padding: 10px 12px;
          border-bottom: 1px solid #e5e7eb;
          text-align: left;
          vertical-align: top;
          font-size: 13px;
        }
        th {
          color: #64748b;
          background: #f8fafc;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          font-size: 11px;
        }
        .num { text-align: right; }
        .strong { font-weight: 700; }
        .pre { white-space: pre-wrap; }
      </style>
    </head>
    <body>
      ${bodyHtml}
    </body>
  </html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type MainTab = "workorders" | "estimates" | "invoices";
type WODetailTab = "activity" | "checklist" | "squawks" | "lineitems" | "media" | "aisummary" | "ownerview" | "logbook" | "invoice";

type WorkOrderChecklistItem = {
  id: string;
  template_key: string;
  template_label: string;
  section: string;
  item_key: string;
  item_label: string;
  item_description?: string | null;
  source: string;
  source_reference?: string | null;
  required: boolean;
  completed: boolean;
  completed_at?: string | null;
  sort_order: number;
};

/* ─── Plus action menu items ─────────────────────────────────── */
const PLUS_ACTIONS = [
  { id: "note", label: "Internal Note", icon: Lock, color: "text-slate-600" },
  { id: "owner-update", label: "Owner Update", icon: Eye, color: "text-emerald-600" },
  { id: "labor", label: "Log Hours", icon: Clock, color: "text-indigo-600" },
  { id: "photo", label: "Upload Photo / Video", icon: Camera, color: "text-violet-600" },
  { id: "part", label: "Add / Request Part", icon: Package, color: "text-amber-600" },
  { id: "approval", label: "Request Approval", icon: CheckCircle, color: "text-orange-600" },
  { id: "timer", label: "Start Timer", icon: Timer, color: "text-blue-600" },
];

/* ═══════════════════════════════════════════════════════════ */
/*  MAIN PAGE                                                   */
/* ═══════════════════════════════════════════════════════════ */
export function MaintenancePage() {
  const { workOrders, updateWorkOrder, addWorkOrderActivity, estimates, convertEstimateToWorkOrder, invoices, updateInvoice, updateEstimate, addLogbookEntry, addInvoice, customers } = useDataStore();
  const { persona, activeMechanic, team } = useAppContext();
  const { searchInventory } = usePartsStore();
  const perm = activeMechanic.permissions;
  // In mechanic persona, apply role-based restrictions
  const isMechanicView = persona === "mechanic";

  const allWOs: WorkOrder[] = workOrders;
  const allEstimates: Estimate[] = estimates;
  const allInvoices: Invoice[] = invoices;

  /* ── UI state ──────────────────────────────────────────── */
  const [mainTab, setMainTab] = useState<MainTab>("workorders");
  const [selectedWOId, setSelectedWOId] = useState<string | null>(null);
  const [selectedEstId, setSelectedEstId] = useState<string | null>(null);
  const [selectedInvId, setSelectedInvId] = useState<string | null>(null);
  const [woDetailTab, setWODetailTab] = useState<WODetailTab>("activity");
  const [filterStatus, setFilterStatus] = useState("all");
  const [woSearch, setWoSearch] = useState("");
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

  /* ── Composer state ────────────────────────────────────── */
  const [composerText, setComposerText] = useState("");
  const [composerVis, setComposerVis] = useState<"internal" | "owner-visible">("internal");
  const [composerType, setComposerType] = useState<ActivityEntry["type"]>("note");
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [logHours, setLogHours] = useState("");
  const [logHoursCategory, setLogHoursCategory] = useState("General");
  const [showLogHours, setShowLogHours] = useState(false);
  const [showAddPart, setShowAddPart] = useState(false);
  const [addPartMode, setAddPartMode] = useState<"search" | "manual">("search");
  const [partSearch, setPartSearch] = useState("");
  const [manualPartPN, setManualPartPN] = useState("");
  const [manualPartDesc, setManualPartDesc] = useState("");
  const [manualPartQty, setManualPartQty] = useState("1");
  const [manualPartCost, setManualPartCost] = useState("");

  /* ── Timer ─────────────────────────────────────────────── */
  const [timerWorkOrderId, setTimerWorkOrderId] = useState<string | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRunning = timerWorkOrderId !== null;

  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => setTimerSeconds((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning]);

  /* ── Close WO flow ─────────────────────────────────────── */
  const [showCloseFlow, setShowCloseFlow] = useState(false);
  const [closeStep, setCloseStep] = useState(1);
  const [closeAISummary, setCloseAISummary] = useState("");
  const [closeGenerating, setCloseGenerating] = useState(false);
  const [closeGenerateLogbook, setCloseGenerateLogbook] = useState(true);
  const [closeCreateInvoice, setCloseCreateInvoice] = useState(true);
  const [closeSendCustomerSummary, setCloseSendCustomerSummary] = useState(true);

  /* ── New WO / Estimate / Invoice modals ───────────────── */
  const [showNewWOModal, setShowNewWOModal] = useState(false);
  const [showNewEstModal, setShowNewEstModal] = useState(false);
  const [showNewInvModal, setShowNewInvModal] = useState(false);
  const [checklistItems, setChecklistItems] = useState<WorkOrderChecklistItem[]>([]);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [checklistSavingId, setChecklistSavingId] = useState<string | null>(null);

  /* ── Command bar ───────────────────────────────────────── */
  const [commandInput, setCommandInput] = useState("");
  const [commandLoading, setCommandLoading] = useState(false);
  const commandRef = useRef<HTMLInputElement>(null);
  const activityEndRef = useRef<HTMLDivElement>(null);

  /* ── Message reactions ─────────────────────────────────────── */
  const [reactions, setReactions] = useState<Record<string, { liked: boolean; saved: boolean }>>({});
  const toggleLike = (id: string) =>
    setReactions(prev => ({ ...prev, [id]: { saved: prev[id]?.saved ?? false, liked: !(prev[id]?.liked) } }));
  const toggleSave = (id: string) =>
    setReactions(prev => ({ ...prev, [id]: { liked: prev[id]?.liked ?? false, saved: !(prev[id]?.saved) } }));

  /* Logbook tab — controlled body text (re-initialized when WO changes) */
  const [logbookBodyText, setLogbookBodyText] = useState("");
  const [logbookDate, setLogbookDate] = useState(new Date().toISOString().split("T")[0]);

  const selectedWO = allWOs.find((w) => w.id === selectedWOId) ?? null;
  const selectedEst = allEstimates.find((e) => e.id === selectedEstId) ?? null;
  const selectedInv = allInvoices.find((i) => i.id === selectedInvId) ?? null;
  const activeTimerWorkOrder = timerWorkOrderId
    ? allWOs.find((workOrder) => workOrder.id === timerWorkOrderId) ?? null
    : null;
  const selectedAssignedMechanicName =
    (selectedWO &&
      (team.find((member) => member.id === selectedWO.assignedMechanicId)?.name ||
        selectedWO.mechanic)) ||
    activeMechanic.name;
  const signingCertificateNumber = activeMechanic.licenseNumber
    ? `${activeMechanic.licenseType} #${activeMechanic.licenseNumber}`
    : activeMechanic.licenseType && activeMechanic.licenseType !== "None"
      ? activeMechanic.licenseType
      : "Certificate on file";

  useEffect(() => {
    activityEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedWO?.activity?.length]);

  // Re-draft logbook body when selected WO changes
  useEffect(() => {
    if (!selectedWO) return;
    const laborHrs = selectedWO.laborLines.reduce((s, l) => s + l.hours, 0);
    setLogbookBodyText(
      `Performed maintenance on ${selectedWO.aircraft} (${selectedWO.makeModel}).\n\n` +
      `${selectedWO.discrepancy || selectedWO.squawk || ""}\n\n` +
      `Corrective action: ${selectedWO.correctiveAction || "Inspection and repair completed per manufacturer's maintenance manual."}\n\n` +
      (selectedWO.partsLines.length > 0
        ? `Parts used: ${selectedWO.partsLines.map((p) => `${p.pn} — ${p.desc}`).join("; ")}.\n\n`
        : "No parts required.\n\n") +
      `Labor: ${laborHrs.toFixed(1)} hours.\n\n` +
      `Aircraft returned to service per FAR 43.9 and 43.11. Aircraft airworthy.`
    );
    setLogbookDate(new Date().toISOString().split("T")[0]);
  }, [selectedWO?.id]);

  useEffect(() => {
    if (!selectedWOId) {
      setChecklistItems([]);
      return;
    }

    let cancelled = false;

    async function loadChecklist() {
      setChecklistLoading(true);
      try {
        const res = await fetch(`/api/work-orders/${selectedWOId}/checklist`);
        const json = await res.json().catch(() => ({ items: [] }));
        if (!res.ok) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        if (!cancelled) {
          setChecklistItems(Array.isArray(json.items) ? json.items : []);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load work order checklist", error);
          setChecklistItems([]);
        }
      } finally {
        if (!cancelled) {
          setChecklistLoading(false);
        }
      }
    }

    loadChecklist();

    return () => {
      cancelled = true;
    };
  }, [selectedWOId]);

  // Auto-select first estimate when switching to estimates tab (or when no valid selection)
  useEffect(() => {
    if (mainTab !== "estimates" || allEstimates.length === 0) return;
    const found = allEstimates.find(e => e.id === selectedEstId);
    if (!found) setSelectedEstId(allEstimates[0].id);
  }, [mainTab, allEstimates.length, selectedEstId]);

  // Auto-select first invoice when switching to invoices tab (or when no valid selection)
  useEffect(() => {
    if (mainTab !== "invoices" || allInvoices.length === 0) return;
    const found = allInvoices.find(i => i.id === selectedInvId);
    if (!found) setSelectedInvId(allInvoices[0].id);
  }, [mainTab, allInvoices.length, selectedInvId]);

  const totalLaborHours = selectedWO
    ? selectedWO.laborLines.reduce((s, l) => s + l.hours, 0) +
      (selectedWO.activity?.filter((a) => a.laborHours).reduce((s, a) => s + (a.laborHours || 0), 0) || 0)
    : 0;
  const requiredChecklistCount = checklistItems.filter((item) => item.required).length;
  const completedRequiredChecklistCount = checklistItems.filter(
    (item) => item.required && item.completed
  ).length;
  const hasIncompleteRequiredChecklist =
    requiredChecklistCount > 0 && completedRequiredChecklistCount < requiredChecklistCount;
  const checklistComplete = checklistItems.length > 0 && !hasIncompleteRequiredChecklist;
  const hasAISummary = Boolean(
    selectedWO?.activity?.some(
      (entry) => entry.type === "ai-summary" && entry.content.trim().length > 0
    )
  );
  const hasLinkedLogbook = Boolean(selectedWO?.linkedLogbookEntry);
  const hasLinkedInvoice = Boolean(selectedWO?.linkedInvoice);
  const relatedSquawks: Squawk[] = (() => {
    if (!selectedWO?.aircraft) return [];
    const aircraftSquawks = getSquawksForAircraft(selectedWO.aircraft);
    const searchTerms = [selectedWO.squawk, selectedWO.discrepancy]
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((term) => term.length >= 4);

    const matched = aircraftSquawks.filter((squawk) => {
      if (squawk.linkedWO && [selectedWO.id, selectedWO.woNumber].includes(squawk.linkedWO)) {
        return true;
      }

      const haystack = `${squawk.title} ${squawk.description}`.toLowerCase();
      return searchTerms.some((term) => haystack.includes(term));
    });

    if (matched.length > 0) {
      return matched;
    }

    if (selectedWO.squawk || selectedWO.discrepancy) {
      return [
        {
          id: `wo-squawk-${selectedWO.id}`,
          title: selectedWO.squawk || selectedWO.serviceType || "Linked squawk",
          description:
            selectedWO.discrepancy ||
            selectedWO.correctiveAction ||
            selectedWO.customerNotes ||
            "This discrepancy is tied directly to the current work order.",
          category: selectedWO.serviceType || "Maintenance",
          severity: selectedWO.status === "Awaiting Approval" ? "High" : "Medium",
          grounded: false,
          status: selectedWO.status === "Closed" ? "Resolved" : "In Progress",
          reportedBy: selectedWO.customer || "Customer",
          reportedByRole: "Owner",
          date: selectedWO.openedDate,
          linkedWO: selectedWO.id,
        },
      ];
    }

    return [];
  })();

  const tabState = {
    checklist: checklistComplete ? "complete" : "pending",
    aisummary: hasAISummary ? "complete" : "pending",
    logbook: hasLinkedLogbook ? "complete" : "pending",
    invoice: hasLinkedInvoice ? "complete" : "pending",
  } as const;

  const appendLaborLine = async (
    workOrder: WorkOrder,
    hours: number,
    category: string
  ) => {
    const normalizedHours = Number(hours.toFixed(2));
    if (normalizedHours <= 0) return;

    const assignedRate =
      team.find((member) => member.id === workOrder.assignedMechanicId)?.rate ??
      activeMechanic.rate;
    const rate = assignedRate > 0 ? assignedRate : 0;
    const laborLine = {
      id: `labor-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      desc: `${category} labor`,
      hours: normalizedHours,
      rate,
      total: Number((normalizedHours * rate).toFixed(2)),
    };

    void updateWorkOrder(workOrder.id, {
      laborLines: [...workOrder.laborLines, laborLine],
      totalLabor: Number((workOrder.totalLabor + laborLine.total).toFixed(2)),
      grandTotal: Number(
        (workOrder.totalLabor + laborLine.total + workOrder.totalParts + workOrder.totalOutside).toFixed(2)
      ),
    });

    if (isSeedItem(workOrder.id) || workOrder.id.startsWith("wo-")) {
      return;
    }

    try {
      const res = await fetch(`/api/work-orders/${workOrder.id}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_type: "labor",
          description: laborLine.desc,
          quantity: normalizedHours,
          unit_price: rate,
          hours: normalizedHours,
          rate,
          status: "n/a",
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
    } catch (error) {
      console.error("Failed to persist labor line", error);
      toast.error("Hours were logged locally, but the labor line could not be saved to the server.");
    }
  };

  const appendPartLine = async (
    workOrder: WorkOrder,
    part: {
      pn: string;
      desc: string;
      qty: number;
      price: number;
      vendor?: string;
      condition?: string;
      status?: WorkOrder["partsLines"][number]["status"];
    }
  ) => {
    const normalizedQty = Number.isFinite(part.qty) ? Math.max(1, Math.round(part.qty)) : 1;
    const normalizedPrice = Number.isFinite(part.price) ? Number(part.price.toFixed(2)) : 0;
    const partLine = {
      id: `part-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      pn: part.pn.trim(),
      desc: part.desc.trim(),
      qty: normalizedQty,
      price: normalizedPrice,
      total: Number((normalizedQty * normalizedPrice).toFixed(2)),
      vendor: part.vendor?.trim() || undefined,
      condition: part.condition?.trim() || undefined,
      status: part.status ?? "Ordered",
    };

    if (!partLine.pn || !partLine.desc) {
      toast.error("Part number and description are required.");
      return;
    }

    void updateWorkOrder(workOrder.id, {
      partsLines: [...workOrder.partsLines, partLine],
      totalParts: Number((workOrder.totalParts + partLine.total).toFixed(2)),
      grandTotal: Number(
        (workOrder.totalLabor + workOrder.totalParts + partLine.total + workOrder.totalOutside).toFixed(2)
      ),
    });

    if (isSeedItem(workOrder.id) || workOrder.id.startsWith("wo-")) {
      return;
    }

    try {
      const res = await fetch(`/api/work-orders/${workOrder.id}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_type: "part",
          description: partLine.desc,
          quantity: normalizedQty,
          unit_price: normalizedPrice,
          part_number: partLine.pn,
          vendor: partLine.vendor ?? null,
          condition: partLine.condition ?? null,
          status: (partLine.status ?? "Ordered").toLowerCase(),
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
    } catch (error) {
      console.error("Failed to persist part line", error);
      toast.error("Part was added locally, but the line item could not be saved to the server.");
    }
  };

  /* ── Actions ───────────────────────────────────────────── */
  const handleCommand = () => {
    if (!commandInput.trim()) return;
    const cmd = commandInput.toLowerCase();
    setCommandLoading(true);
    setTimeout(() => {
      if (/estimate/i.test(cmd)) { setMainTab("estimates"); setShowNewEstModal(true); }
      else if (/work order|new job/i.test(cmd)) { setMainTab("workorders"); setShowNewWOModal(true); }
      else if (/invoice/i.test(cmd)) setMainTab("invoices");
      else if (/awaiting parts/i.test(cmd) && selectedWO) changeWOStatus("Awaiting Parts");
      else if (/summary|summarize/i.test(cmd) && selectedWO) setWODetailTab("aisummary");
      else if (/owner update/i.test(cmd) && selectedWO) { setShowComposer(true); setComposerType("owner-update"); setComposerVis("owner-visible"); }
      else if (/in progress/i.test(cmd) && selectedWO) changeWOStatus("In Progress");
      else if (/close/i.test(cmd) && selectedWO) startCloseFlow();
      setCommandInput(""); setCommandLoading(false);
    }, 500);
  };

  const changeWOStatus = async (s: WorkOrder["status"]) => {
    if (!selectedWO) return;
    if (s === "Closed") {
      setStatusMenuOpen(false);
      startCloseFlow();
      return;
    }
    if (s === "Invoice Paid" && !selectedWO.linkedInvoice) {
      setWODetailTab("invoice");
      toast.error("Create or link an invoice before marking this work order paid.");
      return;
    }

    const old = selectedWO.status;
    const succeeded = await updateWorkOrder(selectedWO.id, { status: s });
    if (!succeeded) {
      toast.error(`Unable to change status to ${s}.`);
      return;
    }

    addWorkOrderActivity(selectedWO.id, {
      type: "status", author: "You", role: "Manager",
      content: `Status changed: ${old} → ${s}`,
      visibility: "internal", timestamp: new Date().toISOString(),
      statusFrom: old, statusTo: s,
    });
    setStatusMenuOpen(false);
  };

  const submitComposer = () => {
    if (!composerText.trim() || !selectedWO) return;
    addWorkOrderActivity(selectedWO.id, {
      type: composerType, author: activeMechanic.name, role: activeMechanic.role,
      content: composerText.trim(), visibility: composerVis,
      timestamp: new Date().toISOString(),
    });
    setComposerText(""); setShowComposer(false);
  };

  const submitLogHours = async () => {
    if (!logHours || !selectedWO) return;
    const hrs = parseFloat(logHours);
    addWorkOrderActivity(selectedWO.id, {
      type: "labor", author: activeMechanic.name, role: activeMechanic.role,
      content: `Logged ${hrs} hrs — ${logHoursCategory}.`, visibility: "internal",
      timestamp: new Date().toISOString(), laborCategory: logHoursCategory,
    });
    await appendLaborLine(selectedWO, hrs, logHoursCategory);
    setLogHours(""); setShowLogHours(false);
  };

  const stopTimerAndLog = async () => {
    const runningWorkOrderId = timerWorkOrderId;
    const runningWorkOrder = allWOs.find((workOrder) => workOrder.id === runningWorkOrderId);
    setTimerWorkOrderId(null);
    const hrs = parseFloat((timerSeconds / 3600).toFixed(2));
    if (hrs > 0 && runningWorkOrderId && runningWorkOrder) {
      addWorkOrderActivity(runningWorkOrderId, {
        type: "labor", author: activeMechanic.name, role: activeMechanic.role,
        content: `Timer stopped — logged ${hrs} hrs.`, visibility: "internal",
        timestamp: new Date().toISOString(), laborCategory: "General",
      });
      await appendLaborLine(runningWorkOrder, hrs, "General");
    }
    setTimerSeconds(0);
  };

  const handlePlusAction = (id: string) => {
    setShowPlusMenu(false);
    if (id === "note") { setComposerType("note"); setComposerVis("internal"); setShowComposer(true); }
    else if (id === "owner-update") { setComposerType("owner-update"); setComposerVis("owner-visible"); setShowComposer(true); }
    else if (id === "labor") { setShowLogHours(true); }
    else if (id === "part") { setShowAddPart(true); }
    else if (id === "approval") { setComposerType("approval"); setComposerVis("owner-visible"); setShowComposer(true); }
    else if (id === "timer" && selectedWO) {
      if (timerWorkOrderId && timerWorkOrderId !== selectedWO.id) {
        toast.error(
          `A timer is already running on ${activeTimerWorkOrder?.woNumber ?? "another work order"}.`
        );
        return;
      }
      if (timerWorkOrderId === selectedWO.id) {
        toast.info("Timer already running for this work order.");
        return;
      }
      setTimerSeconds(0);
      setTimerWorkOrderId(selectedWO.id);
      addWorkOrderActivity(selectedWO.id, {
        type: "system",
        author: "System",
        content: `${activeMechanic.name} started a labor timer.`,
        visibility: "internal",
        timestamp: new Date().toISOString(),
      });
      if (selectedWO.status === "Open") {
        void changeWOStatus("In Progress");
      }
    }
    else if (id === "photo") { setComposerType("media"); setComposerVis("internal"); setShowComposer(true); }
  };

  const startCloseFlow = () => {
    if (hasIncompleteRequiredChecklist) {
      setWODetailTab("checklist");
      toast.error("Finish all required checklist items before closing this work order.");
      return;
    }
    setShowCloseFlow(true);
    setCloseStep(1);
    setCloseGenerateLogbook(true);
    setCloseCreateInvoice(true);
    setCloseSendCustomerSummary(true);
    setCloseGenerating(true);
    setTimeout(() => {
      setCloseAISummary(
        selectedWO
          ? `Work completed on ${selectedWO.aircraft} (${selectedWO.makeModel}) for ${selectedWO.customer}.\n\n**Work performed:** ${selectedWO.discrepancy || selectedWO.squawk}\n\n**Corrective action:** ${selectedWO.correctiveAction || "Inspection and repair completed per maintenance manual."}\n\n**Parts used:** ${selectedWO.partsLines.map((p) => `${p.pn} — ${p.desc}`).join("; ") || "No parts."}\n\n**Labor:** ${totalLaborHours.toFixed(1)} hrs total.\n\n**Aircraft returned to service** in airworthy condition per FAR 43.9 and 43.11.`
          : ""
      );
      setCloseGenerating(false);
    }, 1600);
  };

  async function toggleChecklistItem(itemId: string, completed: boolean) {
    if (!selectedWOId) return;

    const previousItems = checklistItems;
    setChecklistSavingId(itemId);
    setChecklistItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              completed,
              completed_at: completed ? new Date().toISOString() : null,
            }
          : item
      )
    );

    try {
      const res = await fetch(`/api/work-orders/${selectedWOId}/checklist/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      if (json.item) {
        setChecklistItems((current) =>
          current.map((item) => (item.id === itemId ? { ...item, ...json.item } : item))
        );
      }
    } catch (error) {
      console.error("Failed to update checklist item", error);
      setChecklistItems(previousItems);
      toast.error(error instanceof Error ? error.message : "Failed to update checklist item.");
    } finally {
      setChecklistSavingId(null);
    }
  }

  const filteredWOs = allWOs.filter((w) => {
    const q = woSearch.toLowerCase();
    return (
      (!q || w.woNumber.toLowerCase().includes(q) || w.aircraft.toLowerCase().includes(q) || w.customer.toLowerCase().includes(q)) &&
      (filterStatus === "all" || w.status === filterStatus)
    );
  });

  const woStats = {
    active: allWOs.filter((w) => ["Open", "In Progress"].includes(w.status)).length,
    parts: allWOs.filter((w) => w.status === "Awaiting Parts").length,
    approval: allWOs.filter((w) => ["Awaiting Approval", "Waiting Customer"].includes(w.status)).length,
    signoff: allWOs.filter((w) => w.status === "Ready for Signoff").length,
  };

  /* ── Seed item check ────────────────────────────────────── */
  const isSeedItem = (_id: string) => false;

  const getCustomerEmail = (customerName: string) =>
    customers.find((customer) => customer.name.trim().toLowerCase() === customerName.trim().toLowerCase())?.email ?? "";

  const openInvoicePdf = (invoiceId: string) => {
    if (typeof window === "undefined") return;
    window.open(`/api/invoices/${invoiceId}/pdf`, "_blank", "noopener,noreferrer");
  };

  const openWorkOrderPdf = (workOrder: WorkOrder) => {
    if (typeof window === "undefined") return;
    if (!workOrder.id.startsWith("wo-")) {
      window.open(`/api/work-orders/${workOrder.id}/pdf`, "_blank", "noopener,noreferrer");
      return;
    }

    downloadHtmlArtifact(
      `${workOrder.woNumber}.html`,
      `${workOrder.woNumber} Work Order`,
      `
        <h1>${escapeHtml(workOrder.woNumber)}</h1>
        <div class="subtle">${escapeHtml(workOrder.aircraft)} · ${escapeHtml(workOrder.makeModel)} · ${escapeHtml(workOrder.customer)}</div>
        <div class="card">
          <h2>Work Performed</h2>
          <div class="pre">${escapeHtml(
            [workOrder.discrepancy || workOrder.squawk, workOrder.correctiveAction, workOrder.findings]
              .filter(Boolean)
              .join("\n\n")
          )}</div>
        </div>
        <div class="card">
          <h2>Totals</h2>
          <table>
            <tbody>
              <tr><td>Labor</td><td class="num">${workOrder.totalLabor.toFixed(2)}</td></tr>
              <tr><td>Parts</td><td class="num">${workOrder.totalParts.toFixed(2)}</td></tr>
              <tr><td>Outside Services</td><td class="num">${workOrder.totalOutside.toFixed(2)}</td></tr>
              <tr><td class="strong">Grand Total</td><td class="num strong">${workOrder.grandTotal.toFixed(2)}</td></tr>
            </tbody>
          </table>
        </div>
      `
    );
  };

  const downloadEstimatePdf = (estimate: Estimate) => {
    if (!estimate.id.startsWith("est-")) {
      window.open(`/api/estimates/${estimate.id}/pdf`, "_blank", "noopener,noreferrer");
      return;
    }
    downloadHtmlArtifact(
      `${estimate.estimateNumber}.html`,
      `${estimate.estimateNumber} Estimate`,
      `
        <h1>${escapeHtml(estimate.estimateNumber)}</h1>
        <div class="subtle">${escapeHtml(estimate.aircraft)} · ${escapeHtml(estimate.makeModel)} · ${escapeHtml(estimate.customer)}</div>
        <div class="card">
          <h2>Status</h2>
          <div>${escapeHtml(estimate.status)}</div>
        </div>
        <div class="card">
          <h2>Labor</h2>
          <table>
            <thead><tr><th>Description</th><th class="num">Hours</th><th class="num">Amount</th></tr></thead>
            <tbody>
              ${estimate.laborLines.map((line) => `
                <tr>
                  <td>${escapeHtml(line.desc)}</td>
                  <td class="num">${line.hours.toFixed(1)}</td>
                  <td class="num">${line.total.toFixed(2)}</td>
                </tr>
              `).join("") || `<tr><td colspan="3">No labor lines recorded.</td></tr>`}
            </tbody>
          </table>
          ${
            estimate.partsLines.length > 0
              ? `
                <h2>Parts</h2>
                <table>
                  <thead><tr><th>Description</th><th>Part Number</th><th class="num">Amount</th></tr></thead>
                  <tbody>
                    ${estimate.partsLines.map((line) => `
                      <tr>
                        <td>${escapeHtml(line.desc)}</td>
                        <td>${escapeHtml(line.pn)}</td>
                        <td class="num">${line.total.toFixed(2)}</td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              `
              : ""
          }
        </div>
        <div class="card">
          <h2>Total</h2>
          <div class="strong">$${estimate.total.toFixed(2)}</div>
          ${estimate.assumptions ? `<div class="subtle pre" style="margin-top:10px">${escapeHtml(estimate.assumptions)}</div>` : ""}
        </div>
      `
    );
  };

  const downloadCurrentLogbookDraft = () => {
    if (!selectedWO) return;
    downloadHtmlArtifact(
      `${selectedWO.woNumber}-logbook-entry.html`,
      `${selectedWO.woNumber} Logbook Entry`,
      `
        <h1>Logbook Entry</h1>
        <div class="subtle">${escapeHtml(selectedWO.aircraft)} · ${escapeHtml(selectedWO.makeModel)} · ${escapeHtml(logbookDate)}</div>
        <div class="card">
          <h2>Entry Text</h2>
          <div class="pre">${escapeHtml(logbookBodyText)}</div>
        </div>
        <div class="card">
          <h2>Certificate of Return to Service</h2>
          <div><span class="strong">Mechanic:</span> ${escapeHtml(activeMechanic.name)}</div>
          <div><span class="strong">Certificate #:</span> ${escapeHtml(signingCertificateNumber)}</div>
        </div>
      `
    );
  };

  const emailCurrentLogbookDraft = () => {
    if (typeof window === "undefined" || !selectedWO) return;
    const recipient = getCustomerEmail(selectedWO.customer);
    const subject = encodeURIComponent(`Logbook entry draft for ${selectedWO.aircraft}`);
    const body = encodeURIComponent(logbookBodyText);
    window.location.href = `mailto:${recipient}?subject=${subject}&body=${body}`;
  };

  const sendInvoiceToCustomer = async (invoice: Invoice) => {
    if (isSeedItem(invoice.id)) {
      toast.info("Demo invoice — create your own invoices to send them.");
      return false;
    }
    if (invoice.id.startsWith("inv-")) {
      updateInvoice(invoice.id, { status: "Sent" });
      toast.success(`${invoice.invoiceNumber} marked as Sent while it finishes saving.`);
      return true;
    }

    try {
      const recipientEmail = getCustomerEmail(invoice.customer);
      const res = await fetch(`/api/invoices/${invoice.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipientEmail ? { recipient_email: recipientEmail } : {}),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error ?? "Failed to send invoice.");
        return false;
      }
      updateInvoice(invoice.id, { status: "Sent" });
      toast.success(`${invoice.invoiceNumber} emailed to ${invoice.customer}.`);
      return true;
    } catch (error) {
      console.error("Failed to send invoice", error);
      toast.error("Failed to send invoice.");
      return false;
    }
  };

  /* ── Invoice helpers ─────────────────────────────────────── */
  const handleMarkInvoicePaid = (inv: Invoice) => {
    if (isSeedItem(inv.id)) { toast.info("Demo invoice — create your own invoices to mark payment."); return; }
    updateInvoice(inv.id, { paymentStatus: "Paid", status: "Paid", amountPaid: inv.total });
    toast.success(`${inv.invoiceNumber} marked as Paid — $${inv.total.toFixed(2)} collected.`);
  };
  const handleSendInvoice = (inv: Invoice) => {
    void sendInvoiceToCustomer(inv);
  };

  /* ── WO Invoice tab — create + send/pay from WO data ────── */
  const buildInvoiceFromWO = (
    wo: WorkOrder,
    status: Invoice["status"],
    paymentStatus: Invoice["paymentStatus"],
    onPersisted?: (persistedInvoice: Invoice) => void
  ) => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);
    return addInvoice(
      {
        invoiceNumber: `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
        aircraft: wo.aircraft,
        customer: wo.customer,
        company: wo.company || "",
        issuedDate: new Date().toISOString(),
        dueDate: dueDate.toISOString(),
        status,
        laborLines: wo.laborLines,
        partsLines: wo.partsLines,
        outsideServices: wo.outsideServices,
        subtotalLabor: wo.totalLabor,
        subtotalParts: wo.totalParts,
        subtotalOutside: wo.totalOutside,
        taxRate: 0,
        tax: 0,
        shipping: 0,
        total: wo.grandTotal,
        notes: `Work order ${wo.woNumber} — ${wo.squawk}`,
        paymentStatus,
        amountPaid: paymentStatus === "Paid" ? wo.grandTotal : 0,
        linkedWorkOrder: wo.id,
      },
      {
        onPersisted: (persistedInvoice) => {
          void updateWorkOrder(wo.id, { linkedInvoice: persistedInvoice.id });
          onPersisted?.(persistedInvoice);
        },
      }
    );
  };

  const handleSendWOInvoice = () => {
    if (!selectedWO) return;
    // If WO already has a linked (non-seed) invoice, just send it and navigate
    if (selectedWO.linkedInvoice) {
      const existing = allInvoices.find(i => i.id === selectedWO.linkedInvoice);
      if (existing && !isSeedItem(existing.id)) {
        void (async () => {
          const sent = await sendInvoiceToCustomer(existing);
          if (!sent) return;
          setMainTab("invoices");
          setSelectedInvId(existing.id);
          addWorkOrderActivity(selectedWO.id, {
            type: "owner-update",
            author: activeMechanic.name,
            role: activeMechanic.role,
            content: `Invoice ${existing.invoiceNumber} sent to ${selectedWO.customer}.`,
            visibility: "owner-visible",
            timestamp: new Date().toISOString(),
          });
        })();
        return;
      }
    }
    // Create new invoice from WO, mark as Sent, navigate
    const newInv = buildInvoiceFromWO(selectedWO, "Sent", "Unpaid", (persistedInvoice) => {
      void sendInvoiceToCustomer(persistedInvoice);
    });
    void updateWorkOrder(selectedWO.id, { linkedInvoice: newInv.id });
    setMainTab("invoices");
    setSelectedInvId(newInv.id);
    addWorkOrderActivity(selectedWO.id, {
      type: "owner-update",
      author: activeMechanic.name,
      role: activeMechanic.role,
      content: `Invoice ${newInv.invoiceNumber} sent to ${selectedWO.customer}.`,
      visibility: "owner-visible",
      timestamp: new Date().toISOString(),
    });
    toast.success(`${newInv.invoiceNumber} created for ${selectedWO.customer}.`, {
      description: `We’re sending it and tracking a balance of $${selectedWO.grandTotal.toFixed(2)}.`
    });
  };

  const handleMarkWOInvoicePaid = () => {
    if (!selectedWO) return;
    if (selectedWO.linkedInvoice) {
      const existing = allInvoices.find(i => i.id === selectedWO.linkedInvoice);
      if (existing && !isSeedItem(existing.id)) {
        updateInvoice(existing.id, { paymentStatus: "Paid", status: "Paid", amountPaid: existing.total });
        void updateWorkOrder(selectedWO.id, { status: "Invoice Paid" });
        setMainTab("invoices");
        setSelectedInvId(existing.id);
        addWorkOrderActivity(selectedWO.id, {
          type: "owner-update",
          author: activeMechanic.name,
          role: activeMechanic.role,
          content: `Payment received for ${existing.invoiceNumber}.`,
          visibility: "owner-visible",
          timestamp: new Date().toISOString(),
        });
        toast.success(`${existing.invoiceNumber} marked as Paid — $${existing.total.toFixed(2)} collected.`);
        return;
      }
    }
    const newInv = buildInvoiceFromWO(selectedWO, "Paid", "Paid");
    void updateWorkOrder(selectedWO.id, { linkedInvoice: newInv.id, status: "Invoice Paid" });
    setMainTab("invoices");
    setSelectedInvId(newInv.id);
    addWorkOrderActivity(selectedWO.id, {
      type: "owner-update",
      author: activeMechanic.name,
      role: activeMechanic.role,
      content: `Payment received for ${newInv.invoiceNumber}.`,
      visibility: "owner-visible",
      timestamp: new Date().toISOString(),
    });
    toast.success(`${newInv.invoiceNumber} created and marked Paid — $${selectedWO.grandTotal.toFixed(2)} collected.`);
  };

  /* ── Estimate helpers ────────────────────────────────────── */
  const handleSendEstimate = (est: Estimate) => {
    if (isSeedItem(est.id)) { toast.info("Demo estimate — create your own to manage status."); return; }
    updateEstimate(est.id, { status: "Sent" });
    toast.success(`${est.estimateNumber} sent to customer.`);
  };
  const handleApproveEstimate = (est: Estimate) => {
    if (isSeedItem(est.id)) { toast.info("Demo estimate — create your own to approve it."); return; }
    updateEstimate(est.id, { status: "Approved" });
    toast.success(`${est.estimateNumber} approved — ready to create a work order.`);
  };
  const handleRejectEstimate = (est: Estimate) => {
    if (isSeedItem(est.id)) { toast.info("Demo estimate — create your own to manage status."); return; }
    updateEstimate(est.id, { status: "Rejected" });
    toast.warning(`${est.estimateNumber} marked as Rejected.`);
  };

  /* ── Parts search ─────────────────────────────────── */
  const filteredParts = searchInventory(partSearch)
    .map((part) => ({
      pn: part.pn,
      desc: part.desc,
      price: part.ourRate || part.costPrice || 0,
      vendor: part.vendor,
      stock: `${part.qtyInStock} in stock`,
      condition: part.condition,
    }))
    .filter(
      (part) =>
        !partSearch ||
        part.pn.toLowerCase().includes(partSearch.toLowerCase()) ||
        part.desc.toLowerCase().includes(partSearch.toLowerCase())
    )
    .slice(0, 12);

  /* ──────────────────────────────────────────────────────── */
  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#F7F8FA]">

      {/* Command Bar */}
      

      <div className="flex-1 flex min-h-0">
        {/* LEFT PANEL */}
        <div className="w-[290px] shrink-0 border-r border-border flex flex-col bg-white">
          {/* Tab switcher */}
          <div className="flex border-b border-border shrink-0">
            {(["workorders", "estimates", "invoices"] as MainTab[]).map((t) => {
              const labels: Record<MainTab, string> = { workorders: "Work Orders", estimates: "Estimates", invoices: "Invoices" };
              const counts: Record<MainTab, number> = { workorders: allWOs.length, estimates: allEstimates.length, invoices: allInvoices.length };
              return (
                <button key={t} onClick={() => setMainTab(t)}
                  className={`flex-1 px-2 py-2.5 text-[11px] border-b-2 transition-colors ${mainTab === t ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                  style={{ fontWeight: mainTab === t ? 700 : 500 }}>
                  {labels[t]}
                  {counts[t] > 0 && <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${mainTab === t ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{counts[t]}</span>}
                </button>
              );
            })}
          </div>

          {/* WO stats mini row */}
          {mainTab === "workorders" && (
            <div className="grid grid-cols-4 border-b border-border shrink-0">
              {[{ l: "Active", v: woStats.active, c: "text-blue-600" }, { l: "Parts", v: woStats.parts, c: "text-amber-600" }, { l: "Approval", v: woStats.approval, c: "text-orange-600" }, { l: "Signoff", v: woStats.signoff, c: "text-emerald-600" }].map((s) => (
                <div key={s.l} className="px-2 py-2 text-center">
                  <div className={`text-[15px] ${s.c}`} style={{ fontWeight: 700 }}>{s.v}</div>
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{s.l}</div>
                </div>
              ))}
            </div>
          )}

          {/* Search */}
          {mainTab === "workorders" && (
            <div className="px-3 py-2.5 border-b border-border shrink-0 space-y-2">
              <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-2.5 py-1.5">
                <Search className="w-3.5 h-3.5 text-muted-foreground" />
                <input value={woSearch} onChange={(e) => setWoSearch(e.target.value)} placeholder="Search WO, aircraft, customer..." className="flex-1 bg-transparent text-[12px] outline-none" />
              </div>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full text-[11px] bg-white border border-border rounded-lg px-2 py-1.5 outline-none cursor-pointer">
                <option value="all">All Statuses</option>
                {ALL_WO_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          )}

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {mainTab === "workorders" && filteredWOs.map((wo) => {
              const cfg = WO_STATUS_CONFIG[wo.status] ?? WO_STATUS_CONFIG["Draft"];
              const active = wo.id === selectedWOId;
              return (
                <button key={wo.id} onClick={() => { setSelectedWOId(wo.id); setWODetailTab("activity"); }}
                  className={`w-full text-left px-4 py-3.5 border-b border-border hover:bg-muted/20 transition-colors ${active ? "bg-primary/5 border-l-[3px] border-l-primary" : ""}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] text-primary" style={{ fontWeight: 700 }}>{wo.woNumber}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1 ${cfg.color}`} style={{ fontWeight: 600 }}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{wo.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mb-1">{wo.aircraft} · {wo.customer}</div>
                  <div className="text-[11px] text-foreground truncate" style={{ fontWeight: 500 }}>{wo.squawk || "No squawk"}</div>
                  {typeof wo.progress === "number" && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${wo.progress}%` }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{wo.progress}%</span>
                    </div>
                  )}
                </button>
              );
            })}

            {/* Estimates list */}
            {mainTab === "estimates" && allEstimates.map((est) => {
              const cfg = EST_STATUS_CONFIG[est.status] ?? EST_STATUS_CONFIG["Draft"];
              const active = est.id === selectedEstId;
              const daysAgoStr = est.createdAt ? Math.floor((Date.now() - new Date(est.createdAt).getTime()) / 86400000) + "d ago" : "";
              return (
                <button key={est.id} onClick={() => setSelectedEstId(est.id)}
                  className={`w-full text-left px-4 py-3.5 border-b border-border hover:bg-muted/20 transition-colors ${active ? "bg-primary/5 border-l-[3px] border-l-primary" : ""}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] text-primary" style={{ fontWeight: 700 }}>{est.estimateNumber}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${cfg.color}`} style={{ fontWeight: 600 }}>{est.status}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mb-0.5">{est.aircraft} · {est.customer}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>${est.total.toLocaleString()}</span>
                    <span className="text-[10px] text-muted-foreground">{daysAgoStr}</span>
                  </div>
                </button>
              );
            })}
            {mainTab === "estimates" && allEstimates.length === 0 && (
              <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">No estimates yet</div>
            )}

            {/* Invoices list */}
            {mainTab === "invoices" && allInvoices.map((inv) => {
              const cfg = INV_STATUS_CONFIG[inv.status] ?? INV_STATUS_CONFIG["Draft"];
              const active = inv.id === selectedInvId;
              return (
                <button key={inv.id} onClick={() => setSelectedInvId(inv.id)}
                  className={`w-full text-left px-4 py-3.5 border-b border-border hover:bg-muted/20 transition-colors ${active ? "bg-primary/5 border-l-[3px] border-l-primary" : ""}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] text-primary" style={{ fontWeight: 700 }}>{inv.invoiceNumber}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${cfg.color}`} style={{ fontWeight: 600 }}>{inv.status}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mb-1">{inv.aircraft} · {inv.customer}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>${inv.total.toFixed(2)}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${INV_PAYMENT_CONFIG[inv.paymentStatus] ?? "bg-slate-100 text-slate-500"}`} style={{ fontWeight: 600 }}>
                      {inv.paymentStatus}
                    </span>
                  </div>
                </button>
              );
            })}
            {mainTab === "invoices" && allInvoices.length === 0 && (
              <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">No invoices yet</div>
            )}
          </div>

          {/* Bottom action button */}
          <div className="shrink-0 border-t border-border p-3">
            {mainTab === "workorders" && (
              <button onClick={() => setShowNewWOModal(true)}
                className="w-full flex items-center justify-center gap-2 bg-[#0A1628] text-white py-2.5 rounded-xl text-[13px] hover:bg-[#0A1628]/90 transition-colors"
                style={{ fontWeight: 600 }}>
                <Plus className="w-4 h-4" /> New Work Order
              </button>
            )}
            {mainTab === "estimates" && (
              <button onClick={() => setShowNewEstModal(true)}
                className="w-full flex items-center justify-center gap-2 bg-[#0A1628] text-white py-2.5 rounded-xl text-[13px] hover:bg-[#0A1628]/90 transition-colors"
                style={{ fontWeight: 600 }}>
                <Plus className="w-4 h-4" /> New Estimate
              </button>
            )}
            {mainTab === "invoices" && (
              <button onClick={() => setShowNewInvModal(true)}
                className="w-full flex items-center justify-center gap-2 bg-[#0A1628] text-white py-2.5 rounded-xl text-[13px] hover:bg-[#0A1628]/90 transition-colors"
                style={{ fontWeight: 600 }}>
                <Plus className="w-4 h-4" /> New Invoice
              </button>
            )}
          </div>
        </div>

        {/* RIGHT DETAIL PANEL */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <AnimatePresence mode="wait">

            {/* ── WORK ORDER DETAIL ─────────────────────────────── */}
            {mainTab === "workorders" && selectedWO && (
              <motion.div key={selectedWO.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col min-h-0">

                {/* WO Header — clean and minimal */}
                <div className="shrink-0 bg-white border-b border-border px-5 pt-4 pb-0">

                  {/* Row 1: identifier + status + progress + actions */}
                  <div className="flex items-center gap-3 mb-2.5">
                    <h2 className="text-[15px] text-foreground tracking-tight" style={{ fontWeight: 700 }}>{selectedWO.woNumber}</h2>

                    {/* Status dropdown */}
                    <div className="relative">
                      <button onClick={() => setStatusMenuOpen(!statusMenuOpen)}
                        className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full ${WO_STATUS_CONFIG[selectedWO.status]?.color} hover:opacity-80 transition-opacity`}
                        style={{ fontWeight: 600 }}>
                        <span className={`w-1.5 h-1.5 rounded-full ${WO_STATUS_CONFIG[selectedWO.status]?.dot}`} />
                        {selectedWO.status}
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      <AnimatePresence>
                        {statusMenuOpen && (
                          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                            className="absolute left-0 top-full mt-1 w-52 bg-white border border-border rounded-xl shadow-xl z-50 py-1 overflow-hidden">
                            {ALL_WO_STATUSES.map((s) => (
                              <button key={s} onClick={() => changeWOStatus(s)}
                                className={`w-full text-left px-3 py-2 text-[12px] hover:bg-muted/50 flex items-center gap-2 transition-colors ${s === selectedWO.status ? "bg-primary/5" : ""}`}
                                style={{ fontWeight: s === selectedWO.status ? 600 : 400 }}>
                                <span className={`w-2 h-2 rounded-full ${WO_STATUS_CONFIG[s]?.dot}`} />
                                {s}
                                {s === selectedWO.status && <Check className="w-3 h-3 ml-auto text-primary" />}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {typeof selectedWO.progress === "number" && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-20 h-1 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${selectedWO.progress}%` }} />
                        </div>
                        <span className="text-[11px] text-muted-foreground">{selectedWO.progress}%</span>
                      </div>
                    )}

                    <div className="ml-auto flex items-center gap-1.5">
                      {timerRunning && activeTimerWorkOrder && activeTimerWorkOrder.id !== selectedWO.id && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 text-[11px]" style={{ fontWeight: 600 }}>
                          <Timer className="w-3.5 h-3.5" /> Timer on {activeTimerWorkOrder.woNumber}
                        </div>
                      )}

                      <button
                        onClick={() => openWorkOrderPdf(selectedWO)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] text-muted-foreground hover:bg-muted/40 transition-colors"
                        style={{ fontWeight: 500 }}>
                        <Download className="w-3.5 h-3.5" /> Download WO
                      </button>

                      {(!isMechanicView || perm.woCloseWO) && (
                        <button onClick={startCloseFlow}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A1628] text-white text-[12px] hover:bg-[#0A1628]/90 transition-colors" style={{ fontWeight: 500 }}>
                          <CheckCircle className="w-3.5 h-3.5" /> Close WO
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Row 2: meta — inline, compact, dot-separated */}
                  <div className="flex items-center gap-2 mb-3 text-[12px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Plane className="w-3 h-3" />{selectedWO.aircraft}</span>
                    <span className="opacity-30">·</span>
                    <span>{selectedWO.makeModel.split(" ").slice(0, 3).join(" ")}</span>

                    {/* Info icon with hover popover */}
                    <div className="relative group ml-0.5">
                      <button className="w-4 h-4 rounded-full border border-muted-foreground/40 text-muted-foreground/60 flex items-center justify-center hover:border-primary hover:text-primary transition-colors text-[10px]" style={{ fontWeight: 700, lineHeight: 1 }}>
                        i
                      </button>
                      {/* Popover */}
                      <div className="absolute left-0 bottom-full mb-2 z-50 w-64 bg-white border border-border rounded-xl shadow-xl p-3 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-150 -translate-y-1 group-hover:translate-y-0">
                        <div className="absolute -bottom-1.5 left-3 w-3 h-3 bg-white border-r border-b border-border rotate-45" />
                        <div className="flex flex-col gap-2 text-[12px]">
                          <div className="flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="text-muted-foreground">Company</span>
                            <span className="ml-auto text-foreground" style={{ fontWeight: 500 }}>{selectedWO.customer}</span>
                          </div>
                          <div className="h-px bg-border" />
                          <div className="flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="text-muted-foreground">Assigned</span>
                            <span className="ml-auto text-foreground" style={{ fontWeight: 500 }}>
                              {selectedAssignedMechanicName}
                            </span>
                          </div>
                          <div className="h-px bg-border" />
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="text-muted-foreground">Hours</span>
                            <span className="ml-auto text-foreground" style={{ fontWeight: 500 }}>{totalLaborHours.toFixed(1)} hrs</span>
                          </div>
                          {selectedWO.targetDate && (
                            <>
                              <div className="h-px bg-border" />
                              <div className="flex items-center gap-2">
                                <AlarmClock className="w-3.5 h-3.5 shrink-0" style={{ color: new Date(selectedWO.targetDate) < new Date() ? "#ef4444" : "var(--muted-foreground)" }} />
                                <span className="text-muted-foreground">Due Date</span>
                                <span className={`ml-auto ${new Date(selectedWO.targetDate) < new Date() ? "text-red-500" : "text-foreground"}`} style={{ fontWeight: 500 }}>
                                  {new Date(selectedWO.targetDate).toLocaleDateString()}
                                </span>
                              </div>
                            </>
                          )}
                          {selectedWO.squawk && (
                            <>
                              <div className="h-px bg-border" />
                              <div className="flex items-start gap-2">
                                <Wrench className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                                <span className="text-muted-foreground shrink-0">Squawk</span>
                                <span className="ml-auto text-amber-600 text-right" style={{ fontWeight: 500 }}>{selectedWO.squawk}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tab row */}
                  <div className="flex items-center overflow-x-auto">
                    {([
                      { id: "activity",  label: "Activity",      icon: MessageSquare, always: true },
                      { id: "checklist", label: "Checklist",     icon: ClipboardCheck, always: true, state: tabState.checklist },
                      { id: "squawks",   label: "Squawks",       icon: AlertTriangle, always: true },
                      { id: "lineitems", label: "Line Items",    icon: Layers,        permKey: "woLineItems" },
                      { id: "media",     label: "Media",         icon: Camera,        always: true },
                      { id: "aisummary", label: "AI Summary",    icon: Bot,           always: true, state: tabState.aisummary },
                      { id: "ownerview", label: "Owner View",    icon: Eye,           permKey: "woOwnersView" },
                      { id: "logbook",   label: "Logbook",       icon: FileText,      always: true, state: tabState.logbook },
                      { id: "invoice",   label: "Invoice",       icon: Receipt,       permKey: "woInvoice", state: tabState.invoice },
                    ] as { id: WODetailTab; label: string; icon: any; always?: boolean; permKey?: string; state?: "complete" | "pending" }[])
                    .filter((tab) => {
                      if (!isMechanicView) return true;
                      if (tab.always) return true;
                      if (tab.permKey) return perm[tab.permKey as keyof typeof perm];
                      return true;
                    })
                    .map((tab) => (
                      <button key={tab.id} onClick={() => setWODetailTab(tab.id)}
                        className={`relative flex flex-col items-center justify-center gap-1 px-2 py-1.5 rounded-md mb-1.5 shrink-0 transition-all ${woDetailTab === tab.id ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
                        <tab.icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-[9px] leading-none whitespace-nowrap" style={{ fontWeight: 500 }}>{tab.label}</span>
                        {tab.state && (
                          <span
                            className={`absolute inset-x-2 -bottom-1 h-0.5 rounded-full ${
                              tab.state === "complete" ? "bg-emerald-500" : "bg-red-500"
                            } ${woDetailTab === tab.id ? "opacity-90" : "opacity-75"}`}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-hidden">

                  {/* ── ACTIVITY — iMessage style ── */}
                  {woDetailTab === "activity" && (
                    <div className="h-full flex flex-col" style={{ background: "#F2F2F7" }}>
                      {/* Timer bar (if running) */}
                      {timerRunning && timerWorkOrderId === selectedWO.id && (
                        <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} className="shrink-0 bg-blue-600 text-white px-5 py-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Timer className="w-4 h-4 animate-pulse" />
                            <span className="text-[13px]" style={{ fontWeight: 600 }}>Timer running — {formatTimer(timerSeconds)}</span>
                          </div>
                          <button onClick={stopTimerAndLog} className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg text-[12px] transition-colors" style={{ fontWeight: 600 }}>
                            <StopCircle className="w-3.5 h-3.5" /> Stop & Log
                          </button>
                        </motion.div>
                      )}

                      {/* Thread */}
                      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-3" style={{ background: "#F2F2F7" }}>
                        {(selectedWO.activity || []).map((act) => {
                          /* System/status events — centered pills */
                          if (act.type === "system") {
                            return (
                              <div key={act.id} className="flex justify-center py-1">
                                <div className="text-[10px] text-slate-500 bg-white/70 backdrop-blur-sm px-3 py-1 rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.06)]">{act.content} · {formatRelTime(act.timestamp)}</div>
                              </div>
                            );
                          }
                          if (act.type === "status") {
                            const from = act.statusFrom || "";
                            const to = act.statusTo || "";
                            return (
                              <div key={act.id} className="flex justify-center py-1">
                                <div className="flex items-center gap-2 text-[10px] text-slate-500 bg-white/70 backdrop-blur-sm px-3 py-1 rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                                  <span className={`w-1.5 h-1.5 rounded-full ${WO_STATUS_CONFIG[from]?.dot || "bg-muted"}`} />
                                  {from}
                                  <span className="opacity-40">→</span>
                                  <span className={`w-1.5 h-1.5 rounded-full ${WO_STATUS_CONFIG[to]?.dot || "bg-muted"}`} />
                                  {to}
                                  <span className="opacity-30">·</span>
                                  {formatRelTime(act.timestamp)}
                                </div>
                              </div>
                            );
                          }

                          /* iMessage-style message bubbles */
                          const isAI = act.type === "ai-summary";
                          const isOwnerVisible = act.visibility === "owner-visible";
                          const bubbleOuter = getBubbleOuter(act.type, act.visibility);
                          const chipClass = getBubbleChip(act.visibility);
                          const liked = reactions[act.id]?.liked;
                          const saved = reactions[act.id]?.saved;

                          return (
                            <motion.div key={act.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                              className={`flex items-end gap-2 group ${isOwnerVisible ? "flex-row-reverse" : ""}`}>

                              {/* Avatar */}
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white text-[10px] flex-shrink-0 ${isAI ? "bg-primary" : getAvatarColor(act.author)}`} style={{ fontWeight: 700 }}>
                                {isAI ? <Bot className="w-3.5 h-3.5" /> : getInitials(act.author)}
                              </div>

                              {/* Bubble column */}
                              <div className={`min-w-0 flex flex-col ${isOwnerVisible ? "items-end" : "items-start"} max-w-[78%]`}>

                                {/* Author meta */}
                                <div className={`flex items-center gap-1.5 mb-1 px-1 ${isOwnerVisible ? "flex-row-reverse" : ""}`}>
                                  <span className="text-[11px] text-muted-foreground" style={{ fontWeight: 600 }}>{act.author}</span>
                                  {act.role && <span className="text-[10px] text-muted-foreground/60">{act.role}</span>}
                                  {isOwnerVisible && (
                                    <span className="text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Owner</span>
                                  )}
                                </div>

                                {/* Bubble */}
                                <div className={`rounded-2xl px-4 py-3 text-[13px] leading-relaxed w-fit
                                  ${isOwnerVisible ? "rounded-br-sm" : "rounded-bl-sm"} ${bubbleOuter}`}>

                                  {/* AI summary formatting */}
                                  {act.type === "ai-summary" ? (
                                    <div className="space-y-1">
                                      {act.content.split("\n").map((line, i) => (
                                        <div key={i} className={line.startsWith("**") ? "text-slate-800" : "text-slate-500 text-[12px]"}>
                                          {line.replace(/\*\*/g, "")}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className={isOwnerVisible ? "text-white" : ""}>{act.content}</span>
                                  )}

                                  {/* Media thumbnails */}
                                  {act.mediaUrls && act.mediaUrls.length > 0 && (
                                    <div className="flex gap-2 mt-3 flex-wrap">
                                      {act.mediaUrls.map((url) => (
                                        <div key={url} className={`w-14 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-colors border ${isOwnerVisible ? "bg-white/20 border-white/30 hover:bg-white/30" : "bg-slate-100 border-slate-200 hover:bg-slate-200"}`}>
                                          <Camera className="w-3.5 h-3.5 opacity-50" />
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Labor chip */}
                                  {act.laborHours && (
                                    <div className={`mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] ${chipClass}`} style={{ fontWeight: 600 }}>
                                      <Clock className="w-3 h-3" />{act.laborHours}h · {act.laborCategory || "General"}
                                    </div>
                                  )}

                                  {/* Part chip */}
                                  {act.partPN && (
                                    <div className={`mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] ${chipClass}`} style={{ fontWeight: 600 }}>
                                      <Package className="w-3 h-3" />P/N {act.partPN}
                                    </div>
                                  )}
                                </div>

                                {/* Timestamp + hover reactions */}
                                <div className={`flex items-center gap-2 mt-1 px-1 ${isOwnerVisible ? "flex-row-reverse" : ""}`}>
                                  <span className="text-[10px] text-muted-foreground/50">{formatRelTime(act.timestamp)}</span>
                                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                    <button onClick={() => toggleLike(act.id)}
                                      className={`w-6 h-6 flex items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95 ${liked ? "text-red-500" : "text-muted-foreground/30 hover:text-red-400"}`}>
                                      <Heart className={`w-3.5 h-3.5 transition-all ${liked ? "fill-red-500 stroke-red-500" : ""}`} />
                                    </button>
                                    <button onClick={() => toggleSave(act.id)}
                                      className={`w-6 h-6 flex items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95 ${saved ? "text-primary" : "text-muted-foreground/30 hover:text-primary/60"}`}>
                                      <Bookmark className={`w-3.5 h-3.5 transition-all ${saved ? "fill-primary stroke-primary" : ""}`} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                        <div ref={activityEndRef} />
                      </div>

                      {/* ── Log Hours panel ── */}
                      <AnimatePresence>
                        {showLogHours && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                            className="shrink-0 border-t border-slate-200 bg-white/95 overflow-hidden">
                            <div className="px-5 py-3">
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>Log Hours</span>
                                <button onClick={() => setShowLogHours(false)} className="p-1 hover:bg-muted rounded transition-colors"><X className="w-4 h-4 text-muted-foreground" /></button>
                              </div>
                              <div className="flex items-center gap-3">
                                <input type="number" step="0.25" min="0.25" placeholder="1.5" value={logHours} onChange={(e) => setLogHours(e.target.value)}
                                  className="w-24 border border-border rounded-lg px-3 py-2 text-[16px] outline-none focus:ring-2 focus:ring-primary/20" style={{ fontWeight: 700 }} />
                                <span className="text-[12px] text-muted-foreground">hrs</span>
                                <select value={logHoursCategory} onChange={(e) => setLogHoursCategory(e.target.value)} className="flex-1 border border-border rounded-lg px-3 py-2 text-[12px] outline-none bg-white">
                                  {["General", "Diagnostic", "Inspection", "Repair", "R&R", "Research", "Test Flight", "Admin"].map((c) => <option key={c}>{c}</option>)}
                                </select>
                                <button onClick={submitLogHours} disabled={!logHours} className="flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-lg text-[12px] hover:bg-primary/90 disabled:opacity-40 transition-colors" style={{ fontWeight: 500 }}>
                                  <Check className="w-3.5 h-3.5" /> Log
                                </button>
                              </div>
                              <button onClick={() => {
                                setShowLogHours(false);
                                handlePlusAction("timer");
                              }}
                                className="mt-2 flex items-center gap-1.5 text-[12px] text-primary hover:text-primary/80 transition-colors" style={{ fontWeight: 500 }}>
                                <PlayCircle className="w-3.5 h-3.5" /> Use timer instead
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* ── Add Part panel ── */}
                      <AnimatePresence>
                        {showAddPart && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                            className="shrink-0 border-t border-border bg-white overflow-hidden">
                            <div className="px-5 py-3">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>Add Part</span>
                                  <div className="flex gap-1 bg-muted rounded-lg p-0.5">
                                    {(["search", "manual"] as const).map((m) => (
                                      <button key={m} onClick={() => setAddPartMode(m)}
                                        className={`px-3 py-1 rounded-md text-[11px] transition-colors ${addPartMode === m ? "bg-white shadow-sm text-foreground" : "text-muted-foreground"}`}
                                        style={{ fontWeight: addPartMode === m ? 600 : 400 }}>
                                        {m === "search" ? "Search" : "Manual"}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <button onClick={() => setShowAddPart(false)} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4 text-muted-foreground" /></button>
                              </div>

                              {addPartMode === "search" ? (
                                <div>
                                  <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-lg px-3 py-2 mb-2">
                                    <Search className="w-3.5 h-3.5 text-muted-foreground" />
                                    <input value={partSearch} onChange={(e) => setPartSearch(e.target.value)} placeholder="Search by P/N or description..." className="flex-1 bg-transparent text-[13px] outline-none" />
                                  </div>
                                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                                    {filteredParts.map((p) => (
                                      <div key={p.pn} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
                                        <div>
                                          <div className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>{p.pn}</div>
                                          <div className="text-[11px] text-muted-foreground">{p.desc} · {p.vendor}</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>${p.price}</span>
                                          <button
                                            onClick={async () => {
                                              if (!selectedWO) return;
                                              await appendPartLine(selectedWO, {
                                                pn: p.pn,
                                                desc: p.desc,
                                                qty: 1,
                                                price: p.price,
                                                vendor: p.vendor,
                                                condition: p.condition,
                                              });
                                              setPartSearch("");
                                              setShowAddPart(false);
                                              toast.success(`${p.pn} added to ${selectedWO.woNumber}.`);
                                            }}
                                            className="text-[11px] bg-primary text-white px-2.5 py-1 rounded-lg hover:bg-primary/90 transition-colors"
                                            style={{ fontWeight: 500 }}
                                          >
                                            Add
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                    {filteredParts.length === 0 && (
                                      <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[12px] text-muted-foreground">
                                        No matching inventory parts yet. Use Manual to add a customer-supplied or newly ordered part.
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="grid grid-cols-5 gap-2">
                                  <input value={manualPartPN} onChange={(e) => setManualPartPN(e.target.value)} placeholder="P/N" className="border border-border rounded-lg px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20" />
                                  <input value={manualPartDesc} onChange={(e) => setManualPartDesc(e.target.value)} placeholder="Description" className="col-span-2 border border-border rounded-lg px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20" />
                                  <input value={manualPartCost} onChange={(e) => setManualPartCost(e.target.value)} placeholder="Unit $" type="number" min="0" step="0.01" className="border border-border rounded-lg px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20" />
                                  <div className="flex gap-1.5">
                                    <input value={manualPartQty} onChange={(e) => setManualPartQty(e.target.value)} placeholder="Qty" type="number" className="w-14 border border-border rounded-lg px-2 py-2 text-[12px] outline-none" />
                                    <button
                                      onClick={async () => {
                                        if (!selectedWO) return;
                                        await appendPartLine(selectedWO, {
                                          pn: manualPartPN,
                                          desc: manualPartDesc,
                                          qty: Number(manualPartQty || "1"),
                                          price: Number(manualPartCost || "0"),
                                        });
                                        setManualPartPN("");
                                        setManualPartDesc("");
                                        setManualPartQty("1");
                                        setManualPartCost("");
                                        setShowAddPart(false);
                                        toast.success(`Part line added to ${selectedWO.woNumber}.`);
                                      }}
                                      className="flex-1 bg-primary text-white rounded-lg text-[12px] hover:bg-primary/90 transition-colors"
                                      style={{ fontWeight: 500 }}
                                    >
                                      Add
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* ── Composer expanded (type selector) ── */}
                      <AnimatePresence>
                        {showComposer && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                            className="shrink-0 border-t border-slate-200 bg-white/95 overflow-hidden">
                            <div className="px-4 pt-3 pb-1">
                              <div className="flex items-center gap-1.5 mb-2.5">
                                {[
                                  { val: "note" as ActivityEntry["type"], label: "Internal Note", icon: Lock },
                                  { val: "owner-update" as ActivityEntry["type"], label: "Owner Update", icon: Eye },
                                  { val: "approval" as ActivityEntry["type"], label: "Approval", icon: CheckCircle },
                                ].map((opt) => (
                                  <button key={opt.val} onClick={() => { setComposerType(opt.val); setComposerVis(opt.val === "owner-update" || opt.val === "approval" ? "owner-visible" : "internal"); }}
                                    className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full transition-colors ${composerType === opt.val ? "bg-[#2563EB] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                                    style={{ fontWeight: 500 }}>
                                    <opt.icon className="w-3 h-3" />{opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* ── iMessage-style composer bar ── */}
                      <div className="shrink-0 border-t border-slate-200 bg-white/95 backdrop-blur-sm px-3 py-2.5">
                        <div className="flex items-end gap-2">
                          {/* Plus button */}
                          <div className="relative">
                            <button onClick={() => setShowPlusMenu(!showPlusMenu)}
                              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 transition-colors">
                              <Plus className="w-4 h-4 text-slate-500" />
                            </button>
                            <AnimatePresence>
                              {showPlusMenu && (
                                <motion.div initial={{ opacity: 0, y: 6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.96 }}
                                  className="absolute bottom-full left-0 mb-2 w-52 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden py-1 z-50">
                                  {PLUS_ACTIONS.map((a) => (
                                    <button key={a.id} onClick={() => handlePlusAction(a.id)}
                                      className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-foreground hover:bg-slate-50 transition-colors" style={{ fontWeight: 500 }}>
                                      <a.icon className="w-4 h-4 text-slate-500" />
                                      {a.label}
                                    </button>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>

                          {/* Text input — pill style like iMessage */}
                          <div className="flex-1 flex items-end gap-2 bg-white border border-slate-300 rounded-2xl px-4 py-2.5 min-h-[40px]">
                            <input
                              value={composerText}
                              onChange={(e) => { setComposerText(e.target.value); if (e.target.value && !showComposer) setShowComposer(true); }}
                              onFocus={() => setShowComposer(true)}
                              placeholder="iMessage..."
                              className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400"
                            />
                            <button className="flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors">
                              <Mic className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Send — blue circle like iMessage */}
                          <button onClick={showComposer ? submitComposer : undefined}
                            disabled={!composerText.trim()}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#2563EB] text-white hover:bg-[#1D4ED8] disabled:opacity-30 transition-all disabled:scale-90">
                            <Send className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {woDetailTab === "checklist" && (
                    <div className="h-full overflow-y-auto px-5 py-5 max-w-3xl">
                      <div className="flex items-center justify-between mb-5">
                        <div>
                          <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>Work Order Checklist</h3>
                          <p className="text-[12px] text-muted-foreground">
                            Complete all required items before closing the work order. Shop templates override the FAA/manufacturer baseline when configured.
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-[12px] text-muted-foreground">Required complete</div>
                          <div className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
                            {completedRequiredChecklistCount}/{requiredChecklistCount || checklistItems.length}
                          </div>
                        </div>
                      </div>

                      {checklistLoading ? (
                        <div className="rounded-xl border border-border bg-white px-4 py-6 text-[13px] text-muted-foreground">
                          Loading checklist…
                        </div>
                      ) : checklistItems.length === 0 ? (
                        <div className="rounded-xl border border-border bg-white px-4 py-6 text-[13px] text-muted-foreground">
                          No checklist has been generated for this work order yet.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {Array.from(new Set(checklistItems.map((item) => item.section))).map((section) => {
                            const sectionItems = checklistItems.filter((item) => item.section === section);
                            return (
                              <div key={section} className="rounded-xl border border-border bg-white overflow-hidden">
                                <div className="border-b border-border bg-muted/20 px-4 py-3">
                                  <div className="text-[12px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 700 }}>
                                    {section}
                                  </div>
                                </div>
                                <div className="divide-y divide-border">
                                  {sectionItems.map((item) => (
                                    <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                                      <button
                                        type="button"
                                        onClick={() => toggleChecklistItem(item.id, !item.completed)}
                                        disabled={checklistSavingId === item.id}
                                        className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                                          item.completed
                                            ? "border-emerald-500 bg-emerald-500 text-white"
                                            : "border-border bg-white text-transparent hover:border-primary"
                                        }`}
                                      >
                                        <Check className="h-3.5 w-3.5" />
                                      </button>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <p className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>
                                            {item.item_label}
                                          </p>
                                          {item.required && (
                                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">Required</span>
                                          )}
                                          {item.completed && (
                                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">Completed</span>
                                          )}
                                        </div>
                                        {item.item_description && (
                                          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                                            {item.item_description}
                                          </p>
                                        )}
                                        <p className="mt-2 text-[11px] text-muted-foreground">
                                          Source: {item.source_reference || item.source.replace(/_/g, " ")}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {woDetailTab === "squawks" && (
                    <div className="h-full overflow-y-auto px-5 py-5 max-w-3xl">
                      <div className="flex items-center justify-between mb-5">
                        <div>
                          <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>Related Squawks</h3>
                          <p className="text-[12px] text-muted-foreground">
                            Discrepancies and owner-reported issues tied to this work order stay here so Activity can remain focused on the conversation and approvals.
                          </p>
                        </div>
                        <div className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground" style={{ fontWeight: 600 }}>
                          {relatedSquawks.length} linked
                        </div>
                      </div>

                      {relatedSquawks.length === 0 ? (
                        <div className="rounded-xl border border-border bg-white px-4 py-6 text-[13px] text-muted-foreground">
                          No squawks are mapped to this work order yet.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {relatedSquawks.map((squawk) => (
                            <div key={squawk.id} className="rounded-xl border border-border bg-white px-4 py-4">
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                                    <h4 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>
                                      {squawk.title}
                                    </h4>
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${SEVERITY_COLORS[squawk.severity]}`}>
                                      {squawk.severity}
                                    </span>
                                  </div>
                                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                                    {squawk.description}
                                  </p>
                                  <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                                    <span>Category: {squawk.category}</span>
                                    <span>Status: {squawk.status}</span>
                                    <span>Reported by: {squawk.reportedBy}</span>
                                    <span>Date: {new Date(squawk.date).toLocaleDateString()}</span>
                                  </div>
                                </div>
                                <div className="shrink-0 rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground" style={{ fontWeight: 600 }}>
                                  {squawk.linkedWO ? "Mapped" : "Unlinked"}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── LINE ITEMS TAB ── */}
                  {woDetailTab === "lineitems" && (
                    <div className="h-full overflow-y-auto px-5 py-5 space-y-6">
                      {/* Labor */}
                      <section>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>Labor</h3>
                          <button onClick={() => { setShowLogHours(true); setWODetailTab("activity"); }}
                            className="flex items-center gap-1.5 text-[12px] text-primary hover:text-primary/80 transition-colors" style={{ fontWeight: 500 }}>
                            <Plus className="w-3.5 h-3.5" /> Log Hours
                          </button>
                        </div>
                        <div className="bg-white rounded-xl border border-border overflow-hidden">
                          <table className="w-full text-[12px]">
                            <thead><tr className="border-b border-border bg-muted/20">
                              <th className="text-left px-4 py-2.5 text-muted-foreground" style={{ fontWeight: 600 }}>Description</th>
                              <th className="text-right px-4 py-2.5 text-muted-foreground w-16" style={{ fontWeight: 600 }}>Hrs</th>
                              <th className="text-right px-4 py-2.5 text-muted-foreground w-16" style={{ fontWeight: 600 }}>Rate</th>
                              <th className="text-right px-4 py-2.5 text-muted-foreground w-20" style={{ fontWeight: 600 }}>Total</th>
                            </tr></thead>
                            <tbody className="divide-y divide-border">
                              {selectedWO.laborLines.map((l) => (
                                <tr key={l.id} className="hover:bg-muted/10">
                                  <td className="px-4 py-3 text-foreground">{l.desc}</td>
                                  <td className="px-4 py-3 text-right text-muted-foreground">{l.hours}</td>
                                  <td className="px-4 py-3 text-right text-muted-foreground">${l.rate}</td>
                                  <td className="px-4 py-3 text-right text-foreground" style={{ fontWeight: 600 }}>${l.total.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot><tr className="border-t border-border bg-muted/10">
                              <td colSpan={3} className="px-4 py-2.5 text-[12px] text-muted-foreground" style={{ fontWeight: 600 }}>Labor Subtotal</td>
                              <td className="px-4 py-2.5 text-right text-foreground" style={{ fontWeight: 700 }}>${selectedWO.totalLabor.toFixed(2)}</td>
                            </tr></tfoot>
                          </table>
                        </div>
                      </section>

                      {/* Parts */}
                      <section>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>Parts & Materials</h3>
                          <button onClick={() => { setShowAddPart(true); setWODetailTab("activity"); }}
                            className="flex items-center gap-1.5 text-[12px] text-primary hover:text-primary/80 transition-colors" style={{ fontWeight: 500 }}>
                            <Plus className="w-3.5 h-3.5" /> Add Part
                          </button>
                        </div>
                        <div className="space-y-2">
                          {selectedWO.partsLines.map((p) => {
                            const stateColorMap: Record<string, string> = {
                              Ordered: "bg-blue-50 text-blue-700",
                              Received: "bg-violet-50 text-violet-700",
                              Installed: "bg-emerald-50 text-emerald-700",
                              Backordered: "bg-red-50 text-red-600",
                            };
                            const stateColor = stateColorMap[p.status ?? ""] ?? "bg-slate-100 text-slate-600";
                            return (
                              <div key={p.id} className="bg-white rounded-xl border border-border px-4 py-3 flex items-center justify-between gap-4">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{p.pn}</span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${stateColor}`} style={{ fontWeight: 600 }}>{p.status || "Added"}</span>
                                  </div>
                                  <div className="text-[12px] text-muted-foreground">{p.desc} · {p.vendor || "—"} · Qty {p.qty}</div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>${p.total.toFixed(2)}</div>
                                  <div className="text-[11px] text-muted-foreground">${p.price} ea</div>
                                </div>
                              </div>
                            );
                          })}
                          {selectedWO.partsLines.length === 0 && (
                            <div className="bg-white rounded-xl border border-border px-4 py-6 text-center text-[13px] text-muted-foreground">No parts added yet</div>
                          )}
                        </div>
                      </section>

                      {/* Totals */}
                      <section className="bg-white rounded-xl border border-border p-5">
                        <div className="space-y-2 text-[13px] mb-1">
                          <div className="flex justify-between"><span className="text-muted-foreground">Labor</span><span style={{ fontWeight: 600 }}>${selectedWO.totalLabor.toFixed(2)}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Parts</span><span style={{ fontWeight: 600 }}>${selectedWO.totalParts.toFixed(2)}</span></div>
                          {selectedWO.totalOutside > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Outside Services</span><span style={{ fontWeight: 600 }}>${selectedWO.totalOutside.toFixed(2)}</span></div>}
                          <div className="flex justify-between border-t border-border pt-3 mt-2">
                            <span className="text-foreground" style={{ fontWeight: 700 }}>Grand Total</span>
                            <span className="text-[18px] text-foreground tracking-tight" style={{ fontWeight: 700 }}>${selectedWO.grandTotal.toFixed(2)}</span>
                          </div>
                        </div>
                      </section>
                    </div>
                  )}

                  {/* ── MEDIA TAB ── */}
                  {woDetailTab === "media" && (
                    <div className="h-full overflow-y-auto px-5 py-5">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>Media &amp; Attachments</h3>
                        <button className="flex items-center gap-1.5 bg-primary text-white px-3 py-2 rounded-lg text-[12px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 500 }}>
                          <Camera className="w-3.5 h-3.5" /> Upload
                        </button>
                      </div>
                      <div className="grid grid-cols-4 gap-3">
                        {(selectedWO.activity?.flatMap((a) => a.mediaUrls || []) || []).map((url, i) => (
                          <div key={i} className="aspect-square bg-muted rounded-xl flex items-center justify-center border border-border cursor-pointer hover:bg-muted/70 transition-colors group">
                            <Camera className="w-6 h-6 text-muted-foreground group-hover:text-foreground transition-colors" />
                          </div>
                        ))}
                        {(!selectedWO.activity?.some((a) => a.mediaUrls?.length)) && (
                          <div className="col-span-4 text-center py-12 text-muted-foreground">
                            <Image className="w-8 h-8 mx-auto mb-2 opacity-30" />
                            <div className="text-[13px]">No media uploaded yet</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── AI SUMMARY TAB ── */}
                  {woDetailTab === "aisummary" && (
                    <div className="h-full overflow-y-auto px-5 py-5 max-w-3xl">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>AI Work Summary</h3>
                        <button className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                          <RefreshCw className="w-3.5 h-3.5" /> Regenerate
                        </button>
                      </div>
                      <div className="bg-primary/5 border border-primary/15 rounded-2xl p-5 mb-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Bot className="w-5 h-5 text-primary" />
                          <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>AI Summary</span>
                          <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Live</span>
                        </div>
                        {(selectedWO.activity?.find((a) => a.type === "ai-summary")?.content || "").split("\n").map((line, i) => (
                          <div key={i} className={`text-[13px] leading-relaxed ${line.startsWith("**") ? "text-foreground" : "text-muted-foreground"}`}>
                            {line.replace(/\*\*/g, "")}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        {[
                          { label: "Total Hours", value: `${totalLaborHours.toFixed(1)} hrs` },
                          { label: "Parts Count", value: `${selectedWO.partsLines.length} items` },
                          { label: "Current Total", value: `$${selectedWO.grandTotal.toFixed(2)}` },
                        ].map((s) => (
                          <div key={s.label} className="bg-white rounded-xl border border-border p-4 text-center">
                            <div className="text-[18px] text-foreground tracking-tight" style={{ fontWeight: 700 }}>{s.value}</div>
                            <div className="text-[11px] text-muted-foreground">{s.label}</div>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setWODetailTab("logbook")}
                          className="flex items-center gap-1.5 bg-primary text-white px-4 py-2.5 rounded-xl text-[13px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 500 }}>
                          <FileText className="w-4 h-4" /> Generate Logbook Entry
                        </button>
                        <button onClick={() => setWODetailTab("invoice")}
                          className="flex items-center gap-1.5 border border-border px-4 py-2.5 rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                          <Receipt className="w-4 h-4" /> Create Invoice
                        </button>
                        <button onClick={startCloseFlow}
                          className="flex items-center gap-1.5 bg-[#0A1628] text-white px-4 py-2.5 rounded-xl text-[13px] hover:bg-[#0A1628]/90 transition-colors" style={{ fontWeight: 500 }}>
                          <CheckCircle className="w-4 h-4" /> Close Work Order
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── OWNER VIEW TAB ── */}
                  {woDetailTab === "ownerview" && (
                    <div className="h-full overflow-y-auto px-5 py-5 max-w-2xl">
                      <div className="bg-[#0A1628] rounded-2xl p-5 mb-5 text-white">
                        <div className="flex items-center gap-2 mb-4">
                          <Eye className="w-5 h-5 text-white/70" />
                          <span className="text-[14px]" style={{ fontWeight: 700 }}>Customer View — {selectedWO.customer}</span>
                        </div>
                        <div className="text-white/60 text-[12px]">This is what your customer sees when they log into their dashboard.</div>
                      </div>

                      {/* Owner-visible activity only */}
                      <div className="space-y-3 mb-5">
                        {(selectedWO.activity || []).filter((a) => a.visibility === "owner-visible" || a.type === "system").map((act) => {
                          if (act.type === "system") return (
                            <div key={act.id} className="text-center text-[11px] text-muted-foreground">{act.content}</div>
                          );
                          return (
                            <div key={act.id} className="bg-white rounded-xl border border-border p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] ${getAvatarColor(act.author)}`} style={{ fontWeight: 700 }}>{getInitials(act.author)}</div>
                                <div>
                                  <div className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>{act.author} · {act.role}</div>
                                  <div className="text-[10px] text-muted-foreground">{formatRelTime(act.timestamp)}</div>
                                </div>
                              </div>
                              <p className="text-[13px] text-foreground leading-relaxed">{act.content}</p>
                            </div>
                          );
                        })}
                      </div>

                      {/* Approval requests */}
                      {(selectedWO.activity || []).some((a) => a.type === "approval") && (
                        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-4">
                          <div className="text-[13px] text-orange-900 mb-2" style={{ fontWeight: 600 }}>⚡ Approval Requested</div>
                          {(selectedWO.activity || []).filter((a) => a.type === "approval").map((a) => (
                            <p key={a.id} className="text-[13px] text-orange-800 mb-3 leading-relaxed">{a.content}</p>
                          ))}
                          <div className="flex gap-2">
                            <button className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-lg text-[12px] hover:bg-emerald-700 transition-colors" style={{ fontWeight: 600 }}>
                              <Check className="w-3.5 h-3.5" /> Approve
                            </button>
                            <button className="flex items-center gap-1.5 border border-border px-4 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                              <MessageSquare className="w-3.5 h-3.5" /> Ask Question
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button onClick={() => { setShowComposer(true); setComposerType("owner-update"); setComposerVis("owner-visible"); setWODetailTab("activity"); }}
                          className="flex items-center gap-1.5 bg-primary text-white px-4 py-2.5 rounded-xl text-[13px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 500 }}>
                          <Bell className="w-4 h-4" /> Send Owner Update
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── LOGBOOK ENTRY TAB ── */}
                  {woDetailTab === "logbook" && (
                    <div className="h-full overflow-y-auto px-5 py-5 max-w-3xl">
                      <div className="flex items-center justify-between mb-5">
                        <div>
                          <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>Logbook Entry</h3>
                          <p className="text-[12px] text-muted-foreground">AI-drafted from work order scope. Edit and sign to finalize.</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                            <Sparkles className="w-3.5 h-3.5 text-primary" /> Regenerate
                          </button>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                          <div><label className="block text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wide" style={{ fontWeight: 600 }}>Aircraft</label><div className="border border-border rounded-lg px-3 py-2 text-[13px] bg-muted/20 text-foreground">{selectedWO.aircraft}</div></div>
                          <div><label className="block text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wide" style={{ fontWeight: 600 }}>Make / Model</label><div className="border border-border rounded-lg px-3 py-2 text-[13px] bg-muted/20 text-foreground">{selectedWO.makeModel.split(" ").slice(0, 3).join(" ")}</div></div>
                          <div><label className="block text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wide" style={{ fontWeight: 600 }}>Date</label><input type="date" value={logbookDate} onChange={(e) => setLogbookDate(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20" /></div>
                        </div>

                        <div>
                          <label className="block text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wide" style={{ fontWeight: 600 }}>Maintenance Description</label>
                          <textarea
                            value={logbookBodyText}
                            onChange={(e) => setLogbookBodyText(e.target.value)}
                            rows={10} className="w-full border border-border rounded-xl px-4 py-3 text-[13px] outline-none resize-none focus:ring-2 focus:ring-primary/20 leading-relaxed" />
                        </div>

                        <div className="bg-muted/30 rounded-xl border border-border p-4">
                          <div className="text-[12px] text-foreground mb-3" style={{ fontWeight: 600 }}>Certificate of Return to Service</div>
                          <div className="grid grid-cols-2 gap-4 text-[12px]">
                            <div><div className="text-muted-foreground mb-1">Mechanic Name</div><div className="border border-border rounded-lg px-3 py-2 bg-white text-foreground" style={{ fontWeight: 500 }}>{activeMechanic.name}</div></div>
                            <div><div className="text-muted-foreground mb-1">Certificate Number</div><div className="border border-border rounded-lg px-3 py-2 bg-white text-foreground" style={{ fontWeight: 500 }}>{signingCertificateNumber}</div></div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (!selectedWO) return;
                              if (isSeedItem(selectedWO.id)) {
                                toast.info("Demo work order — create your own to sign logbook entries.");
                                return;
                              }
                              const entry = addLogbookEntry({
                                aircraft: selectedWO.aircraft,
                                makeModel: selectedWO.makeModel,
                                serial: selectedWO.serial || "",
                                engine: "",
                                date: logbookDate,
                                type: selectedWO.squawk?.split("—")[0]?.trim() || "Maintenance",
                                body: logbookBodyText,
                                mechanic: activeMechanic.name,
                                certificateNumber: signingCertificateNumber,
                                status: "signed",
                                totalTime: 0,
                                linkedWO: selectedWO.id,
                                signature: activeMechanic.name,
                                signatureDate: new Date().toISOString(),
                              });
                              void updateWorkOrder(selectedWO.id, { linkedLogbookEntry: entry.id });
                              toast.success("Logbook entry signed and saved — view it in Logbook.");
                            }}
                            className="flex items-center gap-1.5 bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-[13px] hover:bg-emerald-700 transition-colors" style={{ fontWeight: 600 }}>
                            <Lock className="w-4 h-4" /> Sign &amp; Finalize
                          </button>
                          <button
                            onClick={downloadCurrentLogbookDraft}
                            className="flex items-center gap-1.5 border border-border px-4 py-2.5 rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                            <Download className="w-4 h-4" /> PDF
                          </button>
                          <button
                            onClick={emailCurrentLogbookDraft}
                            className="flex items-center gap-1.5 border border-border px-4 py-2.5 rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                            <Send className="w-4 h-4" /> Email to Customer
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── INVOICE TAB ── */}
                  {woDetailTab === "invoice" && (() => {
                    const linkedInv = selectedWO.linkedInvoice ? allInvoices.find(i => i.id === selectedWO.linkedInvoice) : null;
                    return (
                    <div className="h-full overflow-y-auto px-5 py-5 max-w-3xl">
                      <div className="flex items-center justify-between mb-5">
                        <div>
                          <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>Invoice — {selectedWO.woNumber}</h3>
                          <p className="text-[12px] text-muted-foreground">
                            {linkedInv
                              ? `${linkedInv.invoiceNumber} · ${linkedInv.status} · ${linkedInv.paymentStatus}`
                              : "Auto-populated from work order line items. Review and send."}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => linkedInv && openInvoicePdf(linkedInv.id)}
                            disabled={!linkedInv}
                            className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" style={{ fontWeight: 500 }}>
                            <Download className="w-3.5 h-3.5" /> PDF
                          </button>
                          {linkedInv ? (
                            <button onClick={() => { setMainTab("invoices"); setSelectedInvId(linkedInv.id); }} className="flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-lg text-[12px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
                              <Receipt className="w-3.5 h-3.5" /> View Invoice
                            </button>
                          ) : (
                            <button onClick={handleSendWOInvoice} className="flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-lg text-[12px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
                              <Send className="w-3.5 h-3.5" /> Send Invoice
                            </button>
                          )}
                        </div>
                      </div>
                      {linkedInv && linkedInv.status !== "Draft" && (
                        <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-3">
                          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                          <div className="text-[12px] text-emerald-800 flex-1">
                            <span style={{ fontWeight: 600 }}>{linkedInv.invoiceNumber}</span> sent · Payment: <span style={{ fontWeight: 600 }}>{linkedInv.paymentStatus}</span>
                            <button onClick={() => { setMainTab("invoices"); setSelectedInvId(linkedInv.id); }} className="ml-2 underline hover:no-underline" style={{ fontWeight: 600 }}>View full invoice →</button>
                          </div>
                        </div>
                      )}

                      <div className="space-y-4">
                        {/* Customer block */}
                        <div className="bg-white rounded-xl border border-border p-4">
                          <div className="grid grid-cols-2 gap-4 text-[12px]">
                            <div><div className="text-muted-foreground mb-1">Bill To</div><div className="text-foreground" style={{ fontWeight: 600 }}>{selectedWO.customer}</div><div className="text-muted-foreground">{selectedWO.company || ""}</div></div>
                            <div>
                              <div className="text-muted-foreground mb-1">Invoice Details</div>
                              <div className="space-y-1">
                                <div className="flex justify-between"><span className="text-muted-foreground">Invoice #</span><span style={{ fontWeight: 500 }}>{linkedInv ? linkedInv.invoiceNumber : `INV-${new Date().getFullYear()}-XXXX`}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">Work Order</span><span className="text-primary" style={{ fontWeight: 500 }}>{selectedWO.woNumber}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">Aircraft</span><span style={{ fontWeight: 500 }}>{selectedWO.aircraft}</span></div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Line items */}
                        <div className="bg-white rounded-xl border border-border overflow-hidden">
                          <table className="w-full text-[12px]">
                            <thead><tr className="border-b border-border bg-muted/20">
                              <th className="text-left px-4 py-2.5 text-muted-foreground" style={{ fontWeight: 600 }}>Description</th>
                              <th className="text-right px-4 py-2.5 text-muted-foreground w-20" style={{ fontWeight: 600 }}>Total</th>
                            </tr></thead>
                            <tbody className="divide-y divide-border">
                              {selectedWO.laborLines.map((l) => (
                                <tr key={l.id}><td className="px-4 py-2.5 text-foreground">{l.desc} <span className="text-muted-foreground">({l.hours} hrs @ ${l.rate})</span></td><td className="px-4 py-2.5 text-right text-foreground" style={{ fontWeight: 600 }}>${l.total.toFixed(2)}</td></tr>
                              ))}
                              {selectedWO.partsLines.map((p) => (
                                <tr key={p.id}><td className="px-4 py-2.5 text-foreground">{p.desc} <span className="text-muted-foreground">P/N {p.pn}</span></td><td className="px-4 py-2.5 text-right text-foreground" style={{ fontWeight: 600 }}>${p.total.toFixed(2)}</td></tr>
                              ))}
                              {selectedWO.laborLines.length === 0 && selectedWO.partsLines.length === 0 && (
                                <tr><td colSpan={2} className="px-4 py-6 text-center text-[12px] text-muted-foreground">No line items yet — add labor &amp; parts in the Line Items tab.</td></tr>
                              )}
                            </tbody>
                            <tfoot className="border-t-2 border-border">
                              <tr className="bg-muted/10"><td className="px-4 py-2.5 text-muted-foreground" style={{ fontWeight: 600 }}>Subtotal</td><td className="px-4 py-2.5 text-right" style={{ fontWeight: 600 }}>${(selectedWO.totalLabor + selectedWO.totalParts + selectedWO.totalOutside).toFixed(2)}</td></tr>
                              <tr><td className="px-4 py-2 text-muted-foreground">Tax (0%)</td><td className="px-4 py-2 text-right text-muted-foreground">$0.00</td></tr>
                              <tr className="bg-primary/5"><td className="px-4 py-3 text-foreground" style={{ fontWeight: 700 }}>Total Due</td><td className="px-4 py-3 text-right text-[18px] text-foreground" style={{ fontWeight: 700 }}>${selectedWO.grandTotal.toFixed(2)}</td></tr>
                            </tfoot>
                          </table>
                        </div>

                        {(!linkedInv || (linkedInv && linkedInv.paymentStatus !== "Paid")) && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => toast.info("Stripe payments coming soon — connect your Stripe account in Settings.")}
                              className="flex-1 flex items-center justify-center gap-2 bg-[#635BFF] text-white py-3 rounded-xl text-[13px] hover:bg-[#5851E5] transition-colors" style={{ fontWeight: 600 }}>
                              <Receipt className="w-4 h-4" /> Pay via Stripe
                            </button>
                            <button
                              onClick={handleMarkWOInvoicePaid}
                              className="flex items-center gap-1.5 border border-border px-4 py-3 rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                              <Check className="w-4 h-4" /> Mark Paid Manually
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })()}
                </div>
              </motion.div>
            )}

            {/* No WO selected */}
            {mainTab === "workorders" && !selectedWO && (
              <motion.div key="no-wo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Wrench className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="text-[14px]" style={{ fontWeight: 500 }}>Select a work order</p>
                </div>
              </motion.div>
            )}

            {/* ESTIMATE DETAIL */}
            {mainTab === "estimates" && selectedEst && (
              <motion.div key={selectedEst.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 overflow-y-auto px-6 py-5">
                <div className="max-w-3xl space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-[18px] text-foreground" style={{ fontWeight: 700 }}>{selectedEst.estimateNumber}</h2>
                        <span className={`text-[11px] px-2.5 py-0.5 rounded-full ${EST_STATUS_CONFIG[selectedEst.status]?.color}`} style={{ fontWeight: 600 }}>{selectedEst.status}</span>
                      </div>
                      <div className="text-[13px] text-muted-foreground">{selectedEst.aircraft} · {selectedEst.customer} · ${selectedEst.total.toFixed(2)}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {/* Status-based actions */}
                      {(selectedEst.status === "Draft") && (
                        <button onClick={() => handleSendEstimate(selectedEst)}
                          className="flex items-center gap-1.5 bg-primary text-white px-3 py-2 rounded-lg text-[12px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 500 }}>
                          <Send className="w-3.5 h-3.5" /> Send to Customer
                        </button>
                      )}
                      {selectedEst.status === "Sent" && (
                        <>
                          <button onClick={() => handleApproveEstimate(selectedEst)}
                            className="flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-2 rounded-lg text-[12px] hover:bg-emerald-700 transition-colors" style={{ fontWeight: 500 }}>
                            <Check className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button onClick={() => handleRejectEstimate(selectedEst)}
                            className="flex items-center gap-1.5 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-[12px] hover:bg-red-50 transition-colors" style={{ fontWeight: 500 }}>
                            <X className="w-3.5 h-3.5" /> Reject
                          </button>
                        </>
                      )}
                      {selectedEst.status === "Approved" && (
                        <button onClick={() => {
                          const wo = convertEstimateToWorkOrder(selectedEst.id, {
                            onPersisted: (persistedWorkOrder) => {
                              setSelectedWOId(persistedWorkOrder.id);
                              setWODetailTab("activity");
                            },
                          });
                          if (wo) {
                            setSelectedWOId(wo.id);
                            setWODetailTab("activity");
                            setMainTab("workorders");
                            toast.success(
                              selectedEst.linkedWorkOrder
                                ? "Opened the linked work order for this estimate."
                                : "Work order created from estimate!"
                            );
                          } else {
                            toast.error("Approve the estimate before converting it to a work order.");
                          }
                        }}
                          className="flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-lg text-[12px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 500 }}>
                          <Wrench className="w-3.5 h-3.5" /> Create Work Order
                        </button>
                      )}
                      <button
                        onClick={() => downloadEstimatePdf(selectedEst)}
                        className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}><Download className="w-3.5 h-3.5" /> PDF</button>
                    </div>
                  </div>

                  {/* Empty-state hint for a brand-new Draft with no line items */}
                  {selectedEst.status === "Draft" && selectedEst.laborLines.length === 0 && selectedEst.partsLines.length === 0 && selectedEst.outsideServices.length === 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 flex items-start gap-4">
                      <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <div className="text-[13px] text-blue-900 mb-1" style={{ fontWeight: 700 }}>Estimate created as Draft</div>
                        <p className="text-[12px] text-blue-700 leading-relaxed">
                          Add labor, parts, and outside services to build out the estimate. Once complete, send it to the customer for approval.
                        </p>
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            onClick={() => handleSendEstimate(selectedEst)}
                            className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-[12px] hover:bg-blue-700 transition-colors"
                            style={{ fontWeight: 600 }}>
                            <Send className="w-3 h-3" /> Send to Customer
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Labor */}
                  <div className="bg-white rounded-xl border border-border overflow-hidden">
                    <div className="px-4 py-3 border-b border-border text-[13px] text-foreground" style={{ fontWeight: 600 }}>Labor</div>
                    <table className="w-full text-[12px]">
                      <tbody className="divide-y divide-border">
                        {selectedEst.laborLines.map((l) => <tr key={l.id}><td className="px-4 py-3 text-foreground">{l.desc}</td><td className="px-4 py-3 text-right text-muted-foreground">{l.hours}h</td><td className="px-4 py-3 text-right text-foreground" style={{ fontWeight: 600 }}>${l.total.toFixed(2)}</td></tr>)}
                        {selectedEst.laborLines.length === 0 && (
                          <tr><td colSpan={3} className="px-4 py-4 text-center text-[12px] text-muted-foreground">No labor lines added yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Parts */}
                  {selectedEst.partsLines.length > 0 && (
                    <div className="bg-white rounded-xl border border-border overflow-hidden">
                      <div className="px-4 py-3 border-b border-border text-[13px] text-foreground" style={{ fontWeight: 600 }}>Parts</div>
                      <table className="w-full text-[12px]">
                        <tbody className="divide-y divide-border">
                          {selectedEst.partsLines.map((p) => <tr key={p.id}><td className="px-4 py-3 text-foreground">{p.desc}</td><td className="px-4 py-3 text-right text-muted-foreground">{p.pn}</td><td className="px-4 py-3 text-right text-foreground" style={{ fontWeight: 600 }}>${p.total.toFixed(2)}</td></tr>)}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Total + assumptions */}
                  <div className="bg-white rounded-xl border border-border p-4">
                    <div className="flex justify-between text-[14px] mb-3">
                      <span className="text-foreground" style={{ fontWeight: 700 }}>Total</span>
                      <span className="text-foreground tracking-tight" style={{ fontWeight: 700 }}>${selectedEst.total.toFixed(2)}</span>
                    </div>
                    {selectedEst.assumptions && (
                      <div className="text-[12px] text-muted-foreground bg-muted/30 rounded-lg p-3">{selectedEst.assumptions}</div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* No estimate selected */}
            {mainTab === "estimates" && !selectedEst && (
              <motion.div key="no-est" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="text-[14px]" style={{ fontWeight: 500 }}>Select an estimate</p>
                </div>
              </motion.div>
            )}

            {/* INVOICE DETAIL */}
            {mainTab === "invoices" && selectedInv && (() => {
              const invCfg = INV_STATUS_CONFIG[selectedInv.status] ?? INV_STATUS_CONFIG["Draft"];
              const payColor = INV_PAYMENT_CONFIG[selectedInv.paymentStatus] ?? "bg-slate-100 text-slate-500";
              const isOverdue = selectedInv.status === "Overdue";
              const isPaid = selectedInv.paymentStatus === "Paid";
              return (
                <motion.div key={selectedInv.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 overflow-y-auto px-6 py-5">
                  <div className="max-w-3xl space-y-5">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h2 className="text-[18px] text-foreground" style={{ fontWeight: 700 }}>{selectedInv.invoiceNumber}</h2>
                          <span className={`text-[11px] px-2.5 py-0.5 rounded-full ${invCfg.color}`} style={{ fontWeight: 600 }}>{selectedInv.status}</span>
                          <span className={`text-[11px] px-2.5 py-0.5 rounded-full ${payColor}`} style={{ fontWeight: 600 }}>{selectedInv.paymentStatus}</span>
                        </div>
                        <div className="text-[13px] text-muted-foreground">{selectedInv.aircraft} · {selectedInv.customer}</div>
                        {isOverdue && (
                          <div className="mt-1 text-[12px] text-red-600 flex items-center gap-1.5" style={{ fontWeight: 600 }}>
                            <AlarmClock className="w-3.5 h-3.5" /> Payment overdue — due {new Date(selectedInv.dueDate).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!isPaid && selectedInv.status !== "Sent" && (
                          <button onClick={() => handleSendInvoice(selectedInv)} className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                            <Send className="w-3.5 h-3.5" /> Send
                          </button>
                        )}
                        <button
                          onClick={() => openInvoicePdf(selectedInv.id)}
                          className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                          <Download className="w-3.5 h-3.5" /> PDF
                        </button>
                        {!isPaid && (
                          <button onClick={() => handleMarkInvoicePaid(selectedInv)} className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-lg text-[12px] hover:bg-emerald-700 transition-colors" style={{ fontWeight: 600 }}>
                            <CheckCircle className="w-3.5 h-3.5" /> Mark Paid
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Bill to + issue/due dates */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white rounded-xl border border-border p-4">
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2" style={{ fontWeight: 700 }}>Bill To</div>
                        <div className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>{selectedInv.customer}</div>
                        {selectedInv.company && <div className="text-[12px] text-muted-foreground">{selectedInv.company}</div>}
                        <div className="flex items-center gap-1.5 mt-2 text-[12px] text-muted-foreground">
                          <Plane className="w-3 h-3" /> {selectedInv.aircraft}
                        </div>
                      </div>
                      <div className="bg-white rounded-xl border border-border p-4">
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2" style={{ fontWeight: 700 }}>Dates</div>
                        <div className="space-y-1.5 text-[12px]">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Issued</span>
                            <span style={{ fontWeight: 500 }}>{new Date(selectedInv.issuedDate).toLocaleDateString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Due</span>
                            <span className={isOverdue ? "text-red-600" : ""} style={{ fontWeight: 500 }}>
                              {new Date(selectedInv.dueDate).toLocaleDateString()}
                            </span>
                          </div>
                          {selectedInv.linkedWorkOrder && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Work Order</span>
                              <span className="text-primary" style={{ fontWeight: 600 }}>{selectedInv.linkedWorkOrder || "—"}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Draft with no lines — guidance banner */}
                    {selectedInv.status === "Draft" && selectedInv.laborLines.length === 0 && selectedInv.partsLines.length === 0 && selectedInv.outsideServices.length === 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-4">
                        <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                          <Receipt className="w-5 h-5 text-amber-600" />
                        </div>
                        <div className="flex-1">
                          <div className="text-[13px] text-amber-900 mb-1" style={{ fontWeight: 700 }}>Standalone Invoice — Draft</div>
                          <p className="text-[12px] text-amber-700 leading-relaxed">
                            This invoice has no line items yet. To add labor and parts, create a Work Order and use the Invoice tab on the WO — or send this invoice as-is.
                          </p>
                          <button
                            onClick={() => handleSendInvoice(selectedInv)}
                            className="mt-3 flex items-center gap-1.5 bg-amber-600 text-white px-3 py-1.5 rounded-lg text-[12px] hover:bg-amber-700 transition-colors"
                            style={{ fontWeight: 600 }}>
                            <Send className="w-3 h-3" /> Send Invoice
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Line items */}
                    <div className="bg-white rounded-xl border border-border overflow-hidden">
                      <div className="px-4 py-3 border-b border-border text-[13px] text-foreground" style={{ fontWeight: 600 }}>Line Items</div>
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="border-b border-border bg-muted/20">
                            <th className="text-left px-4 py-2 text-muted-foreground" style={{ fontWeight: 600 }}>Description</th>
                            <th className="text-right px-4 py-2 text-muted-foreground w-24" style={{ fontWeight: 600 }}>Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {selectedInv.laborLines.map((l) => (
                            <tr key={l.id}>
                              <td className="px-4 py-2.5 text-foreground">
                                {l.desc}
                                <span className="text-muted-foreground ml-1">({l.hours}h @ ${l.rate}/hr)</span>
                              </td>
                              <td className="px-4 py-2.5 text-right text-foreground" style={{ fontWeight: 600 }}>${l.total.toFixed(2)}</td>
                            </tr>
                          ))}
                          {selectedInv.partsLines.map((p) => (
                            <tr key={p.id}>
                              <td className="px-4 py-2.5 text-foreground">
                                {p.desc}
                                <span className="text-muted-foreground ml-1">P/N {p.pn}</span>
                              </td>
                              <td className="px-4 py-2.5 text-right text-foreground" style={{ fontWeight: 600 }}>${p.total.toFixed(2)}</td>
                            </tr>
                          ))}
                          {selectedInv.outsideServices.map((o) => (
                            <tr key={o.id}>
                              <td className="px-4 py-2.5 text-foreground">{o.desc} <span className="text-muted-foreground">— {o.vendor}</span></td>
                              <td className="px-4 py-2.5 text-right text-foreground" style={{ fontWeight: 600 }}>${o.cost.toFixed(2)}</td>
                            </tr>
                          ))}
                          {selectedInv.laborLines.length === 0 && selectedInv.partsLines.length === 0 && selectedInv.outsideServices.length === 0 && (
                            <tr><td colSpan={2} className="px-4 py-5 text-center text-[12px] text-muted-foreground">No line items.</td></tr>
                          )}
                        </tbody>
                        <tfoot className="border-t-2 border-border">
                          {selectedInv.subtotalLabor > 0 && (
                            <tr className="bg-muted/10">
                              <td className="px-4 py-2 text-muted-foreground">Labor subtotal</td>
                              <td className="px-4 py-2 text-right text-muted-foreground">${selectedInv.subtotalLabor.toFixed(2)}</td>
                            </tr>
                          )}
                          {selectedInv.subtotalParts > 0 && (
                            <tr className="bg-muted/10">
                              <td className="px-4 py-2 text-muted-foreground">Parts subtotal</td>
                              <td className="px-4 py-2 text-right text-muted-foreground">${selectedInv.subtotalParts.toFixed(2)}</td>
                            </tr>
                          )}
                          {selectedInv.tax > 0 && (
                            <tr className="bg-muted/10">
                              <td className="px-4 py-2 text-muted-foreground">Tax ({(selectedInv.taxRate * 100).toFixed(1)}%)</td>
                              <td className="px-4 py-2 text-right text-muted-foreground">${selectedInv.tax.toFixed(2)}</td>
                            </tr>
                          )}
                          <tr className="bg-primary/5">
                            <td className="px-4 py-3 text-foreground" style={{ fontWeight: 700 }}>Total Due</td>
                            <td className="px-4 py-3 text-right text-[18px] text-foreground" style={{ fontWeight: 700 }}>${selectedInv.total.toFixed(2)}</td>
                          </tr>
                          {isPaid && (
                            <tr className="bg-emerald-50">
                              <td className="px-4 py-2 text-emerald-700" style={{ fontWeight: 600 }}>✓ Paid in Full</td>
                              <td className="px-4 py-2 text-right text-emerald-700" style={{ fontWeight: 600 }}>${selectedInv.amountPaid.toFixed(2)}</td>
                            </tr>
                          )}
                        </tfoot>
                      </table>
                    </div>

                    {/* Notes */}
                    {selectedInv.notes && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5" style={{ fontWeight: 700 }}>Notes</div>
                        <div className="text-[12px] text-muted-foreground leading-relaxed">{selectedInv.notes}</div>
                      </div>
                    )}

                    {/* Payment actions */}
                    {!isPaid && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => toast.info("Stripe payments coming soon — connect your Stripe account in Settings.")}
                          className="flex-1 flex items-center justify-center gap-2 bg-[#635BFF] text-white py-3 rounded-xl text-[13px] hover:bg-[#5851E5] transition-colors" style={{ fontWeight: 600 }}>
                          <Receipt className="w-4 h-4" /> Pay via Stripe
                        </button>
                        <button
                          onClick={() => handleMarkInvoicePaid(selectedInv)}
                          className="flex items-center gap-1.5 border border-border px-4 py-3 rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                          <Check className="w-4 h-4" /> Mark Paid Manually
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })()}

            {/* No invoice selected */}
            {mainTab === "invoices" && !selectedInv && (
              <motion.div key="no-inv" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Receipt className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="text-[14px]" style={{ fontWeight: 500 }}>Select an invoice</p>
                  <p className="text-[12px] mt-1">or create a new one with the button below</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Close Work Order Flow Modal ── */}
      <AnimatePresence>
        {showCloseFlow && selectedWO && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
              <div className="bg-[#0A1628] px-6 py-5 flex items-center justify-between">
                <div>
                  <div className="text-white text-[15px]" style={{ fontWeight: 700 }}>Close Work Order — {selectedWO.woNumber}</div>
                  <div className="text-white/50 text-[12px]">Step {closeStep} of 4</div>
                </div>
                <button onClick={() => setShowCloseFlow(false)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"><X className="w-4 h-4 text-white/60" /></button>
              </div>
              <div className="flex">
                {[1, 2, 3, 4].map((s) => <div key={s} className={`flex-1 h-1 ${s <= closeStep ? "bg-emerald-500" : "bg-border"} transition-all`} />)}
              </div>

              <div className="p-6 min-h-[360px] flex flex-col">
                {closeStep === 1 && (
                  <div>
                    <h3 className="text-[17px] text-foreground mb-1" style={{ fontWeight: 700 }}>Review AI Summary</h3>
                    <p className="text-[13px] text-muted-foreground mb-4">AI has reviewed all activity to draft a summary. Edit as needed.</p>
                    {closeGenerating ? (
                      <div className="flex flex-col items-center py-8">
                        <Bot className="w-10 h-10 text-primary animate-pulse mb-3" />
                        <div className="text-[13px] text-muted-foreground">AI is reading the work order thread...</div>
                      </div>
                    ) : (
                      <textarea value={closeAISummary} onChange={(e) => setCloseAISummary(e.target.value)} rows={10}
                        className="w-full border border-border rounded-xl px-4 py-3 text-[13px] outline-none resize-none focus:ring-2 focus:ring-primary/20 leading-relaxed" />
                    )}
                  </div>
                )}
                {closeStep === 2 && (
                  <div>
                    <h3 className="text-[17px] text-foreground mb-1" style={{ fontWeight: 700 }}>Finalize Line Items</h3>
                    <p className="text-[13px] text-muted-foreground mb-4">Confirm the billable items before invoicing.</p>
                    <div className="bg-muted/30 rounded-xl border border-border overflow-hidden">
                      <table className="w-full text-[12px]">
                        <thead><tr className="border-b border-border bg-white"><th className="text-left px-4 py-2.5 text-muted-foreground" style={{ fontWeight: 600 }}>Item</th><th className="text-right px-4 py-2.5 text-muted-foreground" style={{ fontWeight: 600 }}>Total</th></tr></thead>
                        <tbody className="divide-y divide-border">
                          {selectedWO.laborLines.map((l) => <tr key={l.id} className="bg-white"><td className="px-4 py-2.5 text-foreground">{l.desc} ({l.hours}h)</td><td className="px-4 py-2.5 text-right text-foreground" style={{ fontWeight: 600 }}>${l.total.toFixed(2)}</td></tr>)}
                          {selectedWO.partsLines.map((p) => <tr key={p.id} className="bg-white"><td className="px-4 py-2.5 text-foreground">{p.desc}</td><td className="px-4 py-2.5 text-right text-foreground" style={{ fontWeight: 600 }}>${p.total.toFixed(2)}</td></tr>)}
                        </tbody>
                        <tfoot><tr className="border-t-2 border-border bg-muted/20"><td className="px-4 py-3 text-foreground" style={{ fontWeight: 700 }}>Grand Total</td><td className="px-4 py-3 text-right text-foreground" style={{ fontWeight: 700 }}>${selectedWO.grandTotal.toFixed(2)}</td></tr></tfoot>
                      </table>
                    </div>
                  </div>
                )}
                {closeStep === 3 && (
                  <div>
                    <h3 className="text-[17px] text-foreground mb-1" style={{ fontWeight: 700 }}>Complete Paperwork</h3>
                    <p className="text-[13px] text-muted-foreground mb-5">Choose which records to create before closing.</p>
                    <div className="space-y-3">
                      {[
                        {
                          key: "logbook",
                          label: "Generate Logbook Entry",
                          desc: "AI-drafted maintenance entry ready to sign",
                          icon: FileText,
                          checked: closeGenerateLogbook,
                          onChange: setCloseGenerateLogbook,
                        },
                        {
                          key: "invoice",
                          label: "Create Invoice",
                          desc: "Auto-populated from line items",
                          icon: Receipt,
                          checked: closeCreateInvoice,
                          onChange: setCloseCreateInvoice,
                        },
                        {
                          key: "customer",
                          label: "Send Customer Summary",
                          desc: "Owner-visible summary posted to the work order",
                          icon: Bell,
                          checked: closeSendCustomerSummary,
                          onChange: setCloseSendCustomerSummary,
                        },
                      ].map((item) => (
                        <label key={item.label} className="flex items-center gap-4 bg-muted/30 border border-border rounded-xl p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={(event) => item.onChange(event.target.checked)}
                            className="w-4 h-4 accent-primary"
                          />
                          <item.icon className="w-5 h-5 text-primary shrink-0" />
                          <div>
                            <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{item.label}</div>
                            <div className="text-[12px] text-muted-foreground">{item.desc}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {closeStep === 4 && (
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                      <CheckCircle className="w-8 h-8 text-emerald-600" />
                    </div>
                    <div className="text-[20px] text-foreground mb-1.5" style={{ fontWeight: 700 }}>Work Order Closed</div>
                    <div className="text-[13px] text-muted-foreground text-center max-w-sm">
                      {selectedWO.woNumber} has been closed.
                      {closeGenerateLogbook ? " Logbook paperwork is ready." : ""}
                      {closeCreateInvoice || selectedWO.linkedInvoice ? " Invoice details are available." : ""}
                      {closeSendCustomerSummary ? " The customer summary has been posted." : ""}
                    </div>
                  </div>
                )}
              </div>

              {closeStep < 4 && (
                <div className="px-6 pb-5 flex items-center justify-between border-t border-border pt-4">
                  <button onClick={() => closeStep > 1 ? setCloseStep((s) => s - 1) : setShowCloseFlow(false)}
                    className="px-5 py-2.5 rounded-xl border border-border text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                    {closeStep > 1 ? "← Back" : "Cancel"}
                  </button>
                  <button onClick={async () => {
                    if (closeStep === 3 && selectedWO) {
                      // Perform actual closing
                      if (isSeedItem(selectedWO.id)) {
                        toast.info("Demo work order — create your own to use the close flow.");
                        setCloseStep(4);
                        return;
                      }
                      if (hasIncompleteRequiredChecklist) {
                        setWODetailTab("checklist");
                        setShowCloseFlow(false);
                        toast.error("Complete all required checklist items before closing this work order.");
                        return;
                      }

                      const closedAt = new Date().toISOString();
                      let linkedLogbookEntryId = selectedWO.linkedLogbookEntry;
                      let linkedInvoiceId = selectedWO.linkedInvoice;

                      if (closeGenerateLogbook) {
                        const entry = addLogbookEntry({
                          aircraft: selectedWO.aircraft,
                          makeModel: selectedWO.makeModel,
                          serial: selectedWO.serial || "",
                          engine: "",
                          date: new Date().toISOString().split("T")[0],
                          type: "Maintenance",
                          body:
                            closeAISummary ||
                            `Maintenance performed on ${selectedWO.aircraft} (${selectedWO.makeModel}). ${selectedWO.discrepancy || selectedWO.squawk}. Aircraft returned to service per FAR 43.9 and 43.11.`,
                          mechanic: activeMechanic.name,
                          certificateNumber: signingCertificateNumber,
                          status: "draft",
                          totalTime: 0,
                          linkedWO: selectedWO.id,
                        });
                        linkedLogbookEntryId = entry.id;
                      }

                      if (closeCreateInvoice && !linkedInvoiceId) {
                        const dueDate = new Date();
                        dueDate.setDate(dueDate.getDate() + 30);
                        const invoice = addInvoice(
                          {
                            invoiceNumber: `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
                            aircraft: selectedWO.aircraft,
                            customer: selectedWO.customer,
                            company: selectedWO.company || "",
                            issuedDate: new Date().toISOString(),
                            dueDate: dueDate.toISOString(),
                            status: "Draft",
                            laborLines: selectedWO.laborLines,
                            partsLines: selectedWO.partsLines,
                            outsideServices: selectedWO.outsideServices,
                            subtotalLabor: selectedWO.totalLabor,
                            subtotalParts: selectedWO.totalParts,
                            subtotalOutside: selectedWO.totalOutside,
                            taxRate: 0,
                            tax: 0,
                            shipping: 0,
                            total: selectedWO.grandTotal,
                            notes: `Work Order ${selectedWO.woNumber} — ${selectedWO.squawk}`,
                            paymentStatus: "Unpaid",
                            amountPaid: 0,
                            linkedWorkOrder: selectedWO.id,
                          },
                          {
                            onPersisted: (persistedInvoice) => {
                              void updateWorkOrder(selectedWO.id, { linkedInvoice: persistedInvoice.id });
                            },
                          }
                        );
                        linkedInvoiceId = invoice.id;
                        setSelectedInvId(invoice.id);
                      }

                      const closeSucceeded = await updateWorkOrder(selectedWO.id, {
                        status: "Closed",
                        closedDate: closedAt,
                        linkedInvoice: linkedInvoiceId,
                        linkedLogbookEntry: linkedLogbookEntryId,
                      });

                      if (!closeSucceeded) {
                        setWODetailTab("checklist");
                        toast.error("Unable to close the work order right now. Please review the checklist and try again.");
                        return;
                      }

                      addWorkOrderActivity(selectedWO.id, {
                        type: "status",
                        author: "You",
                        role: "Manager",
                        content: `Status changed: ${selectedWO.status} → Closed`,
                        visibility: "internal",
                        timestamp: closedAt,
                        statusFrom: selectedWO.status,
                        statusTo: "Closed",
                      });

                      if (closeSendCustomerSummary) {
                        addWorkOrderActivity(selectedWO.id, {
                          type: "owner-update",
                          author: activeMechanic.name,
                          role: activeMechanic.role,
                          content:
                            closeAISummary ||
                            `Work completed on ${selectedWO.aircraft}. ${selectedWO.discrepancy || selectedWO.squawk}`,
                          visibility: "owner-visible",
                          timestamp: closedAt,
                        });
                      }

                      setSelectedWOId(selectedWO.id);
                      toast.success(`${selectedWO.woNumber} closed — checklist complete and paperwork updated.`);
                      setCloseStep(4);
                    } else {
                      setCloseStep((s) => s + 1);
                    }
                  }} className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white text-[13px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
                    {closeStep === 3 ? <><CheckCircle className="w-4 h-4" /> Close Work Order</> : <>Continue →</>}
                  </button>
                </div>
              )}
              {closeStep === 4 && (
                <div className="px-6 pb-5 border-t border-border pt-4 flex justify-center gap-3">
                  {closeGenerateLogbook && (
                    <button onClick={() => { setWODetailTab("logbook"); setShowCloseFlow(false); }} className="flex items-center gap-1.5 border border-border px-4 py-2.5 rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                      <FileText className="w-4 h-4" /> Open Logbook Entry
                    </button>
                  )}
                  {(closeCreateInvoice || selectedWO.linkedInvoice) && (
                    <button onClick={() => { setWODetailTab("invoice"); setShowCloseFlow(false); }} className="flex items-center gap-1.5 bg-primary text-white px-5 py-2.5 rounded-xl text-[13px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
                      <Receipt className="w-4 h-4" /> View Invoice
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New WO Modal — full wizard */}
      <AnimatePresence>
        {showNewWOModal && (
          <CreateWorkOrderModal
            onClose={() => setShowNewWOModal(false)}
            onCreated={(id) => {
              setSelectedWOId(id);
              setWODetailTab("activity");
              setMainTab("workorders");
              toast.success("Work order created!");
            }}
          />
        )}
      </AnimatePresence>

      {/* New Estimate Modal — full wizard */}
      <AnimatePresence>
        {showNewEstModal && (
          <CreateEstimateModal
            onClose={() => setShowNewEstModal(false)}
            onCreated={(id) => {
              setShowNewEstModal(false);
              setSelectedEstId(id);
              setMainTab("estimates");
              toast.success("Estimate created — add line items to build your quote.");
            }}
          />
        )}
      </AnimatePresence>

      {/* New Invoice Modal — full wizard */}
      <AnimatePresence>
        {showNewInvModal && (
          <CreateInvoiceModal
            onClose={() => setShowNewInvModal(false)}
            onCreated={(id) => {
              setShowNewInvModal(false);
              setSelectedInvId(id);
              setMainTab("invoices");
              toast.success("Invoice created — review and send when ready.");
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
