"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  MessageSquare,
  Plane,
  PlaneTakeoff,
  Search,
  Sparkles,
  Wrench,
  Zap,
} from "lucide-react"
import type { ReactNode } from "react"
import { useState } from "react"

/**
 * Homepage "See it in action" section — three browser-framed mock screens
 * showing the product from the owner side, the mechanic side, and the AI
 * answers experience. Each frame is interactive (tab to switch personas)
 * and links to the corresponding live demo at /demo/{owner,mechanic,ask}.
 *
 * Why inline JSX mocks instead of saved PNG screenshots:
 *  - Pixel-perfect at any DPI (no blurry retina downscales).
 *  - Smaller payload than 3× 1MB PNGs.
 *  - Always in sync with the actual product since they reuse the brand
 *    palette + typography.
 *  - Crisp on social-share — when Linkedin or Slack screenshots the
 *    homepage, the mock frames stay sharp.
 *
 * Stripe + Linear + Notion use the same pattern.
 */

type PreviewKey = "owner" | "mechanic" | "ai"

interface PreviewTab {
  key: PreviewKey
  label: string
  sublabel: string
  icon: typeof Plane
  demoHref: string
}

const TABS: PreviewTab[] = [
  {
    key: "owner",
    label: "Aircraft owner",
    sublabel: "Track your fleet at a glance",
    icon: Plane,
    demoHref: "/demo/owner",
  },
  {
    key: "mechanic",
    label: "A&P mechanic",
    sublabel: "Run shop work, sign logbooks",
    icon: Wrench,
    demoHref: "/demo/mechanic",
  },
  {
    key: "ai",
    label: "Ask your aircraft",
    sublabel: "Citation-backed AI answers",
    icon: Sparkles,
    demoHref: "/demo/ask",
  },
]

function BrowserFrame({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white shadow-[0_24px_80px_-24px_rgba(15,23,42,0.25)] overflow-hidden">
      {/* Window chrome */}
      <div className="flex items-center gap-3 px-5 py-3 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#FF5F57]" />
          <span className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
          <span className="w-3 h-3 rounded-full bg-[#28C840]" />
        </div>
        <div className="flex-1 flex justify-center">
          <div className="bg-white border border-slate-200 rounded-md px-3 py-1 text-[11px] text-slate-500 inline-flex items-center gap-2">
            <span className="text-emerald-500">🔒</span>
            <span className="font-mono text-[10px]">{url}</span>
          </div>
        </div>
        <div className="w-12" />
      </div>
      {/* Body */}
      <div className="bg-[#f4f7fb]">{children}</div>
    </div>
  )
}

function OwnerPreview() {
  return (
    <BrowserFrame url="myaircraft.us/dashboard">
      <div className="p-6">
        {/* Heading */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-[20px] font-extrabold text-slate-950 tracking-tight">
              Dashboard — Your Aircraft Overview
            </h3>
            <p className="text-[12px] text-slate-500 mt-1">
              Track work orders, approve estimates, view invoices, stay on top of compliance.
            </p>
          </div>
          <button className="h-8 px-3 rounded-lg bg-blue-600 text-white text-[11px] font-semibold inline-flex items-center gap-1">
            <span>+ Create</span>
          </button>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: "Active Work Orders", value: "2", tag: "2 due soon", tone: "amber" },
            { label: "Estimates Waiting", value: "2", tag: "$3,700", tone: "amber" },
            { label: "Owner Approvals", value: "1", tag: "needs action", tone: "red" },
            { label: "Ready to Invoice", value: "0", tag: "$0 ready", tone: "emerald" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-3">
              <div className="flex items-start justify-between">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{s.label}</p>
                <span
                  className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full ${
                    s.tone === "amber"
                      ? "bg-amber-50 text-amber-700"
                      : s.tone === "red"
                      ? "bg-red-50 text-red-700"
                      : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {s.tag}
                </span>
              </div>
              <div className="text-[24px] font-extrabold text-slate-950 mt-1 leading-none">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Action queue + risk board */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h4 className="text-[12px] font-extrabold text-slate-950 mb-3">Today's Action Queue</h4>
            <div className="space-y-1.5">
              {[
                { rec: "WO-1042", tail: "N12345", action: "Pulsing on right brake during rollout", status: "In Progress", tone: "blue" },
                { rec: "WO-1041", tail: "N12345", action: "G500 PFD intermittently reboots in flight", status: "Open", tone: "amber" },
                { rec: "EST-2098", tail: "N67890", action: "Owner approval pending", status: "Approval", tone: "amber" },
                { rec: "EST-2099", tail: "N67890", action: "Estimate draft waiting", status: "Draft", tone: "slate" },
              ].map((row) => (
                <div key={row.rec} className="flex items-center gap-2 py-1.5 border-b border-slate-100 last:border-0 text-[10px]">
                  <span className="font-mono text-slate-500 w-14 shrink-0">{row.rec}</span>
                  <span className="font-semibold text-slate-700 w-12 shrink-0">{row.tail}</span>
                  <span className="text-slate-600 flex-1 truncate">{row.action}</span>
                  <span
                    className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${
                      row.tone === "blue"
                        ? "bg-blue-50 text-blue-700"
                        : row.tone === "amber"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {row.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h4 className="text-[12px] font-extrabold text-slate-950 mb-3">Aircraft Risk Board</h4>
            <div className="space-y-1.5">
              {[
                { tail: "N12345", open: "2 active work orders", ctx: "Right brake overhaul + rotor inspection", risk: "Medium" },
                { tail: "N67890", open: "2 estimates waiting", ctx: "Sent", risk: "Medium" },
                { tail: "N221MA", open: "No open exceptions", ctx: "Operational", risk: "Normal" },
                { tail: "N4421J", open: "No open exceptions", ctx: "Operational", risk: "Normal" },
              ].map((row) => (
                <div key={row.tail} className="flex items-center gap-2 py-1.5 border-b border-slate-100 last:border-0 text-[10px]">
                  <span className="font-semibold text-slate-700 w-14 shrink-0">{row.tail}</span>
                  <span className="text-slate-600 w-28 shrink-0 truncate">{row.open}</span>
                  <span className="text-slate-600 flex-1 truncate">{row.ctx}</span>
                  <span
                    className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${
                      row.risk === "Medium" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {row.risk}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </BrowserFrame>
  )
}

function MechanicPreview() {
  return (
    <BrowserFrame url="myaircraft.us/mechanic">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
              <PlaneTakeoff className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[16px] font-extrabold text-slate-950">N12345</h3>
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700">Attention</span>
              </div>
              <p className="text-[11px] text-slate-500">Cessna 182 Skylane · 2014</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button className="h-7 px-2.5 rounded-md border border-slate-200 text-[10px] font-semibold text-slate-700 bg-white">Squawks</button>
            <button className="h-7 px-2.5 rounded-md border border-slate-200 text-[10px] font-semibold text-slate-700 bg-white">Ask Aircraft</button>
            <button className="h-7 px-2.5 rounded-md bg-blue-600 text-white text-[10px] font-semibold inline-flex items-center gap-1">
              <Wrench className="w-3 h-3" /> Work Order
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-5 gap-2 mb-4">
          {[
            { label: "Hobbs", value: "1,842.6 hrs" },
            { label: "Tach", value: "432.1 hrs" },
            { label: "Squawks", value: "2" },
            { label: "Active WOs", value: "2" },
            { label: "Last service", value: "Aug 4" },
          ].map((m) => (
            <div key={m.label} className="bg-white rounded-lg border border-slate-200 px-2.5 py-2">
              <p className="text-[8px] font-semibold uppercase tracking-wider text-slate-400">{m.label}</p>
              <div className="text-[13px] font-extrabold text-slate-950 mt-0.5 leading-tight">{m.value}</div>
            </div>
          ))}
        </div>

        {/* Active WO + history */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Active Work Order</p>
              <h4 className="text-[12px] font-extrabold text-slate-950 mt-0.5">WO-2026-0042 · Nav light intermittent — wire repair at wing root</h4>
            </div>
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700">Awaiting Approval</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full" style={{ width: "70%" }} />
          </div>
          <p className="text-[9px] text-slate-400 mt-1">70% complete · 5 of 7 tasks done</p>
        </div>

        {/* Two-column bottom */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <h4 className="text-[10px] font-extrabold text-slate-950 mb-2">Open Squawks</h4>
            <div className="space-y-1.5 text-[10px]">
              <div className="flex justify-between"><span className="text-slate-700">Right brake pulsation on rollout</span><span className="text-[8px] font-semibold px-1.5 rounded bg-amber-50 text-amber-700">Medium</span></div>
              <div className="flex justify-between"><span className="text-slate-700">Garmin G500 occasional reboot</span><span className="text-[8px] font-semibold px-1.5 rounded bg-amber-50 text-amber-700">Medium</span></div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <h4 className="text-[10px] font-extrabold text-slate-950 mb-2">Service Reminders</h4>
            <div className="space-y-1.5 text-[10px]">
              <div className="flex justify-between"><span className="text-slate-700">AD 2025-03-02 Compliance</span><span className="text-red-600 font-semibold">6 days</span></div>
              <div className="flex justify-between"><span className="text-slate-700">Annual Inspection</span><span className="text-amber-700 font-semibold">40 days</span></div>
              <div className="flex justify-between"><span className="text-slate-700">Oil Change (50hr)</span><span className="text-slate-500">37.7 hr</span></div>
            </div>
          </div>
        </div>
      </div>
    </BrowserFrame>
  )
}

function AskAircraftPreview() {
  return (
    <BrowserFrame url="myaircraft.us/ask">
      <div className="p-6 grid grid-cols-[1fr_240px] gap-4">
        {/* Conversation */}
        <div className="space-y-3">
          {/* User question */}
          <div className="flex justify-end">
            <div className="bg-blue-600 text-white rounded-2xl rounded-tr-md px-3 py-2 max-w-[80%] text-[12px]">
              When was the last engine overhaul on N12345, and what was the cost?
            </div>
          </div>
          {/* AI response */}
          <div className="flex gap-2 items-start">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-white rounded-2xl rounded-tl-md p-3 border border-slate-200 flex-1 text-[11px]">
              <p className="text-slate-700 leading-relaxed">
                The last engine overhaul on <strong>N12345</strong> was on <strong>March 14, 2022</strong> at 1,402.7 SMOH —
                a major overhaul of the Continental O-470-R by Penn Yan Aero. Total invoice was <strong>$38,420</strong>{" "}
                including new cylinders, pistons, bearings, and accessory case.
              </p>
              <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex flex-wrap gap-1">
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-2.5 h-2.5" /> 3 citations
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">Logbook p. 47</span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">Invoice #PY-2284</span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">8130-3 form</span>
              </div>
            </div>
          </div>
          {/* Follow-up */}
          <div className="flex justify-end">
            <div className="bg-blue-600 text-white rounded-2xl rounded-tr-md px-3 py-2 max-w-[80%] text-[12px]">
              What ADs are still open against this engine?
            </div>
          </div>
          <div className="flex gap-2 items-start">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-white rounded-2xl rounded-tl-md p-3 border border-slate-200 flex-1 text-[11px]">
              <p className="text-slate-700">
                One open AD: <strong>AD 2025-03-02</strong> — recurring oil-pump impeller inspection. Due in{" "}
                <strong className="text-red-600">6 days</strong> at next 100-hr or 12-cal-month.
              </p>
            </div>
          </div>
        </div>

        {/* Right rail — sources */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 self-start">
          <h4 className="text-[10px] font-extrabold text-slate-950 mb-2 flex items-center gap-1">
            <FileText className="w-3 h-3" /> Sources
          </h4>
          <div className="space-y-1.5">
            {[
              { name: "Engine logbook", page: "p. 47" },
              { name: "Penn Yan invoice", page: "PY-2284" },
              { name: "8130-3 return-to-service", page: "Page 1" },
              { name: "FAA AD database", page: "Live" },
            ].map((s) => (
              <button key={s.name} className="w-full text-left flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50 text-[10px]">
                <span className="text-slate-700 truncate">{s.name}</span>
                <span className="text-slate-400 font-mono text-[9px]">{s.page}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </BrowserFrame>
  )
}

export function ProductPreview() {
  const [active, setActive] = useState<PreviewKey>("owner")
  const activeTab = TABS.find((t) => t.key === active) ?? TABS[0]

  return (
    <section className="relative bg-white py-24 border-t border-gray-100 overflow-hidden">
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(rgba(37,99,235,1) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,1) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative max-w-7xl mx-auto px-6">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-[#EFF6FF] border border-[#2563EB]/20 rounded-full px-4 py-1.5 mb-4">
            <Zap className="w-3.5 h-3.5 text-[#2563EB]" />
            <span className="text-[12px] text-[#2563EB] font-semibold">See it in action</span>
          </div>
          <h2 className="text-[40px] md:text-[48px] text-[#0A1628] tracking-tight leading-[1.05] mb-4 font-black">
            One platform.
            <br />
            <span className="text-[#2563EB]">Three perspectives.</span>
          </h2>
          <p className="text-[16px] text-gray-500 max-w-2xl mx-auto">
            Click between Owner, A&P, and Ask AI to see exactly what each persona uses every day. No demo signup —
            preview each surface here, then jump into the live sandbox.
          </p>
        </div>

        {/* Tab strip */}
        <div className="flex flex-col sm:flex-row items-stretch gap-2 mb-6 max-w-3xl mx-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = tab.key === active
            return (
              <button
                key={tab.key}
                onClick={() => setActive(tab.key)}
                className={`flex-1 group inline-flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all ${
                  isActive
                    ? "bg-slate-900 border-slate-900 text-white shadow-lg shadow-slate-900/20"
                    : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                }`}
              >
                <span
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    isActive ? "bg-white/15" : "bg-slate-100 group-hover:bg-slate-200"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-700"}`} />
                </span>
                <span className="text-left">
                  <div className={`text-[13px] font-bold ${isActive ? "text-white" : "text-slate-900"}`}>
                    {tab.label}
                  </div>
                  <div className={`text-[11px] ${isActive ? "text-white/70" : "text-slate-500"}`}>{tab.sublabel}</div>
                </span>
              </button>
            )
          })}
        </div>

        {/* Frame */}
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="max-w-5xl mx-auto"
        >
          {active === "owner" && <OwnerPreview />}
          {active === "mechanic" && <MechanicPreview />}
          {active === "ai" && <AskAircraftPreview />}
        </motion.div>

        {/* CTA below frame */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
          <Link
            href={activeTab.demoHref}
            className="inline-flex items-center gap-2 bg-slate-900 text-white rounded-full px-5 py-2.5 text-[13px] font-semibold hover:bg-slate-800 transition-colors"
          >
            Open live {activeTab.label.toLowerCase()} sandbox
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href="/signup?preview=1"
            className="inline-flex items-center gap-2 border border-slate-200 bg-white text-slate-700 rounded-full px-5 py-2.5 text-[13px] font-semibold hover:border-slate-300 transition-colors"
          >
            Start free 30-day trial
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </section>
  )
}
