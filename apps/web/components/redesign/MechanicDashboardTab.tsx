"use client";

import Link from "@/components/shared/tenant-link";
import { motion } from "motion/react";
import { useMemo } from "react";
import {
  Wrench, BookOpen, AlertTriangle, ArrowRight, Sparkles, DollarSign, Users,
  ChevronRight, Timer
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell
} from "recharts";
import { useDataStore } from "./workspace/DataStore";
import { useAppContext } from "./AppContext";

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short" });
const DAY_FORMATTER = new Intl.DateTimeFormat("en-US", { weekday: "short" });

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactCurrency(value: number) {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return formatCurrency(value);
}

function daysSince(dateLike?: string) {
  if (!dateLike) return 0;
  const ts = new Date(dateLike).getTime();
  if (Number.isNaN(ts)) return 0;
  return Math.max(0, Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24)));
}

function inferPriority(text: string, status: string): "High" | "Medium" | "Low" {
  const haystack = `${text} ${status}`.toLowerCase();
  if (/(alternator|brake|fuel|gear|magneto|ad|compliance|urgent|ground)/.test(haystack)) return "High";
  if (/(annual|100-hour|inspection|avionics|scheduled|transponder|elt)/.test(haystack)) return "Medium";
  return "Low";
}

function inferWorkProgress(status: string) {
  switch (status) {
    case "In Progress":
      return 62;
    case "Awaiting Parts":
      return 45;
    case "Awaiting Approval":
    case "Waiting Customer":
      return 70;
    case "Ready for Signoff":
      return 90;
    case "Closed":
    case "Invoice Paid":
    case "Archived":
      return 100;
    default:
      return 0;
  }
}

/* ── Custom tooltip ── */
const DarkTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-foreground text-background text-[11px] px-3 py-2 rounded-lg shadow-xl">
      <div className="text-muted-foreground mb-1">{label}</div>
      {payload.map((p: any) => <div key={p.name} style={{ color: p.color || "#fff" }}>{p.name}: <strong>${p.value?.toLocaleString?.() ?? p.value}</strong></div>)}
    </div>
  );
};

/* ── Health Ring ── */
function HealthRing({ pct, size = 56, stroke = 6 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke * 2) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const color = pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 1.2s ease" }} />
    </svg>
  );
}

export function MechanicDashboardTab() {
  const { workOrders, invoices, customers, estimates, logbookEntries } = useDataStore();
  const { activeMechanic } = useAppContext();
  const softCardBorder = "border-[#E5EAF3]";

  const workOrderQueue = useMemo(() => {
    return workOrders
      .filter((wo) => wo.status !== "Archived")
      .sort((a, b) => {
        const openA = new Date(a.openedDate || a.createdAt).getTime();
        const openB = new Date(b.openedDate || b.createdAt).getTime();
        return openB - openA;
      })
      .slice(0, 4)
      .map((wo) => ({
        id: wo.woNumber,
        aircraft: wo.aircraft || "Unassigned",
        model: wo.makeModel || "Aircraft record",
        desc: wo.serviceType || wo.squawk || "Maintenance work order",
        status: wo.status,
        est: formatCurrency(wo.grandTotal || 0),
        daysOpen: daysSince(wo.openedDate || wo.createdAt),
        priority: inferPriority(`${wo.serviceType} ${wo.squawk} ${wo.discrepancy}`, wo.status),
        progress: inferWorkProgress(wo.status),
      }));
  }, [workOrders]);

  const openWorkOrders = useMemo(
    () => workOrders.filter((wo) => !["Closed", "Invoice Paid", "Archived"].includes(wo.status)),
    [workOrders]
  );

  const openSquawks = useMemo(() => {
    return openWorkOrders
      .filter((wo) => Boolean(wo.squawk || wo.discrepancy))
      .slice(0, 4)
      .map((wo) => ({
        id: wo.id,
        aircraft: wo.aircraft || "Unassigned",
        desc: wo.squawk || wo.discrepancy || wo.serviceType || "Open discrepancy",
        sev: inferPriority(`${wo.squawk} ${wo.discrepancy}`, wo.status),
        customer: wo.customer || wo.company || "Customer",
      }));
  }, [openWorkOrders]);

  const customerCards = useMemo(() => {
    return customers.slice(0, 3).map((customer) => ({
      name: customer.name,
      aircraft: customer.aircraft[0] || "No aircraft",
      model: customer.company || "Customer account",
      wos: workOrders.filter((wo) => wo.customer === customer.name || wo.company === customer.company).length,
      spent: formatCurrency(customer.totalBilled || 0),
    }));
  }, [customers, workOrders]);

  const revenueData = useMemo(() => {
    const months = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(1);
      date.setMonth(date.getMonth() - (6 - index));
      return {
        key: `${date.getFullYear()}-${date.getMonth()}`,
        m: MONTH_FORMATTER.format(date),
        billed: 0,
        collected: 0,
      };
    });
    const monthMap = new Map(months.map((m) => [m.key, m]));
    for (const invoice of invoices) {
      const baseDate = invoice.issuedDate || invoice.createdAt;
      const date = baseDate ? new Date(baseDate) : null;
      if (!date || Number.isNaN(date.getTime())) continue;
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const bucket = monthMap.get(key);
      if (!bucket) continue;
      bucket.billed += invoice.total || 0;
      bucket.collected += invoice.paymentStatus === "Paid" ? invoice.total || 0 : invoice.amountPaid || 0;
    }
    return months;
  }, [invoices]);

  const totalBilled = revenueData.reduce((sum, row) => sum + row.billed, 0);
  const totalCollected = revenueData.reduce((sum, row) => sum + row.collected, 0);

  const laborHours = useMemo(() => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((m) => ({ m, h: 0 }));
    const dayMap = new Map(days.map((d) => [d.m, d]));
    for (const wo of workOrders) {
      const sourceDate = wo.updatedAt || wo.openedDate || wo.createdAt;
      const date = sourceDate ? new Date(sourceDate) : null;
      if (!date || Number.isNaN(date.getTime())) continue;
      const key = DAY_FORMATTER.format(date);
      const bucket = dayMap.get(key);
      if (!bucket) continue;
      bucket.h += wo.laborLines.reduce((sum, line) => sum + (line.hours || 0), 0);
    }
    return days;
  }, [workOrders]);

  const weeklyHours = laborHours.reduce((sum, row) => sum + row.h, 0);

  const woStatusData = useMemo(() => {
    const entries = [
      { name: "In Progress", value: 0, fill: "#2563eb" },
      { name: "Pending", value: 0, fill: "#f59e0b" },
      { name: "Completed", value: 0, fill: "#10b981" },
      { name: "Scheduled", value: 0, fill: "#8b5cf6" },
    ];
    const map = new Map(entries.map((entry) => [entry.name, entry]));
    for (const wo of workOrders) {
      if (wo.status === "In Progress") map.get("In Progress")!.value += 1;
      else if (["Pending", "Awaiting Parts", "Awaiting Approval", "Waiting Customer"].includes(wo.status)) map.get("Pending")!.value += 1;
      else if (["Closed", "Invoice Paid"].includes(wo.status)) map.get("Completed")!.value += 1;
      else if (["Draft", "Open", "Ready for Signoff"].includes(wo.status)) map.get("Scheduled")!.value += 1;
    }
    return entries;
  }, [workOrders]);

  const skillUtil = useMemo(() => {
    const buckets = [
      { name: "Airframe", value: 0, fill: "#2563eb", matches: /airframe|brake|tire|gear|structure/i },
      { name: "Engine", value: 0, fill: "#10b981", matches: /engine|oil|cylinder|magneto|prop/i },
      { name: "Avionics", value: 0, fill: "#8b5cf6", matches: /avionics|gps|transponder|elt|pitot|static/i },
      { name: "Inspection", value: 0, fill: "#f59e0b", matches: /inspection|annual|100-hour|ad|compliance/i },
    ];
    const total = Math.max(workOrders.length, 1);
    for (const wo of workOrders) {
      const haystack = `${wo.serviceType} ${wo.squawk} ${wo.discrepancy}`;
      let matched = false;
      for (const bucket of buckets) {
        if (bucket.matches.test(haystack)) {
          bucket.value += 1;
          matched = true;
          break;
        }
      }
      if (!matched) buckets[0].value += 1;
    }
    return buckets.map((bucket) => ({
      ...bucket,
      value: Math.max(0, Math.min(100, Math.round((bucket.value / total) * 100))),
    }));
  }, [workOrders]);

  const openWOs = openWorkOrders.length;
  const activeCustomers = customers.length;
  const draftEntries = logbookEntries.filter((entry) => entry.status === "draft").length + estimates.filter((est) => est.status === "Draft").length;
  const revenueDelta = totalBilled > 0 ? Math.round(((totalCollected - totalBilled) / totalBilled) * 100) : 0;

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] text-foreground tracking-tight mb-0.5" style={{ fontWeight: 800 }}>
            Good morning, {activeMechanic.name.split(" ")[0]} 🔧
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Saturday, April 11 · <span className="text-amber-600" style={{ fontWeight: 600 }}>{openWOs} work orders</span> active · {weeklyHours} hrs logged this week
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/workspace"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-violet-600 to-violet-700 text-white px-5 py-2.5 rounded-xl hover:opacity-90 transition-all shadow-lg shadow-violet-500/20 text-[13px]"
            style={{ fontWeight: 600 }}>
            <Sparkles className="w-4 h-4" /> Open AI Workspace
          </Link>
          <Link href="/mechanic?tab=workorders"
            className="inline-flex items-center gap-2 border border-[#D7DFEC] text-foreground px-5 py-2.5 rounded-xl hover:bg-muted transition-colors text-[13px]"
            style={{ fontWeight: 500 }}>
            <Wrench className="w-4 h-4" /> Work Orders
          </Link>
        </div>
      </div>

      {/* ── KPI Stat Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {[
          { label: "Active WOs",      value: String(openWOs),   sub: "Across 3 aircraft",   icon: Wrench,    color: "text-primary bg-primary/8",      trend: "+2" },
          { label: "Open Squawks",    value: String(openSquawks.length), sub: `${openSquawks.filter((sq) => sq.sev === "High").length} high priority`, icon: AlertTriangle, color: "text-red-600 bg-red-50", trend: null },
          { label: "MTD Revenue",     value: formatCompactCurrency(totalBilled), sub: `${formatCompactCurrency(totalCollected)} collected`, icon: DollarSign,color: "text-emerald-600 bg-emerald-50", trend: revenueDelta === 0 ? null : `${revenueDelta > 0 ? "+" : ""}${revenueDelta}%` },
          { label: "Hours This Week", value: `${weeklyHours}h`, sub: "Of 40hr target",      icon: Timer,     color: "text-amber-600 bg-amber-50",     trend: null },
          { label: "Draft Entries",   value: String(draftEntries), sub: "Pending signature", icon: BookOpen, color: "text-blue-600 bg-blue-50", trend: null },
          { label: "Customers",       value: String(activeCustomers), sub: "Active aircraft", icon: Users, color: "text-violet-600 bg-violet-50", trend: null },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.4 }}
            className={`bg-white rounded-2xl border ${softCardBorder} p-4 transition-all`}>
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

      {/* ── Main Grid ── */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* Work Order Queue */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>Work Order Queue</h2>
            <Link href="/mechanic?tab=workorders" className="text-[12px] text-primary flex items-center gap-1" style={{ fontWeight: 500 }}>
              View all <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {workOrderQueue.map((wo, i) => {
            const statusColor =
              wo.status === "In Progress"
                ? "text-blue-700 bg-blue-50 border-blue-200"
                : ["Awaiting Parts", "Awaiting Approval", "Waiting Customer"].includes(wo.status)
                ? "text-amber-700 bg-amber-50 border-amber-200"
                : ["Draft", "Open", "Ready for Signoff"].includes(wo.status)
                ? "text-violet-700 bg-violet-50 border-violet-200"
                : "text-emerald-700 bg-emerald-50 border-emerald-200";
            const priColor = wo.priority === "High" ? "border-l-red-400" : wo.priority === "Medium" ? "border-l-amber-400" : "border-l-blue-400";
            return (
              <motion.div key={wo.id} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.07 }}>
                <div className={`bg-white rounded-2xl border ${softCardBorder} border-l-4 ${priColor} p-4 transition-all`}>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[13px] text-foreground font-mono" style={{ fontWeight: 700 }}>{wo.id}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusColor}`} style={{ fontWeight: 600 }}>{wo.status}</span>
                      </div>
                      <div className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>{wo.desc}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{wo.aircraft} · {wo.model} {wo.daysOpen > 0 ? `· ${wo.daysOpen}d open` : ""}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[14px] text-emerald-600" style={{ fontWeight: 700 }}>{wo.est}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{wo.priority} priority</div>
                    </div>
                  </div>
                  {wo.progress > 0 && wo.progress < 100 && (
                    <div className="mt-3">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${wo.progress}%` }}
                          transition={{ duration: 1.2, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
                          className="h-full bg-blue-500 rounded-full"
                        />
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1">{wo.progress}% complete · Est. {Math.max(1, 100 - wo.progress) / 20} more hours</div>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Right Column */}
        <div className="space-y-4">

          {/* Squawk Queue */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>Squawk Queue</h3>
              <Link href="/mechanic?tab=squawks" className="text-[12px] text-primary flex items-center gap-1" style={{ fontWeight: 500 }}>
                All <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className={`bg-white rounded-2xl border ${softCardBorder} overflow-hidden`}>
              {openSquawks.map((sq) => (
                <div key={sq.id} className={`flex items-start gap-3 px-4 py-3 border-b ${softCardBorder} last:border-0 hover:bg-muted/20 transition-colors`}>
                  <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${sq.sev === "High" ? "bg-red-500" : "bg-amber-500"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-foreground truncate" style={{ fontWeight: 500 }}>{sq.desc}</div>
                    <div className="text-[10px] text-muted-foreground">{sq.aircraft} · {sq.customer}</div>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${sq.sev === "High" ? "text-red-600 bg-red-50" : "text-amber-600 bg-amber-50"}`} style={{ fontWeight: 600 }}>
                    {sq.sev}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Customer List */}
          <div>
            <h3 className="text-[15px] text-foreground mb-3" style={{ fontWeight: 700 }}>Customers</h3>
            <div className="space-y-2">
              {customerCards.map(c => (
                <div key={c.name} className={`bg-white rounded-2xl border ${softCardBorder} p-3.5 flex items-center gap-3 transition-all`}>
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-[13px] text-primary" style={{ fontWeight: 700 }}>{c.name[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>{c.name}</div>
                    <div className="text-[10px] text-muted-foreground">{c.aircraft} · {c.model}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[12px] text-emerald-600" style={{ fontWeight: 600 }}>{c.spent}</div>
                    <div className="text-[10px] text-muted-foreground">{c.wos} WOs</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Charts Row ── */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* Revenue Chart */}
        <div className={`lg:col-span-2 bg-white rounded-2xl border ${softCardBorder} p-6`}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>Revenue — Billed vs Collected</h3>
              <p className="text-[12px] text-muted-foreground">7-month rolling · All customers</p>
            </div>
            <div className="text-right">
              <div className="text-[22px] text-foreground tracking-tight" style={{ fontWeight: 800 }}>${(totalBilled / 1000).toFixed(1)}K</div>
              <div className="text-[11px] text-emerald-600" style={{ fontWeight: 500 }}>↑ 18% vs prior period</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={190}>
              <AreaChart id="mech-area-revenue" data={revenueData}>
              <CartesianGrid key="cg" strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis key="xa" dataKey="m" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis key="ya" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v/1000}k`} />
              <Tooltip key="tt" content={<DarkTip />} />
              <Area key="ab" type="monotone" dataKey="billed"    name="Billed"    stroke="#2563EB" strokeWidth={2} fill="#2563EB" fillOpacity={0.08} dot={false} />
              <Area key="ac" type="monotone" dataKey="collected" name="Collected" stroke="#10b981" strokeWidth={2} fill="#10b981" fillOpacity={0.06} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* WO Status Donut + Labor Hours */}
        <div className="space-y-4">
          <div className={`bg-white rounded-2xl border ${softCardBorder} p-5`}>
            <h3 className="text-[14px] text-foreground mb-3" style={{ fontWeight: 700 }}>WO Status Breakdown</h3>
            <div className="flex items-center gap-4">
            <PieChart width={100} height={100}>
                <Pie data={woStatusData} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={48} paddingAngle={3}>
                  {woStatusData.map((d, i) => <Cell key={`wo-cell-${i}`} fill={d.fill} />)}
                </Pie>
                <Tooltip content={<DarkTip />} />
              </PieChart>
              <div className="flex-1 space-y-1.5">
                {woStatusData.map(d => (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.fill }} />
                      <span className="text-[11px] text-muted-foreground">{d.name}</span>
                    </div>
                    <span className="text-[11px] text-foreground" style={{ fontWeight: 600 }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* This week's labor hours */}
          <div className={`bg-white rounded-2xl border ${softCardBorder} p-5`}>
            <h3 className="text-[14px] text-foreground mb-3" style={{ fontWeight: 700 }}>Labor Hours This Week</h3>
            <ResponsiveContainer width="100%" height={90}>
              <BarChart id="mech-bar-hours" data={laborHours} barSize={14}>
                <XAxis key="xa" dataKey="m" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip key="tt" content={<DarkTip />} />
                <Bar key="br" dataKey="h" name="Hours" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
              <span>{weeklyHours} hrs logged</span>
              <span className="text-violet-600" style={{ fontWeight: 600 }}>Target: 40 hrs</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Skill Utilization + AI Workspace Banner ── */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className={`bg-white rounded-2xl border ${softCardBorder} p-6`}>
          <h3 className="text-[15px] text-foreground mb-5" style={{ fontWeight: 700 }}>Skill Utilization</h3>
          <div className="space-y-4">
            {skillUtil.map(s => (
              <div key={s.name}>
                <div className="flex justify-between text-[12px] mb-1.5">
                  <span className="text-muted-foreground">{s.name}</span>
                  <span style={{ fontWeight: 600, color: s.fill }}>{s.value}%</span>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${s.value}%` }}
                    transition={{ duration: 1, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full rounded-full"
                    style={{ background: s.fill }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Workspace Banner */}
        <div className="lg:col-span-2">
          <Link href="/workspace"
            className="block h-full bg-gradient-to-br from-[#0e0a2e] to-[#1a0e4e] rounded-2xl p-6 hover:opacity-95 transition-opacity group relative overflow-hidden">
            {/* grid bg */}
            <div className="absolute inset-0 opacity-10"
              style={{ backgroundImage: "radial-gradient(rgba(139,92,246,0.8) 1px, transparent 1px)", backgroundSize: "30px 30px" }} />
            <div className="absolute top-0 right-0 w-[300px] h-[200px] bg-violet-500/10 rounded-full blur-[80px] pointer-events-none" />

            <div className="relative z-10 h-full flex flex-col justify-between gap-8">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-violet-400" />
                  </div>
                  <div>
                    <div className="text-[16px] text-white" style={{ fontWeight: 700 }}>AI Mechanic Workspace</div>
                    <div className="text-[12px] text-white/50">Your intelligent co-pilot for every job</div>
                  </div>
                </div>
                <p className="text-[14px] text-white/60 leading-relaxed max-w-lg">
                  Generate logbook entries, search ADs and service bulletins, look up parts, draft estimates, and get answers from the complete aircraft history — all in one conversational workspace.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {["Generate Logbook Entry", "Search FAA ADs", "Find Parts", "Draft Estimate", "Ask AI"].map(chip => (
                  <div key={chip} className="text-[11px] bg-white/10 border border-white/15 text-white/70 px-3 py-1.5 rounded-lg" style={{ fontWeight: 500 }}>
                    {chip}
                  </div>
                ))}
                <div className="ml-auto flex items-center gap-2 text-violet-400 group-hover:text-violet-300 transition-colors">
                  <span className="text-[13px]" style={{ fontWeight: 600 }}>Open Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
