"use client";

import Link from "@/components/shared/tenant-link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Plane, FileText, AlertTriangle, Clock, CheckCircle, ArrowRight,
  MessageSquare, Upload, Sparkles, Wrench, Receipt, DollarSign, Shield, Cpu,
  ChevronRight, Bell, Eye, ChevronDown, BookOpen, Bot, Plus
} from "lucide-react";
import { AnimatePresence } from "motion/react";
import {
  AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid
} from "recharts";
import { useDataStore } from "./workspace/DataStore";

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const DASHBOARD_TIME_ZONE = "America/Los_Angeles";

const formatCurrency = (value: number | null | undefined) => {
  if (!value || Number.isNaN(value)) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
};

const formatDashboardDate = (
  value: string | number | Date,
  options?: Intl.DateTimeFormatOptions
) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: DASHBOARD_TIME_ZONE,
    ...(options ?? {}),
  }).format(new Date(value));

const formatDashboardMonth = (value: Date) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: DASHBOARD_TIME_ZONE,
    month: "short",
  }).format(value);

const statusBadgeForDocuments = (docCount: number) => {
  if (docCount > 0) {
    return { label: "Records loaded", className: "text-emerald-600 bg-emerald-50 border-emerald-200" };
  }
  return { label: "Needs documents", className: "text-amber-600 bg-amber-50 border-amber-200" };
};

/* ── Health Ring component ── */
function HealthRing({ pct, size = 64, stroke = 7 }: { pct?: number | null; size?: number; stroke?: number }) {
  const hasValue = typeof pct === "number" && !Number.isNaN(pct);
  const safePct = hasValue ? Math.max(0, Math.min(100, pct as number)) : 0;
  const r = (size - stroke * 2) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (safePct / 100) * c;
  const color = !hasValue ? "#cbd5e1" : safePct >= 80 ? "#10b981" : safePct >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 1s ease" }} />
    </svg>
  );
}

/* ── Custom tooltip ── */
const DarkTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-foreground text-background text-[11px] px-3 py-2 rounded-lg shadow-xl">
      <div className="text-muted-foreground mb-1">{label}</div>
      {payload.map((p: any) => <div key={p.name} style={{ color: p.color || "#fff" }}>{p.name}: <strong>{p.value}</strong></div>)}
    </div>
  );
};

export function Dashboard() {
  const { aircraft, workOrders, invoices } = useDataStore();
  const [period] = useState("7d");
  const [selectedAircraftId, setSelectedAircraftId] = useState<string | null>(null);
  const [expandedTails, setExpandedTails] = useState<Set<string>>(new Set());

  const toggleExpanded = (tail: string) => {
    setExpandedTails((prev) => {
      const next = new Set(prev);
      if (next.has(tail)) next.delete(tail); else next.add(tail);
      return next;
    });
  };

  const woStatusColor = (status: string) => {
    if (status === "In Progress") return "bg-blue-50 text-blue-700 border-blue-200";
    if (status === "Awaiting Approval") return "bg-amber-50 text-amber-700 border-amber-200";
    if (status === "Awaiting Parts") return "bg-violet-50 text-violet-700 border-violet-200";
    if (status === "Closed" || status === "Invoice Paid") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    return "bg-slate-50 text-slate-700 border-slate-200";
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSelectedAircraftId(window.localStorage.getItem("owner_selected_aircraft_id"));
  }, []);
  const todayLabel = useMemo(() => {
    return formatDashboardDate(new Date(), {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, []);

  const fleet = useMemo(() => {
    return aircraft.map((ac) => {
      const docCount = (ac as { document_count?: number }).document_count ?? 0;
      const status = statusBadgeForDocuments(docCount);
      return {
        id: ac.id,
        tail: ac.tail_number ?? "",
        model: [ac.make, ac.model].filter(Boolean).join(" "),
        year: ac.year,
        status: status.label,
        statusColor: status.className,
        docs: docCount,
        health: null as number | null,
        lastActivity: docCount > 0 ? "Documents on file" : "Awaiting first upload",
      };
    });
  }, [aircraft]);

  const currentAircraftId =
    (selectedAircraftId && aircraft.some((candidate) => candidate.id === selectedAircraftId))
      ? selectedAircraftId
      : aircraft[0]?.id ?? null;

  const askHref = currentAircraftId ? `/ask?aircraft=${encodeURIComponent(currentAircraftId)}` : "/ask";
  const workspaceHref = currentAircraftId ? `/workspace?aircraft=${encodeURIComponent(currentAircraftId)}` : "/workspace";

  const openWorkOrders = useMemo(() => {
    return workOrders.filter((wo) => !["Closed", "Invoice Paid", "Archived"].includes(wo.status));
  }, [workOrders]);
  const openWorkOrderCount = openWorkOrders.length;

  const pendingWorkOrders = useMemo(() => {
    return workOrders.filter((wo) => wo.status === "Awaiting Approval");
  }, [workOrders]);

  const pendingInvoices = useMemo(() => {
    return invoices.filter((inv) => ["Draft", "Sent", "Overdue"].includes(inv.status));
  }, [invoices]);

  const pendingActions = useMemo(() => {
    const actions: Array<{
      type: "workorder" | "invoice";
      id: string;
      label: string;
      aircraft: string;
      amount: string | null;
      urgency: "high" | "medium";
      cmd: string;
    }> = [];

    pendingWorkOrders.forEach((wo) => {
      actions.push({
        type: "workorder",
        id: wo.woNumber || wo.id.slice(0, 8).toUpperCase(),
        label: wo.squawk || "Work Order Awaiting Approval",
        aircraft: wo.aircraft || "Unassigned aircraft",
        amount: formatCurrency(wo.grandTotal) ?? null,
        urgency: "medium",
        cmd: `approve work order ${wo.woNumber || wo.id.slice(0, 8)}`,
      });
    });

    pendingInvoices.forEach((inv) => {
      actions.push({
        type: "invoice",
        id: inv.invoiceNumber || inv.id.slice(0, 8).toUpperCase(),
        label: inv.status === "Overdue" ? "Overdue Invoice" : "Invoice awaiting action",
        aircraft: inv.aircraft || "Unassigned aircraft",
        amount: formatCurrency(inv.total) ?? null,
        urgency: inv.status === "Overdue" ? "high" : "medium",
        cmd: `send invoice ${inv.invoiceNumber || inv.id.slice(0, 8)}`,
      });
    });

    return actions;
  }, [pendingWorkOrders, pendingInvoices]);

  const pendingCount = pendingActions.length;

  const docCountTotal = useMemo(() => {
    return aircraft.reduce((sum, ac) => sum + ((ac as { document_count?: number }).document_count ?? 0), 0);
  }, [aircraft]);
  const aircraftCount = aircraft.length;

  const monthlySpend = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 7 }, (_, idx) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 6 + idx, 1);
      return {
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: formatDashboardMonth(d),
        month: d.getMonth(),
        year: d.getFullYear(),
      };
    });
    return months.map((m) => {
      const total = invoices.reduce((sum, inv) => {
        const dateStr = inv.issuedDate || inv.createdAt;
        if (!dateStr) return sum;
        const date = new Date(dateStr);
        if (date.getFullYear() === m.year && date.getMonth() === m.month) {
          return sum + (inv.total || 0);
        }
        return sum;
      }, 0);
      return { m: m.label, v: total };
    });
  }, [invoices]);

  const monthlyWorkOrders = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 7 }, (_, idx) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 6 + idx, 1);
      return {
        label: formatDashboardMonth(d),
        month: d.getMonth(),
        year: d.getFullYear(),
      };
    });
    return months.map((m) => {
      const count = workOrders.reduce((sum, wo) => {
        const dateStr = wo.openedDate || wo.createdAt;
        if (!dateStr) return sum;
        const date = new Date(dateStr);
        if (date.getFullYear() === m.year && date.getMonth() === m.month) {
          return sum + 1;
        }
        return sum;
      }, 0);
      return { m: m.label, wo: count };
    });
  }, [workOrders]);

  const totalSpend = monthlySpend.reduce((s, d) => s + d.v, 0);
  const docValue = docCountTotal > 0 ? docCountTotal.toLocaleString() : "—";
  const spendValue = invoices.length > 0 ? (formatCurrency(totalSpend) ?? "$0") : "—";
  const hasSpendData = monthlySpend.some((d) => d.v > 0);
  const spendTrend = useMemo(() => {
    const n = monthlySpend.length;
    if (n < 2) return null;
    const current = monthlySpend[n - 1].v;
    const prior = monthlySpend[n - 2].v;
    if (current === 0 && prior === 0) return null;
    if (prior === 0) return { direction: "up" as const, pct: null };
    const pct = Math.round(((current - prior) / prior) * 100);
    if (pct === 0) return { direction: "flat" as const, pct: 0 };
    return { direction: pct > 0 ? ("up" as const) : ("down" as const), pct: Math.abs(pct) };
  }, [monthlySpend]);
  const hasWorkOrderHistory = monthlyWorkOrders.some((d) => d.wo > 0);

  const workOrderStatusDist = useMemo(() => {
    const buckets = {
      Open: 0,
      "In Progress": 0,
      "Awaiting Approval": 0,
    };
    workOrders.forEach((wo) => {
      if (wo.status === "Awaiting Approval") buckets["Awaiting Approval"] += 1;
      else if (["In Progress", "Awaiting Parts", "Waiting Customer", "Ready for Signoff"].includes(wo.status)) {
        buckets["In Progress"] += 1;
      } else if (["Open", "Draft"].includes(wo.status)) {
        buckets.Open += 1;
      }
    });
    const colors: Record<string, string> = {
      Open: "#3b82f6",
      "In Progress": "#f59e0b",
      "Awaiting Approval": "#ef4444",
    };
    return Object.entries(buckets)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ name, value, fill: colors[name] ?? "#94a3b8" }));
  }, [workOrders]);

  const workOrderStatusTotal = workOrderStatusDist.reduce((sum, d) => sum + d.value, 0);

  const recentActivity = useMemo(() => {
    const events: Array<{ icon: any; text: string; aircraft: string; time: string; color: string; timestamp: number }> = [];
    workOrders.forEach((wo) => {
      const ts = new Date(wo.updatedAt || wo.createdAt).getTime();
      events.push({
        icon: Wrench,
        text: `Work order ${wo.woNumber || wo.id.slice(0, 6)} updated`,
        aircraft: wo.aircraft || "Unassigned aircraft",
        time: formatDashboardDate(ts),
        color: "text-violet-600 bg-violet-50",
        timestamp: ts,
      });
    });
    invoices.forEach((inv) => {
      const ts = new Date(inv.updatedAt || inv.createdAt).getTime();
      events.push({
        icon: Receipt,
        text: `Invoice ${inv.invoiceNumber || inv.id.slice(0, 6)} ${inv.status.toLowerCase()}`,
        aircraft: inv.aircraft || "Unassigned aircraft",
        time: formatDashboardDate(ts),
        color: "text-emerald-600 bg-emerald-50",
        timestamp: ts,
      });
    });
    return events.sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
  }, [workOrders, invoices]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] text-foreground tracking-tight mb-0.5" style={{ fontWeight: 800 }}>
            Good morning
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {todayLabel} · Your fleet has{" "}
            <span className="text-amber-600" style={{ fontWeight: 600 }}>
              {openWorkOrderCount} open work orders
            </span>{" "}
            and {pendingCount} items pending your action
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href={workspaceHref}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-primary to-primary/80 text-white px-5 py-2.5 rounded-xl hover:opacity-90 transition-all shadow-lg shadow-primary/20 text-[13px]"
            style={{ fontWeight: 600 }}>
            <Cpu className="w-4 h-4" /> AI Command Center
          </Link>
          <Link href={askHref}
            className="inline-flex items-center gap-2 border border-border text-foreground px-5 py-2.5 rounded-xl hover:bg-muted transition-colors text-[13px]"
            style={{ fontWeight: 500 }}>
            <MessageSquare className="w-4 h-4" /> Ask Aircraft
          </Link>
        </div>
      </div>

      {/* ── Stat Cards Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {[
          {
            label: "Aircraft",
            value: aircraftCount ? String(aircraftCount) : "—",
            sub: aircraftCount ? `${aircraftCount} active` : "No aircraft yet",
            icon: Plane,
            color: "text-primary bg-primary/8",
            trend: null as string | null,
          },
          {
            label: "Open Work Orders",
            value: openWorkOrderCount ? String(openWorkOrderCount) : "—",
            sub: openWorkOrderCount ? "Active across fleet" : "No open work orders",
            icon: AlertTriangle,
            color: "text-amber-600 bg-amber-50",
            trend: null,
          },
          {
            label: "Documents",
            value: docValue,
            sub: docCountTotal > 0 ? "Indexed documents" : "No documents yet",
            icon: FileText,
            color: "text-blue-600 bg-blue-50",
            trend: null,
          },
          {
            label: "Pending Actions",
            value: pendingCount ? String(pendingCount) : "—",
            sub: pendingCount ? "Requires review" : "Nothing pending",
            icon: Clock,
            color: "text-amber-600 bg-amber-50",
            trend: null,
          },
          {
            label: "YTD Spend",
            value: spendValue,
            sub: invoices.length > 0 ? "Across all aircraft" : "No invoices yet",
            icon: DollarSign,
            color: "text-emerald-600 bg-emerald-50",
            trend: null,
          },
          {
            label: "Compliance Score",
            value: "—",
            sub: "No compliance data yet",
            icon: Shield,
            color: "text-violet-600 bg-violet-50",
            trend: null,
          },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.4 }}
            className="bg-white rounded-2xl border border-border p-4 hover:shadow-md hover:shadow-primary/5 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.color}`}>
                <s.icon className="w-[17px] h-[17px]" />
              </div>
              {s.trend && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${s.trend.startsWith("+") ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`} style={{ fontWeight: 600 }}>
                  {s.trend}
                </span>
              )}
            </div>
            <div className="text-[26px] text-foreground tracking-tight leading-none mb-1" style={{ fontWeight: 800 }}>{s.value}</div>
            <div className="text-[11px] text-muted-foreground">{s.label}</div>
            <div className="text-[10px] text-muted-foreground/60 mt-0.5">{s.sub}</div>
          </motion.div>
        ))}
      </div>

      {/* ── Main Grid Row 2 ── */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* Fleet Cards — spans 2 cols */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>Fleet Status</h2>
            <Link href="/aircraft" className="text-[12px] text-primary flex items-center gap-1" style={{ fontWeight: 500 }}>
              View all <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {fleet.map((ac, i) => {
            const isExpanded = expandedTails.has(ac.tail);
            const tailWorkOrders = workOrders.filter((wo) => wo.aircraft === ac.tail);
            const askForAircraft = `/ask?aircraft=${encodeURIComponent(ac.id)}`;
            return (
            <motion.div key={ac.tail} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.08 }}
              className="bg-white rounded-2xl border border-border overflow-hidden hover:shadow-lg hover:shadow-primary/8 transition-shadow">
              <button
                type="button"
                onClick={() => toggleExpanded(ac.tail)}
                aria-expanded={isExpanded}
                className="w-full text-left p-5 group"
              >
                <div className="flex items-center gap-4">
                  {/* Health ring */}
                  <div className="relative shrink-0">
                    <HealthRing pct={ac.health} size={58} stroke={6} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span
                        className="text-[11px]"
                        style={{
                          fontWeight: 700,
                          color: typeof ac.health === "number"
                            ? ac.health >= 80
                              ? "#10b981"
                              : ac.health >= 50
                                ? "#f59e0b"
                                : "#ef4444"
                            : "#94a3b8",
                        }}
                      >
                        {typeof ac.health === "number" ? `${ac.health}%` : "—"}
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>{ac.tail}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${ac.statusColor}`} style={{ fontWeight: 600 }}>{ac.status}</span>
                      {tailWorkOrders.length > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200" style={{ fontWeight: 600 }}>
                          {tailWorkOrders.length} WO
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-muted-foreground">
                      {ac.model || "Aircraft details pending"}{ac.year ? ` · ${ac.year}` : ""}
                    </div>
                  </div>

                  <div className="hidden md:grid grid-cols-3 gap-6 text-right">
                    {[
                      { label: "Year", val: ac.year ? String(ac.year) : "—" },
                      { label: "Documents", val: ac.docs ? `${ac.docs}` : "—" },
                      { label: "Work Orders", val: tailWorkOrders.length > 0 ? String(tailWorkOrders.length) : "—" },
                    ].map(d => (
                      <div key={d.label}>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5" style={{ fontWeight: 600 }}>{d.label}</div>
                        <div className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>{d.val}</div>
                      </div>
                    ))}
                  </div>

                  <ChevronDown
                    className={`w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-all shrink-0 ${isExpanded ? "rotate-180" : ""}`}
                  />
                </div>

                {/* Health bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                    <span>{ac.lastActivity}</span>
                    <span>{typeof ac.health === "number" ? `Health ${ac.health}%` : "Health pending"}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${typeof ac.health === "number" ? ac.health : 0}%` }}
                      transition={{ duration: 1, delay: 0.4 + i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                      className="h-full rounded-full"
                      style={{ background: typeof ac.health === "number" ? (ac.health >= 80 ? "#10b981" : ac.health >= 50 ? "#f59e0b" : "#ef4444") : "#e2e8f0" }}
                    />
                  </div>
                </div>
              </button>

              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    key="expansion"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden border-t border-border bg-slate-50/50"
                  >
                    <div className="p-5 space-y-4">
                      {/* Quick action grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <Link href={`/aircraft/${ac.tail}`} className="flex items-center gap-2 px-3 py-2 bg-white border border-border rounded-lg text-[12px] hover:border-primary hover:bg-primary/5 transition-colors" style={{ fontWeight: 500 }}>
                          <Plane className="w-3.5 h-3.5 text-primary" /> Aircraft detail
                        </Link>
                        <Link href={`/documents?aircraft=${encodeURIComponent(ac.id)}`} className="flex items-center gap-2 px-3 py-2 bg-white border border-border rounded-lg text-[12px] hover:border-primary hover:bg-primary/5 transition-colors" style={{ fontWeight: 500 }}>
                          <FileText className="w-3.5 h-3.5 text-primary" /> Documents <span className="text-muted-foreground">({ac.docs})</span>
                        </Link>
                        <Link href={`/aircraft/${ac.tail}/logbook`} className="flex items-center gap-2 px-3 py-2 bg-white border border-border rounded-lg text-[12px] hover:border-primary hover:bg-primary/5 transition-colors" style={{ fontWeight: 500 }}>
                          <BookOpen className="w-3.5 h-3.5 text-primary" /> Logbook
                        </Link>
                        <Link href={askForAircraft} className="flex items-center gap-2 px-3 py-2 bg-white border border-border rounded-lg text-[12px] hover:border-primary hover:bg-primary/5 transition-colors" style={{ fontWeight: 500 }}>
                          <Bot className="w-3.5 h-3.5 text-primary" /> Ask AI
                        </Link>
                      </div>

                      {/* Work orders list */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-[11px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>
                            Work orders
                          </div>
                          <Link href={`/work-orders/new?aircraft=${encodeURIComponent(ac.id)}`} className="text-[11px] text-primary flex items-center gap-1" style={{ fontWeight: 500 }}>
                            <Plus className="w-3 h-3" /> New
                          </Link>
                        </div>
                        {tailWorkOrders.length === 0 ? (
                          <div className="text-[12px] text-muted-foreground bg-white border border-border rounded-lg px-3 py-3">
                            No work orders for this aircraft.
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {tailWorkOrders.slice(0, 6).map((wo) => (
                              <Link
                                key={wo.id}
                                href={`/work-orders/${wo.id}`}
                                className="flex items-center gap-3 px-3 py-2 bg-white border border-border rounded-lg hover:border-primary/40 hover:bg-primary/5 transition-colors"
                              >
                                <Wrench className="w-3.5 h-3.5 text-violet-600 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>{wo.woNumber}</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${woStatusColor(wo.status)}`} style={{ fontWeight: 600 }}>{wo.status}</span>
                                  </div>
                                  {wo.squawk && (
                                    <div className="text-[11px] text-muted-foreground truncate">{wo.squawk}</div>
                                  )}
                                </div>
                                {wo.grandTotal > 0 && (
                                  <span className="text-[11px] text-foreground shrink-0" style={{ fontWeight: 600 }}>
                                    {formatCurrency(wo.grandTotal)}
                                  </span>
                                )}
                                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                              </Link>
                            ))}
                            {tailWorkOrders.length > 6 && (
                              <Link href={`/work-orders?aircraft=${encodeURIComponent(ac.id)}`} className="block text-center text-[11px] text-primary py-1" style={{ fontWeight: 500 }}>
                                View all {tailWorkOrders.length} work orders →
                              </Link>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
            );
          })}
        </div>

        {/* Pending Actions Panel */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>Needs Attention</h2>
            <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-[10px] flex items-center justify-center" style={{ fontWeight: 700 }}>{pendingCount}</span>
          </div>

          {pendingActions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-border p-4 text-sm text-muted-foreground">
              No pending approvals right now.
            </div>
          ) : (
            pendingActions.map((item, i) => {
              const icons: Record<string, any> = { workorder: Wrench, invoice: Receipt };
              const colors: Record<string, string> = { workorder: "text-violet-600 bg-violet-50", invoice: "text-emerald-600 bg-emerald-50" };
              const Icon = icons[item.type];
              return (
                <motion.div key={item.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.08 }}>
                  <Link href="/workspace"
                    className={`block bg-white border rounded-2xl p-4 hover:shadow-md transition-all border-l-4 ${item.urgency === "high" ? "border-l-red-400 hover:border-l-red-500" : "border-l-amber-400 hover:border-l-amber-500"} border-border`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${colors[item.type]}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] text-foreground truncate" style={{ fontWeight: 600 }}>{item.id}</span>
                          {item.amount && <span className="text-[12px] text-emerald-600 shrink-0" style={{ fontWeight: 700 }}>{item.amount}</span>}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">{item.label} · {item.aircraft}</div>
                        <div className="text-[10px] text-primary mt-1.5 font-mono truncate opacity-60">› {item.cmd}</div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })
          )}

          {/* Upcoming */}
          <div className="mt-2">
            <h3 className="text-[14px] text-foreground mb-3" style={{ fontWeight: 700 }}>Upcoming Events</h3>
            <div className="bg-white rounded-2xl border border-border overflow-hidden">
              {fleet.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">No upcoming events yet.</div>
              ) : (
                <div className="px-4 py-6 text-sm text-muted-foreground">Upcoming events will appear once maintenance data is connected.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Charts Row ── */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* Maintenance Spend - Area Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-border p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>Maintenance Spend</h3>
              <p className="text-[12px] text-muted-foreground">7-month rolling view · All aircraft</p>
            </div>
            <div className="text-right">
              <div className="text-[22px] text-foreground tracking-tight" style={{ fontWeight: 800 }}>${(totalSpend / 1000).toFixed(1)}K</div>
              {spendTrend && (
                <div
                  className={`text-[11px] ${spendTrend.direction === "up" ? "text-amber-600" : spendTrend.direction === "down" ? "text-emerald-600" : "text-muted-foreground"}`}
                  style={{ fontWeight: 500 }}
                >
                  {spendTrend.direction === "up" ? "↑" : spendTrend.direction === "down" ? "↓" : "→"}{" "}
                  {spendTrend.pct === null ? "new spend" : `${spendTrend.pct}% vs prior month`}
                </div>
              )}
            </div>
          </div>
          {hasSpendData ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart id="dash-area-spend" data={monthlySpend}>
                <CartesianGrid key="cg" strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis key="xa" dataKey="m" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis key="ya" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v/1000}k`} />
                <Tooltip key="tt" content={<DarkTip />} />
                <Area key="ar" type="monotone" dataKey="v" name="Spend" stroke="#2563EB" strokeWidth={2.5} fill="#2563EB" fillOpacity={0.08} dot={false} activeDot={{ r: 5, fill: "#2563EB" }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
              No spend history yet.
            </div>
          )}
        </div>

        {/* Work Order Status */}
        <div className="bg-white rounded-2xl border border-border p-6">
          <h3 className="text-[15px] text-foreground mb-1" style={{ fontWeight: 700 }}>Work Order Status</h3>
          <p className="text-[12px] text-muted-foreground mb-4">{openWorkOrderCount} open across fleet</p>
          {workOrderStatusDist.length > 0 ? (
            <>
              <div className="flex justify-center mb-4">
                <PieChart width={160} height={160}>
                  <Pie data={workOrderStatusDist} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={4}>
                    {workOrderStatusDist.map((d, i) => <Cell key={`wo-status-${i}`} fill={d.fill} />)}
                  </Pie>
                  <Tooltip content={<DarkTip />} />
                </PieChart>
              </div>
              <div className="space-y-2">
                {workOrderStatusDist.map(d => (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: d.fill }} />
                      <span className="text-[12px] text-muted-foreground">{d.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(d.value / workOrderStatusTotal) * 100}%`, background: d.fill }} />
                      </div>
                      <span className="text-[12px] text-foreground w-4 text-right" style={{ fontWeight: 600 }}>{d.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
              No work orders yet.
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Row ── */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* Activity Chart */}
        <div className="bg-white rounded-2xl border border-border p-6">
          <h3 className="text-[15px] text-foreground mb-1" style={{ fontWeight: 700 }}>Work Orders by Month</h3>
          <p className="text-[12px] text-muted-foreground mb-4">7-month history</p>
          {hasWorkOrderHistory ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart id="dash-bar-wo" data={monthlyWorkOrders} barSize={20}>
                <CartesianGrid key="cg" strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis key="xa" dataKey="m" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis key="ya" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip key="tt" content={<DarkTip />} />
                <Bar key="br" dataKey="wo" name="Work Orders" fill="#2563EB" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[160px] flex items-center justify-center text-sm text-muted-foreground">
              No work order history yet.
            </div>
          )}
        </div>

        {/* Compliance Bars */}
        <div className="bg-white rounded-2xl border border-border p-6">
          <h3 className="text-[15px] text-foreground mb-1" style={{ fontWeight: 700 }}>Compliance Score</h3>
          <p className="text-[12px] text-muted-foreground mb-5">Fleet average by category</p>
          <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">
            Compliance scores will appear once records are fully analyzed.
          </div>
        </div>

        {/* Activity Feed */}
        <div className="bg-white rounded-2xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>Recent Activity</h3>
            <Bell className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="space-y-3">
            {recentActivity.length > 0 ? (
              recentActivity.map((a, i) => (
              <div key={`activity-${i}`} className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${a.color}`}>
                  <a.icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-foreground leading-relaxed">{a.text}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{a.aircraft} · {a.time}</div>
                </div>
              </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">No recent activity yet.</div>
            )}
          </div>

          {/* Quick actions */}
          <div className="mt-5 pt-4 border-t border-border">
            <div className="text-[11px] text-muted-foreground mb-3 uppercase tracking-wide" style={{ fontWeight: 600 }}>Quick Actions</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: Upload,       label: "Upload Docs",    href: "/documents" },
                { icon: MessageSquare,label: "Ask Aircraft",   href: askHref },
                { icon: Cpu,          label: "Command AI",     href: workspaceHref },
                { icon: Eye,          label: "Review Queue",   href: "/documents" },
              ].map(a => (
                <Link key={a.label} href={a.href}
                  className="flex items-center gap-2 bg-muted/40 hover:bg-muted rounded-xl px-3 py-2.5 transition-colors">
                  <a.icon className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[11px] text-foreground" style={{ fontWeight: 500 }}>{a.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── AI Teaser Banner ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
        <Link href={workspaceHref}
          className="block bg-gradient-to-r from-[#0A1628] to-[#1E3A5F] rounded-2xl p-6 hover:opacity-95 transition-opacity group">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div>
                <div className="text-[15px] text-white mb-1" style={{ fontWeight: 700 }}>AircraftDesk AI Command Center</div>
                <div className="text-[13px] text-white/50">
                  Type <span className="text-primary font-mono text-[12px]">"approve estimate EST-2026-0018"</span> or <span className="text-primary font-mono text-[12px]">"what needs my attention today?"</span> — AI understands plain English
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-white/60 group-hover:text-white transition-colors shrink-0">
              <span className="text-[13px]" style={{ fontWeight: 500 }}>Open</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </Link>
      </motion.div>
    </div>
  );
}
