"use client";

import React from "react";
import Link from "next/link";
import {
  CheckCircle, ArrowRight, Shield, ScanLine, FolderCheck,
  FileSearch, Award, Lock, Clock, Truck, Zap, Star,
  FileText, Database, Search, Layers, ChevronRight,
  MapPin, Phone, Mail, AlertTriangle, CheckCircle2,
  Package, Cpu, Plane
} from "lucide-react";
import { ImageWithFallback } from "./ImageWithFallback";

import { useState, useRef, useEffect } from "react";
import { motion, useInView, AnimatePresence } from "motion/react";

const IMG_SCANNING = "https://images.unsplash.com/photo-1547717015-67560f10d0a0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhaXJjcmFmdCUyMGxvZ2Jvb2slMjBkb2N1bWVudCUyMHNjYW5uaW5nJTIwZGlnaXRpemF0aW9ufGVufDF8fHx8MTc3NTk2MTQ3NHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral";
const IMG_HANGAR   = "https://images.unsplash.com/photo-1764547167395-322102fae92b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhaXJjcmFmdCUyMGhhbmdhciUyMHByb2Zlc3Npb25hbCUyMG1haW50ZW5hbmNlJTIwdGVhbXxlbnwxfHx8fDE3NzU5NjE0Nzh8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral";

function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 28 }} animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }} className={className}>
      {children}
    </motion.div>
  );
}

/* ─── 3D Scanning Simulation ───────────────────────────────────── */
function ScanningSimulation() {
  const [step, setStep] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; opacity: number }>>([]);
  const [docItems, setDocItems] = useState<Array<{ id: number; label: string; type: string; classified: boolean }>>([
    { id: 1, label: "Airframe Logbook p.1-24", type: "Airframe", classified: false },
    { id: 2, label: "Engine Logbook p.1-18", type: "Engine", classified: false },
    { id: 3, label: "Annual Inspection 2023", type: "Inspection", classified: false },
    { id: 4, label: "AD 2024-15-06 Compliance", type: "AD/STC", classified: false },
    { id: 5, label: "Prop Logbook p.1-8", type: "Propeller", classified: false },
    { id: 6, label: "Avionics STC — GTN 750", type: "AD/STC", classified: false },
  ]);

  useEffect(() => {
    if (step === 1) {
      // Scanning animation
      const interval = setInterval(() => {
        setScanProgress(p => {
          if (p >= 100) {
            clearInterval(interval);
            setStep(2);
            return 100;
          }
          return p + 1.2;
        });
        // Add particles
        setParticles(prev => [
          ...prev.slice(-20),
          { id: Date.now(), x: Math.random() * 100, y: Math.random() * 60 + 20, opacity: 1 }
        ]);
      }, 60);
      return () => clearInterval(interval);
    }
  }, [step]);

  useEffect(() => {
    if (step === 2) {
      // Classify items one by one
      let i = 0;
      const interval = setInterval(() => {
        if (i >= docItems.length) { clearInterval(interval); setStep(3); return; }
        setDocItems(prev => prev.map((d, idx) => idx === i ? { ...d, classified: true } : d));
        i++;
      }, 400);
      return () => clearInterval(interval);
    }
  }, [step]);

  const typeColors: Record<string, string> = {
    "Airframe": "bg-blue-100 text-blue-700",
    "Engine": "bg-orange-100 text-orange-700",
    "Inspection": "bg-emerald-100 text-emerald-700",
    "AD/STC": "bg-violet-100 text-violet-700",
    "Propeller": "bg-amber-100 text-amber-700",
  };

  return (
    <div className="bg-gradient-to-br from-[#0A1628] to-[#0d1f3c] rounded-3xl overflow-hidden border border-white/10 shadow-2xl shadow-[#0A1628]/50">
      {/* Header */}
      <div className="flex items-center gap-2 bg-[#0a1220] px-5 py-3 border-b border-white/10">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <div className="w-3 h-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 bg-white/5 rounded-md px-3 py-1 text-[10px] text-white/30 text-center flex items-center justify-center gap-1.5">
          <Lock className="w-2.5 h-2.5 text-[#2563EB]" />
          myaircraft.us / scanning / live-session
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] text-emerald-400" style={{ fontWeight: 600 }}>LIVE SESSION</span>
        </div>
      </div>

      <div className="p-5">
        {/* Step tabs */}
        <div className="flex items-center gap-2 mb-5">
          {["Document Placement", "High-Res Scanning", "AI Classification", "Delivery"].map((label, i) => (
            <button
              key={i}
              onClick={() => { setStep(i); setScanProgress(0); setDocItems(d => d.map(x => ({ ...x, classified: false }))); }}
              className={`flex-1 py-2 rounded-lg text-[10px] transition-all ${step === i
                ? "bg-[#2563EB] text-white shadow-lg shadow-[#2563EB]/30"
                : step > i
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "bg-white/5 text-white/30"
              }`}
              style={{ fontWeight: step === i ? 700 : 500 }}
            >
              {step > i ? "✓ " : `${i + 1}. `}{label}
            </button>
          ))}
        </div>

        {/* Step 0 — Document Placement */}
        {step === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            <div className="bg-white/5 rounded-2xl p-5 border border-white/10 relative overflow-hidden" style={{ height: 220 }}>
              {/* 3D scan bed visualization */}
              <div className="absolute inset-0 flex items-center justify-center">
                {/* Perspective grid */}
                <div className="relative" style={{ width: 280, height: 160, perspective: 600 }}>
                  <div style={{ transform: "rotateX(30deg) rotateZ(-2deg)", transformOrigin: "center center" }}>
                    <div className="bg-gradient-to-br from-white/8 to-white/3 rounded-xl border border-white/20 p-4 relative overflow-hidden shadow-2xl" style={{ width: 280, height: 140 }}>
                      {/* Document lines */}
                      {[...Array(8)].map((_, i) => (
                        <div key={i} className="h-[1px] bg-white/10 mb-2.5 rounded" style={{ width: `${70 + Math.random() * 30}%` }} />
                      ))}
                      {/* Scan area markers */}
                      {["◤", "◥", "◣", "◢"].map((c, i) => (
                        <div key={i} className={`absolute text-[#2563EB] text-[14px] opacity-70 ${
                          i === 0 ? "top-1 left-1" : i === 1 ? "top-1 right-1" : i === 2 ? "bottom-1 left-1" : "bottom-1 right-1"
                        }`}>{c}</div>
                      ))}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] text-white/20 text-center" style={{ fontWeight: 600 }}>
                        AIRFRAME LOGBOOK<br />N12345 · 1,204 TT
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white text-[13px]" style={{ fontWeight: 700 }}>Document Positioned</div>
                <div className="text-white/40 text-[11px]">Page aligned and ready for capture</div>
              </div>
              <button
                onClick={() => setStep(1)}
                className="bg-[#2563EB] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-xl text-[12px] transition-colors"
                style={{ fontWeight: 600 }}
              >
                Start Scanning →
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 1 — Scanning */}
        {step === 1 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            <div className="bg-white/5 rounded-2xl border border-white/10 relative overflow-hidden" style={{ height: 220 }}>
              {/* Document */}
              <div className="absolute inset-x-8 top-4 bottom-4 bg-white/8 rounded-xl border border-white/15 overflow-hidden">
                {/* Document lines */}
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="h-[1px] bg-white/8 mb-3 mx-4 rounded" style={{ marginTop: 12 + i * 16, width: `${60 + (i % 3) * 15}%` }} />
                ))}

                {/* Animated scan line */}
                <motion.div
                  className="absolute left-0 right-0 h-[3px] shadow-lg"
                  style={{
                    background: "linear-gradient(90deg, transparent, #2563EB, #60a5fa, #2563EB, transparent)",
                    boxShadow: "0 0 20px rgba(37,99,235,0.8), 0 0 40px rgba(37,99,235,0.3)",
                    top: `${scanProgress}%`
                  }}
                />
                {/* Scan glow */}
                <motion.div
                  className="absolute left-0 right-0 h-12 opacity-20"
                  style={{
                    background: "linear-gradient(180deg, rgba(37,99,235,0) 0%, rgba(37,99,235,0.6) 50%, rgba(37,99,235,0) 100%)",
                    top: `${scanProgress - 6}%`
                  }}
                />

                {/* Particles — OCR points appearing */}
                {particles.map(p => (
                  <motion.div
                    key={p.id}
                    className="absolute w-1 h-1 rounded-full bg-[#2563EB]"
                    style={{ left: `${p.x}%`, top: `${p.y}%` }}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: [0, 1, 0], scale: [0, 1.5, 0] }}
                    transition={{ duration: 0.8 }}
                  />
                ))}

                {/* Progress overlay — already scanned */}
                <div
                  className="absolute left-0 right-0 top-0 bg-gradient-to-b from-[#2563EB]/5 to-transparent pointer-events-none"
                  style={{ height: `${scanProgress}%` }}
                />
              </div>

              {/* Info overlay */}
              <div className="absolute bottom-4 left-8 right-8">
                <div className="bg-[#0A1628]/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/10 flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-pulse" />
                  <span className="text-[10px] text-white/60">600 DPI · Aviation-grade OCR active</span>
                  <span className="ml-auto text-[10px] text-[#2563EB]" style={{ fontWeight: 700 }}>{Math.round(scanProgress)}%</span>
                </div>
              </div>
            </div>
            {/* Progress bar */}
            <div className="bg-white/5 rounded-full h-1.5 overflow-hidden">
              <motion.div className="h-full bg-gradient-to-r from-[#2563EB] to-[#60a5fa] rounded-full"
                style={{ width: `${scanProgress}%` }} />
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-white/40">High-resolution capture in progress…</span>
              <span className="text-[#2563EB]" style={{ fontWeight: 600 }}>Page 1 of 24</span>
            </div>
          </motion.div>
        )}

        {/* Step 2 — AI Classification */}
        {step === 2 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-md bg-[#2563EB] flex items-center justify-center">
                <Cpu className="w-3 h-3 text-white" />
              </div>
              <span className="text-white text-[12px]" style={{ fontWeight: 700 }}>AI Classification Engine</span>
              <span className="ml-auto text-[10px] text-emerald-400 animate-pulse" style={{ fontWeight: 600 }}>● Processing…</span>
            </div>
            <div className="space-y-1.5" style={{ maxHeight: 200, overflowY: "hidden" }}>
              {docItems.map((doc) => (
                <motion.div
                  key={doc.id}
                  className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                    doc.classified
                      ? "bg-white/8 border-white/15"
                      : "bg-white/3 border-white/5"
                  }`}
                  animate={doc.classified ? { scale: [1.02, 1] } : {}}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center transition-all ${
                      doc.classified ? "bg-emerald-500" : "bg-white/10"
                    }`}>
                      {doc.classified && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </div>
                    <div>
                      <div className="text-[11px] text-white/80" style={{ fontWeight: doc.classified ? 600 : 400 }}>{doc.label}</div>
                    </div>
                  </div>
                  {doc.classified && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`text-[9px] px-2 py-0.5 rounded-full ${typeColors[doc.type] || "bg-gray-100 text-gray-700"}`}
                      style={{ fontWeight: 700 }}
                    >
                      {doc.type}
                    </motion.span>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Step 3 — Delivery */}
        {step === 3 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            <div className="bg-gradient-to-br from-emerald-500/15 to-teal-500/10 rounded-2xl p-5 border border-emerald-500/20 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-emerald-900/30">
                <CheckCircle2 className="w-7 h-7 text-white" />
              </div>
              <div className="text-white text-[15px] mb-1" style={{ fontWeight: 800 }}>Records Delivered!</div>
              <div className="text-emerald-400 text-[12px] mb-4">42 pages · 6 document types · 100% indexed</div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Documents", val: "42" },
                  { label: "Categories", val: "6" },
                  { label: "Searchable", val: "100%" },
                ].map((stat) => (
                  <div key={stat.label} className="bg-white/10 rounded-xl p-2.5">
                    <div className="text-white text-[14px]" style={{ fontWeight: 800 }}>{stat.val}</div>
                    <div className="text-white/40 text-[10px]">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white/5 rounded-xl p-3 border border-white/10 text-center">
              <div className="text-white/40 text-[11px]">Ask your aircraft anything about these records</div>
              <div className="mt-1.5 bg-white/8 rounded-lg px-3 py-2 text-[11px] text-[#2563EB] italic">
                "When was the last magneto inspection on N12345?"
              </div>
            </div>
            <button
              onClick={() => { setStep(0); setScanProgress(0); setDocItems(d => d.map(x => ({ ...x, classified: false }))); }}
              className="w-full py-2 rounded-xl bg-white/8 border border-white/10 text-white/40 text-[11px] hover:text-white/60 transition-colors"
            >
              ↺ Restart Simulation
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}

/* ─── Document Category Cards ───────────────────────────────────── */
const docCategories = [
  { label: "Airframe Logbook", icon: FileText, color: "bg-blue-500", desc: "Every entry from new to current — flight time, maintenance, and inspections." },
  { label: "Engine Logbook(s)", icon: Cpu, color: "bg-orange-500", desc: "Full engine history including overhaul records, IRAN, and time-since-new." },
  { label: "Propeller Records", icon: Plane, color: "bg-amber-500", desc: "Prop logbook, overhaul history, strikes, and dynamic balance records." },
  { label: "Annual Inspections", icon: CheckCircle, color: "bg-emerald-500", desc: "All annual inspection sign-offs with squawk lists and return-to-service." },
  { label: "AD Compliance", icon: Shield, color: "bg-violet-500", desc: "Every Airworthiness Directive compliance record, including recurring ADs." },
  { label: "Service Bulletins", icon: FileSearch, color: "bg-sky-500", desc: "Manufacturer SB compliance records and factory service history." },
  { label: "Avionics & STCs", icon: Database, color: "bg-pink-500", desc: "Supplemental Type Certificates, avionics logs, and modification records." },
  { label: "Weight & Balance", icon: Layers, color: "bg-teal-500", desc: "Current W&B data sheets, equipment lists, and modification history." },
];

const processSteps = [
  {
    num: "01",
    icon: Phone,
    title: "Schedule Your On-Site Visit",
    desc: "Contact us and we'll schedule a convenient time to visit your hangar, FBO, or storage facility. We come to you — no need to move your aircraft or ship anything."
  },
  {
    num: "02",
    icon: Truck,
    title: "Our Team Arrives On-Site",
    desc: "Our certified aviation records specialists arrive with professional scanning equipment calibrated for logbook and document capture. We bring everything needed — you just need to be there."
  },
  {
    num: "03",
    icon: ScanLine,
    title: "Professional High-Resolution Scanning",
    desc: "Every page is captured at 600 DPI minimum with automatic white-balance correction, de-skewing, and quality verification. We check every scan before moving to the next page."
  },
  {
    num: "04",
    icon: Cpu,
    title: "Aviation-Grade OCR & AI Classification",
    desc: "Our AI processes every scanned image with aviation-specific OCR trained on logbook terminology, part numbers, regulatory references, and inspection formats."
  },
  {
    num: "05",
    icon: FolderCheck,
    title: "Expert Document Categorization",
    desc: "Each document is classified by type, date, aircraft registration, and regulatory relevance. Airframe logbooks, engine records, ADs, STCs, inspections — all organized precisely."
  },
  {
    num: "06",
    icon: Search,
    title: "Quality Review & Indexing",
    desc: "Every document goes through a human quality review by our aviation records specialists before delivery. Missing entries are flagged and gaps are documented."
  },
  {
    num: "07",
    icon: Database,
    title: "Delivered to Your Account",
    desc: "Your complete, searchable digital records library is live in your myaircraft.us account within 24-48 hours of scanning completion. AI is immediately ready to answer questions."
  },
  {
    num: "08",
    icon: Shield,
    title: "$100,000 Insurance Coverage Throughout",
    desc: "Your records are covered by $100,000 in liability insurance from the moment our team arrives until the moment your physical documents are back in your possession."
  },
];

export function ScanningPage() {
  const [activeCategory, setActiveCategory] = useState<number | null>(null);

  return (
    <div className="bg-white">

      {/* ── Hero ── */}
      <section className="bg-gradient-to-br from-[#0A1628] via-[#0d1f3c] to-[#1E3A5F] py-20 md:py-28 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
          backgroundSize: "40px 40px"
        }} />

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
                <div className="inline-flex items-center gap-2 bg-emerald-500/20 border border-emerald-400/30 rounded-full px-4 py-1.5 mb-5">
                  <Award className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300 text-[11px]" style={{ fontWeight: 700, letterSpacing: "0.06em" }}>ON-SITE · FREE · $100K INSURED</span>
                </div>
                <h1 className="text-[42px] md:text-[52px] tracking-tight text-white mb-5" style={{ fontWeight: 800, lineHeight: 1.1 }}>
                  We come to you.<br />
                  <span className="text-emerald-400">Scanning is free.</span>
                </h1>
                <p className="text-white/60 text-[16px] leading-relaxed mb-7 max-w-lg">
                  Our aviation records team travels to your hangar or FBO, professionally scans your complete logbook set, categorizes everything with AI, and delivers fully searchable records to your account — at no charge.
                </p>

                {/* Key stats */}
                <div className="grid grid-cols-3 gap-3 mb-8">
                  {[
                    { val: "$0", label: "Scanning Cost", sub: "Completely free" },
                    { val: "$100K", label: "Insurance", sub: "Full liability coverage" },
                    { val: "24h", label: "Delivery", sub: "Records live fast" },
                  ].map((stat) => (
                    <div key={stat.val} className="bg-white/8 border border-white/15 rounded-2xl p-4 text-center">
                      <div className="text-[26px] text-white tracking-tight mb-0.5" style={{ fontWeight: 800 }}>{stat.val}</div>
                      <div className="text-white text-[11px]" style={{ fontWeight: 600 }}>{stat.label}</div>
                      <div className="text-white/40 text-[10px]">{stat.sub}</div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <Link
                    href="/signup"
                    className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white px-7 py-3.5 rounded-xl text-[15px] transition-colors shadow-lg shadow-emerald-900/30"
                    style={{ fontWeight: 700 }}
                  >
                    Schedule Scanning <ArrowRight className="w-4 h-4" />
                  </Link>
                  <a
                    href="#how-it-works"
                    className="inline-flex items-center gap-2 text-white/60 hover:text-white text-[14px] transition-colors"
                    style={{ fontWeight: 500 }}
                  >
                    See how it works <ChevronRight className="w-4 h-4" />
                  </a>
                </div>
              </motion.div>
            </div>

            {/* Right — Simulation */}
            <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.2 }}>
              <ScanningSimulation />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Insurance Banner ── */}
      <section className="bg-gradient-to-r from-emerald-700 to-teal-700 py-5">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-emerald-300 shrink-0" />
            <div>
              <span className="text-white text-[14px]" style={{ fontWeight: 700 }}>$100,000 Liability Insurance </span>
              <span className="text-emerald-300 text-[13px]">— Your records are fully protected from the moment our team arrives.</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-emerald-300 text-[13px]">
            <Lock className="w-4 h-4" />
            <span style={{ fontWeight: 600 }}>Bonded & Insured Specialists</span>
          </div>
        </div>
      </section>

      {/* ── Why Free? ── */}
      <section className="py-20 bg-[#f8f9fb]">
        <div className="max-w-5xl mx-auto px-6">
          <FadeIn>
            <div className="grid md:grid-cols-2 gap-10 items-center">
              <div>
                <div className="inline-flex items-center gap-2 bg-[#0A1628]/8 rounded-full px-3 py-1 mb-5">
                  <Star className="w-3.5 h-3.5 text-[#2563EB]" />
                  <span className="text-[11px] text-[#2563EB] uppercase tracking-widest" style={{ fontWeight: 700 }}>Why Is Scanning Free?</span>
                </div>
                <h2 className="text-[32px] text-[#0A1628] tracking-tight mb-4" style={{ fontWeight: 800 }}>
                  No upfront cost.<br />The service pays for itself.
                </h2>
                <p className="text-[#64748b] text-[15px] leading-relaxed mb-5">
                  We believe every aircraft owner deserves professional digital records — not just those who can afford a $1,000 scanning service. So we eliminated the upfront cost entirely.
                </p>
                <p className="text-[#64748b] text-[15px] leading-relaxed mb-5">
                  Our on-site scanning service is provided under a service agreement. The scanning cost is absorbed by your ongoing myaircraft.us subscription — meaning the service genuinely pays for itself over time as you use the platform.
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-[13px] text-amber-800 mb-1" style={{ fontWeight: 700 }}>Service Agreement</div>
                      <p className="text-[12px] text-amber-700 leading-relaxed">
                        The scanning service is offered under a service agreement. If you choose to cancel before the agreement term, a prorated scanning fee may apply. All terms are clearly disclosed before scheduling — there are no surprises.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl overflow-hidden shadow-xl">
                <ImageWithFallback
                  src={IMG_HANGAR}
                  alt="Aviation records specialists"
                  className="w-full h-[380px] object-cover"
                />
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <FadeIn>
            <div className="text-center mb-14">
              <h2 className="text-[36px] text-[#0A1628] tracking-tight mb-3" style={{ fontWeight: 800 }}>How On-Site Scanning Works</h2>
              <p className="text-[#64748b] text-[15px] max-w-xl mx-auto">From scheduling to searchable records — here's exactly what happens, step by step.</p>
            </div>
          </FadeIn>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {processSteps.map((step, i) => (
              <FadeIn key={step.num} delay={i * 0.08}>
                <div className={`rounded-2xl p-5 h-full border relative overflow-hidden ${
                  i === 7
                    ? "bg-gradient-to-br from-[#0A1628] to-[#1E3A5F] border-transparent"
                    : "bg-[#f8f9fb] border-[rgba(15,23,42,0.06)]"
                }`}>
                  <div className={`text-[32px] absolute top-4 right-4 opacity-10 ${i === 7 ? "text-white" : "text-[#0A1628]"}`} style={{ fontWeight: 900, fontFamily: "monospace" }}>
                    {step.num}
                  </div>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${
                    i === 7 ? "bg-emerald-500" : "bg-[#0A1628]/8"
                  }`}>
                    <step.icon className={`w-5 h-5 ${i === 7 ? "text-white" : "text-[#1E3A5F]"}`} />
                  </div>
                  <h3 className={`text-[13px] mb-2 ${i === 7 ? "text-white" : "text-[#0A1628]"}`} style={{ fontWeight: 700 }}>{step.title}</h3>
                  <p className={`text-[12px] leading-relaxed ${i === 7 ? "text-white/60" : "text-[#64748b]"}`}>{step.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Document Categories ── */}
      <section className="py-20 bg-gradient-to-br from-[#0A1628] to-[#0d1f3c]">
        <div className="max-w-6xl mx-auto px-6">
          <FadeIn>
            <div className="text-center mb-14">
              <h2 className="text-[36px] text-white tracking-tight mb-3" style={{ fontWeight: 800 }}>Every Document Type — Covered</h2>
              <p className="text-white/50 text-[15px] max-w-xl mx-auto">Our AI is trained on aviation document types and automatically classifies every page of your records into the right category.</p>
            </div>
          </FadeIn>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {docCategories.map((cat, i) => (
              <FadeIn key={cat.label} delay={i * 0.07}>
                <motion.div
                  whileHover={{ scale: 1.02, y: -2 }}
                  className="bg-white/5 border border-white/10 rounded-2xl p-5 cursor-pointer hover:bg-white/8 transition-colors"
                  onClick={() => setActiveCategory(activeCategory === i ? null : i)}
                >
                  <div className={`w-10 h-10 rounded-xl ${cat.color} flex items-center justify-center mb-3 shadow-lg`}>
                    <cat.icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-white text-[13px] mb-1" style={{ fontWeight: 700 }}>{cat.label}</h3>
                  <p className="text-white/40 text-[12px] leading-relaxed">{cat.desc}</p>
                </motion.div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Security & Insurance Deep Dive ── */}
      <section className="py-20 bg-[#f8f9fb]">
        <div className="max-w-5xl mx-auto px-6">
          <FadeIn>
            <div className="text-center mb-14">
              <h2 className="text-[36px] text-[#0A1628] tracking-tight mb-3" style={{ fontWeight: 800 }}>Security You Can Count On</h2>
              <p className="text-[#64748b] text-[15px] max-w-xl mx-auto">Your aircraft records are irreplaceable. We treat them that way — with multi-layer security from physical handling through digital storage.</p>
            </div>
          </FadeIn>

          <div className="grid md:grid-cols-3 gap-6 mb-10">
            {[
              {
                icon: Shield,
                color: "from-emerald-500 to-teal-600",
                title: "$100,000 Liability Insurance",
                desc: "Every on-site visit is covered by $100,000 in liability insurance. From the moment our team arrives at your location, your physical records are protected against loss, damage, or any handling incident. Coverage extends through the entire scanning session until documents are returned to you."
              },
              {
                icon: Lock,
                color: "from-[#2563EB] to-[#1d4ed8]",
                title: "Physical Security Protocol",
                desc: "Our specialists follow strict chain-of-custody procedures for every document. Records are never left unattended. All personnel are background-checked and bonded. You're present throughout the entire scanning session and retain physical control of your documents at all times."
              },
              {
                icon: Database,
                color: "from-[#1E3A5F] to-[#0A1628]",
                title: "Digital Security — AES-256",
                desc: "Once digitized, your records are encrypted with AES-256 at rest and TLS 1.3 in transit. Stored on redundant cloud infrastructure with daily off-site backups. Access is controlled by role-based permissions — only you and those you authorize can view your records."
              },
            ].map((item) => (
              <FadeIn key={item.title}>
                <div className="bg-white rounded-2xl border border-[rgba(15,23,42,0.06)] overflow-hidden shadow-sm h-full">
                  <div className={`bg-gradient-to-br ${item.color} p-5`}>
                    <item.icon className="w-6 h-6 text-white mb-2" />
                    <h3 className="text-white text-[16px]" style={{ fontWeight: 700 }}>{item.title}</h3>
                  </div>
                  <div className="p-5">
                    <p className="text-[#64748b] text-[13px] leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>

          {/* What our scanning certifies */}
          <FadeIn>
            <div className="bg-white rounded-2xl border border-[rgba(15,23,42,0.06)] p-7 shadow-sm">
              <h3 className="text-[#0A1628] text-[16px] mb-5" style={{ fontWeight: 700 }}>Our Scanning Certification Standard</h3>
              <div className="grid md:grid-cols-2 gap-4">
                {[
                  "600 DPI minimum capture resolution on all documents",
                  "Color-accurate scanning preserving ink, stamps, and annotations",
                  "Automatic image correction: de-skew, brightness, contrast",
                  "Multi-pass OCR with aviation-specific terminology recognition",
                  "Human quality check on every scan before delivery",
                  "Page-count verification against original document",
                  "Metadata tagging: date, type, aircraft, inspector, certificate #",
                  "FAA-recognizable digital format for records verification",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span className="text-[13px] text-[#374151]">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Scanning Hero Image ── */}
      <section className="py-20 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="rounded-3xl overflow-hidden relative shadow-2xl">
            <ImageWithFallback
              src={IMG_SCANNING}
              alt="Aircraft logbook scanning"
              className="w-full h-[380px] object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0A1628]/90 via-[#0A1628]/50 to-transparent" />
            <div className="absolute inset-0 flex items-center px-12">
              <FadeIn>
                <div className="max-w-md">
                  <div className="text-emerald-400 text-[12px] mb-3 uppercase tracking-widest" style={{ fontWeight: 700 }}>Real Records. Real Intelligence.</div>
                  <h2 className="text-white text-[32px] tracking-tight mb-4" style={{ fontWeight: 800 }}>From physical pages<br />to instant AI answers</h2>
                  <p className="text-white/60 text-[14px] leading-relaxed mb-6">
                    Once your records are digitized, every logbook entry, inspection report, AD compliance, and maintenance note is fully searchable. Ask your aircraft any question — get source-backed answers from your actual documents.
                  </p>
                  <Link
                    href="/signup"
                    className="inline-flex items-center gap-2 bg-[#2563EB] hover:bg-[#1d4ed8] text-white px-6 py-3 rounded-xl text-[14px] transition-colors"
                    style={{ fontWeight: 600 }}
                  >
                    Schedule Your Scanning <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </FadeIn>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 bg-gradient-to-br from-[#0A1628] to-[#1E3A5F]">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <FadeIn>
            <div className="w-14 h-14 rounded-2xl bg-emerald-500 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-900/30">
              <ScanLine className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-[36px] text-white tracking-tight mb-4" style={{ fontWeight: 800 }}>Ready to digitize your records?</h2>
            <p className="text-white/60 text-[16px] mb-8 max-w-lg mx-auto">
              Schedule a free on-site scanning session. Our team comes to you, handles everything, and delivers fully searchable records within 24-48 hours. No charge. Fully insured.
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap mb-8">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white px-8 py-3.5 rounded-xl text-[15px] transition-colors shadow-lg"
                style={{ fontWeight: 700 }}
              >
                Get Started — It's Free <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 text-white/60 hover:text-white text-[14px] transition-colors"
                style={{ fontWeight: 500 }}
              >
                View Pricing <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="flex items-center justify-center gap-6 text-white/30 text-[12px]">
              <span className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> On-site service</span>
              <span className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> $100K insured</span>
              <span className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> No charge</span>
              <span className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> 24h delivery</span>
            </div>
          </FadeIn>
        </div>
      </section>

    </div>
  );
}
