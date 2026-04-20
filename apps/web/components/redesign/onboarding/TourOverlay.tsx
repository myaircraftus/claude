"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronLeft, ChevronRight, X, Lightbulb,
  CheckCircle, RotateCcw, Rocket, Sparkles,
} from "lucide-react";
import { useTenantRouter } from "@/components/shared/tenant-link";
import { useOnboarding } from "./OnboardingContext";
import type { TourStep } from "./onboardingSteps";

/* ══════════════════════════════════════════════════════════
   MINI PREVIEW COMPONENTS  (compact ~190×100px mockups)
══════════════════════════════════════════════════════════ */

function PvDashboard() {
  return (
    <div className="space-y-1.5">
      {[
        { tail: "N12345", model: "C172S", h: 92, ok: true },
        { tail: "N67890", model: "PA-28", h: 41, ok: false },
        { tail: "N24680", model: "A36",   h: 87, ok: true },
      ].map(r => (
        <div key={r.tail} className="flex items-center gap-2">
          <span className="text-[9px] text-blue-300 w-12 shrink-0" style={{ fontWeight: 700 }}>{r.tail}</span>
          <span className="text-[8px] text-white/40 w-10 shrink-0">{r.model}</span>
          <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${r.h}%`, background: r.ok ? "#10b981" : "#ef4444" }}
            />
          </div>
          <span className="text-[9px] w-6 text-right" style={{ color: r.ok ? "#10b981" : "#f97316", fontWeight: 700 }}>
            {r.h}%
          </span>
        </div>
      ))}
      <div className="flex gap-3 pt-1">
        <div className="bg-blue-500/15 rounded px-2 py-0.5 text-[8px] text-blue-300" style={{ fontWeight: 600 }}>9 Docs</div>
        <div className="bg-amber-500/15 rounded px-2 py-0.5 text-[8px] text-amber-300" style={{ fontWeight: 600 }}>4 Squawks</div>
        <div className="bg-emerald-500/15 rounded px-2 py-0.5 text-[8px] text-emerald-300" style={{ fontWeight: 600 }}>2 WOs</div>
      </div>
    </div>
  );
}

function PvAircraft() {
  return (
    <div className="space-y-1.5">
      {[
        { tail: "N12345", model: "Cessna 172S", status: "Airworthy", c: "#10b981" },
        { tail: "N67890", model: "Piper PA-28",  status: "AOG",       c: "#ef4444" },
        { tail: "N24680", model: "Beechcraft A36", status: "Airworthy", c: "#10b981" },
      ].map(r => (
        <div key={r.tail} className="flex items-center gap-2 bg-white/5 rounded px-2 py-1">
          <span className="text-[9px]">✈️</span>
          <span className="text-[9px] text-blue-300 shrink-0" style={{ fontWeight: 700 }}>{r.tail}</span>
          <span className="text-[8px] text-white/40 flex-1 truncate">{r.model}</span>
          <span className="text-[8px] shrink-0" style={{ color: r.c, fontWeight: 600 }}>{r.status}</span>
        </div>
      ))}
      <div className="flex justify-end">
        <div className="text-[8px] text-blue-400 mt-0.5" style={{ fontWeight: 600 }}>+ Add Aircraft</div>
      </div>
    </div>
  );
}

function PvDocuments() {
  return (
    <div className="space-y-1.5">
      {[
        { name: "Annual Inspection Report", date: "Apr 2024", icon: "📄" },
        { name: "Weight & Balance Sheet",   date: "Jan 2024", icon: "📄" },
        { name: "STC SA01029AT",           date: "2022",     icon: "📋" },
        { name: "AD 2024-15-06",           date: "Mar 2024", icon: "⚠️" },
      ].map(d => (
        <div key={d.name} className="flex items-center gap-2">
          <span className="text-[10px]">{d.icon}</span>
          <span className="text-[9px] text-white/70 flex-1 truncate">{d.name}</span>
          <span className="text-[8px] text-white/30">{d.date}</span>
        </div>
      ))}
    </div>
  );
}

function PvAI() {
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <div className="bg-blue-600 rounded-xl rounded-br-sm px-2.5 py-1.5 max-w-[130px]">
          <p className="text-[9px] text-white leading-snug">When is my annual due for N12345?</p>
        </div>
      </div>
      <div className="flex gap-1.5 items-start">
        <div className="w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center shrink-0 text-[9px]">🤖</div>
        <div className="bg-white/8 rounded-xl rounded-tl-sm px-2.5 py-1.5 flex-1">
          <p className="text-[9px] text-white/80 leading-snug">Annual inspection due <span className="text-emerald-400" style={{ fontWeight: 700 }}>Dec 15, 2024</span> — 47 days remaining.</p>
        </div>
      </div>
      <div className="bg-white/5 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
        <span className="text-[9px] text-white/25 flex-1">Ask anything about your aircraft…</span>
        <div className="w-4 h-4 rounded-md bg-blue-600 flex items-center justify-center">
          <ChevronRight className="w-2.5 h-2.5 text-white" />
        </div>
      </div>
    </div>
  );
}

function PvMarketplace() {
  return (
    <div className="space-y-1.5">
      {[
        { name: "Lycoming O-360 Filter",  price: "$18.50", cat: "Parts" },
        { name: "Garmin GTX 345 ADS-B",   price: "$1,249", cat: "Avionics" },
        { name: "Aircraft Engine Plug",    price: "$4.95",  cat: "Accessories" },
      ].map(p => (
        <div key={p.name} className="flex items-center gap-2 bg-white/5 rounded px-2 py-1">
          <span className="text-[9px] flex-1 text-white/70 truncate">{p.name}</span>
          <span className="text-[8px] text-white/30">{p.cat}</span>
          <span className="text-[9px] text-emerald-400" style={{ fontWeight: 700 }}>{p.price}</span>
        </div>
      ))}
    </div>
  );
}

function PvUsers() {
  return (
    <div className="space-y-2">
      {[
        { name: "James Wilson", role: "Lead Mechanic / IA", c: "bg-blue-600", i: "JW" },
        { name: "Sarah Chen",   role: "A&P Mechanic",       c: "bg-violet-600", i: "SC" },
      ].map(u => (
        <div key={u.name} className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-full ${u.c} flex items-center justify-center text-[8px] text-white shrink-0`} style={{ fontWeight: 700 }}>
            {u.i}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] text-white/80 truncate" style={{ fontWeight: 600 }}>{u.name}</p>
            <p className="text-[8px] text-white/35 truncate">{u.role}</p>
          </div>
          <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
        </div>
      ))}
      <div className="flex items-center gap-1.5 pt-0.5">
        <div className="w-5 h-5 rounded-full border border-dashed border-white/20 flex items-center justify-center text-[10px] text-white/25">+</div>
        <span className="text-[9px] text-blue-400" style={{ fontWeight: 600 }}>Invite mechanic via email</span>
      </div>
    </div>
  );
}

function PvWorkspace() {
  return (
    <div className="space-y-1.5">
      <div className="bg-white/5 rounded-lg px-2.5 py-1.5">
        <p className="text-[8px] text-white/30 mb-0.5">AI Command Center</p>
        <div className="flex items-start gap-1.5">
          <span className="text-[9px]">🤖</span>
          <p className="text-[9px] text-white/70 leading-snug">"Draft a logbook entry for engine oil change on N12345..."</p>
        </div>
      </div>
      <div className="bg-violet-900/30 border border-violet-500/20 rounded-lg px-2.5 py-2">
        <p className="text-[8px] text-violet-300 mb-1" style={{ fontWeight: 600 }}>AI Generated Entry:</p>
        <p className="text-[8px] text-white/60 leading-snug">Removed and replaced engine oil per Lycoming SI 1082E. Installed Champion CH48109-1 oil filter…</p>
      </div>
    </div>
  );
}

function PvWorkOrders() {
  return (
    <div className="space-y-1.5">
      {[
        { id: "WO-1042", tail: "N12345", status: "Open",    amount: "$485",   color: "#3b82f6" },
        { id: "WO-1041", tail: "N67890", status: "In Progress", amount: "$2,800", color: "#f59e0b" },
        { id: "WO-1040", tail: "N24680", status: "Complete", amount: "$1,200", color: "#10b981" },
      ].map(w => (
        <div key={w.id} className="flex items-center gap-2 bg-white/5 rounded px-2 py-1.5">
          <span className="text-[9px] text-indigo-300 w-12 shrink-0" style={{ fontWeight: 700 }}>{w.id}</span>
          <span className="text-[8px] text-blue-300 w-10 shrink-0">{w.tail}</span>
          <span className="text-[8px] flex-1" style={{ color: w.color, fontWeight: 600 }}>{w.status}</span>
          <span className="text-[9px] text-white/60" style={{ fontWeight: 700 }}>{w.amount}</span>
        </div>
      ))}
    </div>
  );
}

function PvSquawks() {
  return (
    <div className="space-y-1.5">
      {[
        { sev: "High",   desc: "Alternator warning light",    c: "#ef4444", dot: "🔴" },
        { sev: "Medium", desc: "Nav light intermittent dim",  c: "#f59e0b", dot: "🟡" },
        { sev: "Low",    desc: "Left fuel cap loose",         c: "#3b82f6", dot: "🟢" },
      ].map(s => (
        <div key={s.desc} className="flex items-center gap-2">
          <span className="text-[10px]">{s.dot}</span>
          <span className="text-[9px] text-white/70 flex-1 truncate">{s.desc}</span>
          <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ color: s.c, background: s.c + "18", fontWeight: 600 }}>
            {s.sev}
          </span>
        </div>
      ))}
    </div>
  );
}

function PvEstimates() {
  return (
    <div className="space-y-1.5">
      <div className="bg-white/5 rounded-lg px-3 py-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] text-white/50" style={{ fontWeight: 600 }}>EST-2047</span>
          <span className="text-[8px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Pending Approval</span>
        </div>
        <div className="space-y-0.5">
          <div className="flex justify-between text-[8px]">
            <span className="text-white/40">Labor 4h × $125</span>
            <span className="text-white/70">$500</span>
          </div>
          <div className="flex justify-between text-[8px]">
            <span className="text-white/40">Champion plugs ×8</span>
            <span className="text-white/70">$280</span>
          </div>
          <div className="flex justify-between text-[9px] pt-1 border-t border-white/10">
            <span className="text-white/60" style={{ fontWeight: 700 }}>Total</span>
            <span className="text-emerald-400" style={{ fontWeight: 700 }}>$780</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PvParts() {
  return (
    <div className="space-y-1.5">
      <div className="bg-white/8 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 mb-1">
        <span className="text-[9px]">🔍</span>
        <span className="text-[9px] text-white/40">CH48109 oil filter</span>
      </div>
      {[
        { pn: "CH48109-1", desc: "Oil Filter — Champion",  price: "$18.50", stock: "In Stock" },
        { pn: "LW-10027",  desc: "Oil Filter — Lycoming",  price: "$21.95", stock: "3 left" },
      ].map(p => (
        <div key={p.pn} className="flex items-start gap-2 bg-white/5 rounded px-2 py-1">
          <div className="flex-1">
            <p className="text-[9px] text-teal-300" style={{ fontWeight: 700 }}>{p.pn}</p>
            <p className="text-[8px] text-white/45">{p.desc}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-white/70" style={{ fontWeight: 700 }}>{p.price}</p>
            <p className="text-[8px] text-emerald-400">{p.stock}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function PvInvoices() {
  return (
    <div className="space-y-1.5">
      {[
        { id: "INV-024", tail: "N12345", amt: "$785",   status: "Awaiting payment", c: "#f59e0b" },
        { id: "INV-023", tail: "N67890", amt: "$2,100", status: "Paid",             c: "#10b981" },
        { id: "INV-022", tail: "N24680", amt: "$1,350", status: "Draft",            c: "#94a3b8" },
      ].map(inv => (
        <div key={inv.id} className="flex items-center gap-2 bg-white/5 rounded px-2 py-1.5">
          <span className="text-[9px] text-cyan-300 w-12 shrink-0" style={{ fontWeight: 700 }}>{inv.id}</span>
          <span className="text-[8px] text-blue-300 w-10 shrink-0">{inv.tail}</span>
          <span className="text-[8px] flex-1 truncate" style={{ color: inv.c }}>{inv.status}</span>
          <span className="text-[9px] text-white/60" style={{ fontWeight: 700 }}>{inv.amt}</span>
        </div>
      ))}
    </div>
  );
}

function PvLogbook() {
  return (
    <div className="space-y-1.5">
      <div className="bg-white/5 rounded-lg px-2.5 py-1.5">
        <p className="text-[8px] text-white/30">You said:</p>
        <p className="text-[9px] text-white/65">Oil change, replaced filter, Lycoming O-360</p>
      </div>
      <div className="bg-violet-900/30 border border-violet-500/20 rounded-lg px-2.5 py-1.5">
        <p className="text-[8px] text-violet-300 mb-0.5" style={{ fontWeight: 600 }}>AI Logbook Entry:</p>
        <p className="text-[8px] text-white/60 leading-snug">Removed and replaced engine oil per Lycoming SI 1082E, drained 8 qts. Installed new Champion CH48109-1 oil filter. Returned to service per 14 CFR Part 43 App. A.</p>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-[8px] text-white/30">✍ Cert: A&P 2847391</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>
    </div>
  );
}

/* ── Preview registry ── */
const PREVIEWS: Record<string, () => JSX.Element> = {
  dashboard:  PvDashboard,
  aircraft:   PvAircraft,
  documents:  PvDocuments,
  ai:         PvAI,
  marketplace: PvMarketplace,
  users:      PvUsers,
  workspace:  PvWorkspace,
  workorders: PvWorkOrders,
  squawks:    PvSquawks,
  estimates:  PvEstimates,
  parts:      PvParts,
  invoices:   PvInvoices,
  logbook:    PvLogbook,
};

function MiniPreview({ type }: { type: string }) {
  const Preview = PREVIEWS[type];
  if (!Preview) return null;
  return (
    <div
      className="w-52 shrink-0 rounded-xl overflow-hidden"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="px-3 pt-2.5 pb-2">
        <Preview />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   BOTTOM COACHMARK STRIP
══════════════════════════════════════════════════════════ */
function BottomStrip({
  step,
  stepIndex,
  total,
  onNext,
  onBack,
  onSkip,
}: {
  step: TourStep;
  stepIndex: number;
  total: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const progress = (stepIndex / (total - 1)) * 100;

  return (
    <motion.div
      key={stepIndex}
      initial={{ opacity: 0, y: 40, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 30 }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      className="fixed bottom-5 left-1/2 z-[1000] flex flex-col overflow-hidden"
      style={{
        transform: "translateX(-50%)",
        width: "min(780px, calc(100vw - 32px))",
        background: "#0A1628",
        borderRadius: "20px",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 24px 64px rgba(0,0,0,0.7), 0 8px 24px rgba(0,0,0,0.5)",
      }}
    >
      {/* Progress bar */}
      <div className="h-0.5 w-full" style={{ background: "rgba(255,255,255,0.07)" }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: step.accent }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>

      {/* Content row */}
      <div className="flex items-center gap-4 p-4 pb-3">
        {/* Icon + text */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Accent icon */}
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-[18px] shrink-0 mt-0.5"
            style={{ background: step.accent + "22", border: `1px solid ${step.accent}44` }}
          >
            {step.icon}
          </div>

          {/* Title + desc */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-white text-[14px]" style={{ fontWeight: 700 }}>
                {step.title}
              </h3>
              <span className="text-[9px] text-white/30 shrink-0" style={{ fontWeight: 600 }}>
                {stepIndex} of {total - 1}
              </span>
            </div>
            <p className="text-white/55 text-[12px] leading-relaxed line-clamp-2">
              {step.desc}
            </p>
            {step.tip && (
              <div className="flex items-start gap-1.5 mt-1.5">
                <Lightbulb className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-300/70 leading-snug">{step.tip}</p>
              </div>
            )}
          </div>
        </div>

        {/* Mini preview */}
        {step.preview && <MiniPreview type={step.preview} />}
      </div>

      {/* Footer: progress dots + buttons */}
      <div className="flex items-center justify-between px-4 pb-3.5 gap-4">
        {/* Step dots */}
        <div className="flex items-center gap-1.5">
          {Array.from({ length: total - 1 }).map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === stepIndex - 1 ? 20 : 6,
                height: 6,
                background: i < stepIndex
                  ? step.accent
                  : i === stepIndex - 1
                    ? step.accent
                    : "rgba(255,255,255,0.15)",
              }}
            />
          ))}
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            disabled={stepIndex <= 1}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-white/40 hover:text-white/70 hover:bg-white/8 transition-all disabled:opacity-30"
            style={{ fontWeight: 500 }}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back
          </button>

          <button
            onClick={onSkip}
            className="px-3 py-1.5 rounded-lg text-[12px] text-white/30 hover:text-white/55 hover:bg-white/5 transition-all"
          >
            End Tour
          </button>

          <motion.button
            onClick={onNext}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] text-white transition-all"
            style={{
              background: step.accent,
              fontWeight: 700,
              boxShadow: `0 4px 16px ${step.accent}55`,
            }}
          >
            {stepIndex >= total - 1 ? "Finish" : "Next"}
            <ChevronRight className="w-3.5 h-3.5" />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════
   WELCOME MODAL (step 0)
══════════════════════════════════════════════════════════ */
function WelcomeModal({ step, onNext, onSkip, persona }: {
  step: TourStep; onNext: () => void; onSkip: () => void; persona: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[1000] flex items-center justify-center"
      style={{ background: "rgba(5, 12, 28, 0.92)", backdropFilter: "blur(8px)" }}
    >
      <motion.div
        initial={{ scale: 0.88, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: "spring", stiffness: 280, damping: 26 }}
        className="w-full max-w-md mx-4 rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(145deg, #0F2447 0%, #162F56 60%, #0C1D3A 100%)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 40px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05) inset",
        }}
      >
        {/* Hero area */}
        <div className="relative p-8 pb-6 text-center">
          {/* Background glow */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-t-3xl">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full"
              style={{ background: `radial-gradient(circle, ${step.accent}25 0%, transparent 70%)` }} />
          </div>

          {/* Icon */}
          <motion.div
            initial={{ scale: 0, rotate: -15 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 260, damping: 20 }}
            className="text-6xl mb-5 inline-block"
          >
            {step.icon}
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-white text-[24px] mb-3 leading-tight"
            style={{ fontWeight: 800 }}
          >
            {step.title}
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-white/55 text-[14px] leading-relaxed"
          >
            {step.desc}
          </motion.p>
        </div>

        {/* What you'll see */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="px-8 pb-3"
        >
          <div className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3"
            style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
            <Sparkles className="w-4 h-4 shrink-0" style={{ color: step.accent }} />
            <p className="text-white/50 text-[12px] leading-snug">
              {persona === "mechanic"
                ? "AI Command Center · Work Orders · Squawks · Estimates · Parts · Invoices · Logbook"
                : "Fleet Dashboard · Aircraft · Documents · AI Command · Marketplace · Invite Mechanic"
              }
            </p>
          </div>
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="px-8 pt-2 pb-7 flex flex-col items-center gap-3"
        >
          <motion.button
            onClick={onNext}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-[14px] text-white"
            style={{
              background: `linear-gradient(135deg, ${step.accent} 0%, ${step.accent}cc 100%)`,
              fontWeight: 700,
              boxShadow: `0 8px 24px ${step.accent}44`,
            }}
          >
            <Rocket className="w-4 h-4" />
            Start Guided Tour
          </motion.button>
          <button
            onClick={onSkip}
            className="text-[13px] text-white/30 hover:text-white/55 transition-colors"
          >
            Skip tour
          </button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════
   COMPLETION MODAL
══════════════════════════════════════════════════════════ */
function CompletionModal({
  persona,
  steps,
  onFinish,
  onRestart,
}: {
  persona: string;
  steps: TourStep[];
  onFinish: () => void;
  onRestart: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[1000] flex items-center justify-center"
      style={{ background: "rgba(5, 12, 28, 0.92)", backdropFilter: "blur(8px)" }}
    >
      <motion.div
        initial={{ scale: 0.88, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: "spring", stiffness: 280, damping: 26 }}
        className="w-full max-w-md mx-4 rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(145deg, #0a1f10 0%, #0d2b14 50%, #0C1D3A 100%)",
          border: "1px solid rgba(16,185,129,0.2)",
          boxShadow: "0 40px 80px rgba(0,0,0,0.7), 0 0 60px rgba(16,185,129,0.08) inset",
        }}
      >
        {/* Confetti area */}
        <div className="relative p-8 pb-5 text-center">
          <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-t-3xl">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full"
              style={{ background: "radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)" }} />
          </div>

          {/* Animated checkmark */}
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 18 }}
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{
              background: "linear-gradient(135deg, #10b981, #059669)",
              boxShadow: "0 12px 40px rgba(16,185,129,0.45)",
            }}
          >
            <CheckCircle className="w-10 h-10 text-white" />
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="text-white text-[26px] mb-2"
            style={{ fontWeight: 800 }}
          >
            You're all set! 🎉
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="text-white/50 text-[13px] leading-relaxed"
          >
            You've completed the {persona === "mechanic" ? "A&P Mechanic" : "Aircraft Owner"} tour.
            Here's a quick recap of what you explored:
          </motion.p>
        </div>

        {/* Steps covered */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="px-6 pb-4"
        >
          <div className="grid grid-cols-3 gap-2">
            {steps.slice(1).map((s, i) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.45 + i * 0.06 }}
                className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-center"
                style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.15)" }}
              >
                <span className="text-xl">{s.icon}</span>
                <span className="text-[9px] text-white/60 leading-tight" style={{ fontWeight: 600 }}>
                  {s.title.split(" ").slice(0, 2).join(" ")}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="px-6 pb-7 flex flex-col gap-2.5"
        >
          <motion.button
            onClick={onFinish}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="w-full py-3.5 rounded-xl text-[14px] text-white text-center"
            style={{
              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              fontWeight: 700,
              boxShadow: "0 8px 24px rgba(16,185,129,0.4)",
            }}
          >
            Go to Dashboard
          </motion.button>

          <button
            onClick={onRestart}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Replay Tour
          </button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════
   SPOTLIGHT RING  (targets a real DOM element)
══════════════════════════════════════════════════════════ */
function SpotlightRing({ selector }: { selector: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const measure = () => {
      const el = document.querySelector(selector);
      if (el) setRect(el.getBoundingClientRect());
    };
    measure();
    const t = setTimeout(measure, 400);
    return () => clearTimeout(t);
  }, [selector]);

  if (!rect) return null;

  const pad = 10;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed pointer-events-none z-[950] rounded-xl"
      style={{
        left: rect.left - pad,
        top: rect.top - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
        boxShadow: "0 0 0 9999px rgba(0,0,0,0.0)",
        border: "2px solid rgba(37,99,235,0.7)",
        animation: "tour-pulse 2.2s ease-in-out infinite",
      }}
    />
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN TOUR OVERLAY  (renders everything above the real app)
══════════════════════════════════════════════════════════ */
export function TourOverlay() {
  const {
    tourActive, tourStep, tourPersona, tourComplete, steps,
    nextStep, prevStep, skipTour, finishTour, restartTour,
  } = useOnboarding();
  const router = useTenantRouter();

  const step = steps[tourStep] as TourStep | undefined;

  /* Navigate to the step's route whenever step changes */
  useEffect(() => {
    if (!tourActive || !step?.route) return;
    router.push(step.route);
  }, [tourStep, tourActive]);

  /* Inject CSS keyframes for spotlight pulse */
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @keyframes tour-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(37,99,235,0.5), 0 0 0 4px rgba(37,99,235,0.15); }
        50%        { box-shadow: 0 0 0 4px rgba(37,99,235,0.2), 0 0 0 8px rgba(37,99,235,0.07); }
      }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  return (
    <AnimatePresence>
      {/* ── Welcome modal (step 0) ── */}
      {tourActive && step?.placement === "modal" && (
        <WelcomeModal
          key="welcome"
          step={step}
          persona={tourPersona ?? "owner"}
          onNext={nextStep}
          onSkip={skipTour}
        />
      )}

      {/* ── Feature bottom strip (steps 1+) ── */}
      {tourActive && step?.placement === "bottom" && (
        <>
          {/* Light dim overlay */}
          <motion.div
            key="dim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[900] pointer-events-none"
            style={{ background: "rgba(5,12,28,0.38)" }}
          />

          {/* Spotlight ring on target element */}
          {step.target && <SpotlightRing selector={step.target} />}

          <BottomStrip
            key={`strip-${tourStep}`}
            step={step}
            stepIndex={tourStep}
            total={steps.length}
            onNext={nextStep}
            onBack={prevStep}
            onSkip={skipTour}
          />
        </>
      )}

      {/* ── Completion modal ── */}
      {tourComplete && (
        <CompletionModal
          key="complete"
          persona={tourPersona ?? "owner"}
          steps={steps}
          onFinish={finishTour}
          onRestart={restartTour}
        />
      )}
    </AnimatePresence>
  );
}
