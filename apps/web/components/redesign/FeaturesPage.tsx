"use client";

import { useRef } from "react";
import { motion, useInView } from "motion/react";
import {
  Brain, FileText, Shield, Wrench, BarChart3, Bell,
  Plane, Search, Upload, CheckCircle, Zap, Lock,
  BookOpen, Receipt, Users, MessageSquare, Clock, Database,
  Cpu, FileCheck, AlertTriangle, Star, ArrowRight, Play,
  RefreshCw, Package, Edit3, CloudUpload, Fingerprint,
  ScrollText, CalendarCheck, Landmark, Settings2,
} from "lucide-react";
import Link from "next/link";

function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 28 }} animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }} className={className}>
      {children}
    </motion.div>
  );
}

const FEATURES_HERO = [
  { icon: <Brain className="w-6 h-6" />, label: "AI Intelligence", color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
  { icon: <FileText className="w-6 h-6" />, label: "Document Management", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  { icon: <Shield className="w-6 h-6" />, label: "FAA Compliance", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  { icon: <Wrench className="w-6 h-6" />, label: "Mechanic Portal", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
];

const FEATURE_GROUPS = [
  {
    id: "ai",
    label: "AI & Intelligence",
    tagline: "Ask anything. Get answers from your actual records.",
    icon: <Brain className="w-5 h-5" />,
    color: "from-violet-500/20 to-purple-500/10",
    border: "border-violet-500/20",
    accent: "text-violet-400",
    features: [
      { icon: <MessageSquare className="w-4 h-4" />, title: "Natural Language Q&A", desc: "Ask 'Is my ELT in compliance?' and get an immediate, citation-backed answer from your own logbooks and records." },
      { icon: <Brain className="w-4 h-4" />, title: "AI Command Center", desc: "One interface to query airworthiness status, upcoming due items, AD research, and maintenance history — all at once." },
      { icon: <Search className="w-4 h-4" />, title: "Semantic Document Search", desc: "Search across thousands of pages of maintenance logs instantly. Find any entry in seconds, not hours." },
      { icon: <Cpu className="w-4 h-4" />, title: "Auto-Summarization", desc: "Get intelligent summaries of aircraft history, recent work, and open squawks without reading every page." },
      { icon: <AlertTriangle className="w-4 h-4" />, title: "AD Research Assistant", desc: "Ask about specific ADs by number or description. AI cross-references your aircraft's type certificate and installed equipment." },
      { icon: <Zap className="w-4 h-4" />, title: "Smart Suggestions", desc: "Proactive alerts for items that commonly get missed — 100-hour nearing, annual due, transponder check, ELT battery, and more." },
    ],
  },
  {
    id: "documents",
    label: "Document Management",
    tagline: "All your records. Organized, searchable, and AI-ready.",
    icon: <FileText className="w-5 h-5" />,
    color: "from-blue-500/20 to-sky-500/10",
    border: "border-blue-500/20",
    accent: "text-blue-400",
    features: [
      { icon: <Upload className="w-4 h-4" />, title: "Multi-format Ingestion", desc: "Upload PDFs, scanned images, photos of handwritten entries — our OCR engine extracts and indexes every line." },
      { icon: <CloudUpload className="w-4 h-4" />, title: "Free On-site Scanning", desc: "Our team comes to your hangar and professionally scans your entire paper records archive at no charge." },
      { icon: <Database className="w-4 h-4" />, title: "Structured Data Extraction", desc: "Automatically extracts dates, tach times, Hobbs times, part numbers, STC references, and mechanic signatures." },
      { icon: <FileCheck className="w-4 h-4" />, title: "Version Control", desc: "Never lose an old revision. Every document version is stored, timestamped, and accessible with full audit history." },
      { icon: <Edit3 className="w-4 h-4" />, title: "Logbook Entry Generator", desc: "Generate FAA-compliant maintenance entries using AI. Includes proper regulatory citation, work description, and sign-off fields." },
      { icon: <BookOpen className="w-4 h-4" />, title: "Digital Logbook", desc: "A living, searchable logbook that mirrors your physical records. Every entry is indexed and cross-referenced to related ADs and STCs." },
    ],
  },
  {
    id: "compliance",
    label: "FAA Compliance",
    tagline: "Stay legal. Never miss a due date again.",
    icon: <Shield className="w-5 h-5" />,
    color: "from-emerald-500/20 to-teal-500/10",
    border: "border-emerald-500/20",
    accent: "text-emerald-400",
    features: [
      { icon: <AlertTriangle className="w-4 h-4" />, title: "AD Tracking", desc: "Comprehensive tracking of all applicable Airworthiness Directives for your specific aircraft type, serial number, and installed equipment." },
      { icon: <CalendarCheck className="w-4 h-4" />, title: "Maintenance Reminders", desc: "Automated reminders for annuals, 100-hours, pitot-static, transponder, ELT battery, and any custom intervals you define." },
      { icon: <Landmark className="w-4 h-4" />, title: "FAA Registry Sync", desc: "Real-time sync with FAA aircraft registry data. N-number verification, registration status, and ownership records always current." },
      { icon: <Shield className="w-4 h-4" />, title: "Airworthiness Status", desc: "At-a-glance dashboard showing open ADs, deferred items, MEL entries, and a clear compliance health score for each aircraft." },
      { icon: <ScrollText className="w-4 h-4" />, title: "STC Management", desc: "Track all Supplemental Type Certificates and modifications. Automatically links associated documents and ongoing requirements." },
      { icon: <CheckCircle className="w-4 h-4" />, title: "Compliance Reports", desc: "Generate shareholder, insurance, or pre-purchase inspection reports with a single click. PDF-ready with full audit trail." },
    ],
  },
  {
    id: "mechanic",
    label: "Mechanic Portal",
    tagline: "A purpose-built workspace for A&P mechanics and IAs.",
    icon: <Wrench className="w-5 h-5" />,
    color: "from-amber-500/20 to-orange-500/10",
    border: "border-amber-500/20",
    accent: "text-amber-400",
    features: [
      { icon: <Wrench className="w-4 h-4" />, title: "Work Order Management", desc: "Create, assign, and track work orders from squawk intake to sign-off. Built around the real A&P workflow, not a generic ticketing system." },
      { icon: <Receipt className="w-4 h-4" />, title: "Estimates & Invoicing", desc: "Generate professional estimates with itemized labor and parts. One-click conversion to invoice with e-signature and payment tracking." },
      { icon: <Package className="w-4 h-4" />, title: "Parts Ordering", desc: "Search across major aviation parts suppliers. Order directly from the work order. Track core charges, serialized parts, and traceability." },
      { icon: <BookOpen className="w-4 h-4" />, title: "Mechanic Logbook", desc: "Mechanic-side logbook records every sign-off with certificate number, date, and regulatory citation. Exportable for IA review." },
      { icon: <Users className="w-4 h-4" />, title: "Customer CRM", desc: "Full customer and aircraft history at a glance. See every aircraft owned, every job completed, and outstanding balances for each customer." },
      { icon: <BarChart3 className="w-4 h-4" />, title: "Revenue Analytics", desc: "Track labor hours, parts margins, shop productivity, and monthly revenue. Know exactly which customers and aircraft types are most profitable." },
    ],
  },
  {
    id: "platform",
    label: "Platform & Security",
    tagline: "Enterprise-grade reliability built for aviation.",
    icon: <Lock className="w-5 h-5" />,
    color: "from-slate-500/20 to-slate-600/10",
    border: "border-slate-500/20",
    accent: "text-slate-300",
    features: [
      { icon: <Lock className="w-4 h-4" />, title: "End-to-End Encryption", desc: "All records encrypted at rest and in transit. Your maintenance data never leaves your account or trains AI models." },
      { icon: <Users className="w-4 h-4" />, title: "Role-Based Access", desc: "Granular permissions for owners, mechanics, IAs, and fleet managers. Share only what's needed with each party." },
      { icon: <RefreshCw className="w-4 h-4" />, title: "Real-Time Sync", desc: "Changes propagate instantly across all users. Owner sees mechanic updates live. No email chains, no version confusion." },
      { icon: <Fingerprint className="w-4 h-4" />, title: "E-Signatures", desc: "Legally binding digital signatures for work orders, estimates, and logbook entries. Compliant with FAA and EASA requirements." },
      { icon: <Settings2 className="w-4 h-4" />, title: "API & Integrations", desc: "Connect to ForeFlight, Garmin Pilot, maintenance management systems, and accounting software via our open API." },
      { icon: <Clock className="w-4 h-4" />, title: "99.9% Uptime SLA", desc: "Aviation doesn't stop on weekends. Neither does myaircraft.us. Redundant infrastructure with guaranteed availability." },
    ],
  },
];

const COMPARE = [
  { feature: "AI Q&A from your records", us: true, paper: false, generic: false },
  { feature: "Free on-site scanning", us: true, paper: false, generic: false },
  { feature: "FAA Registry live sync", us: true, paper: false, generic: false },
  { feature: "Mechanic portal + work orders", us: true, paper: false, generic: "partial" },
  { feature: "Squawk → Estimate → Invoice flow", us: true, paper: false, generic: false },
  { feature: "AD tracking with aircraft type filter", us: true, paper: false, generic: "partial" },
  { feature: "E-signature on logbook entries", us: true, paper: false, generic: "partial" },
  { feature: "Parts ordering integration", us: true, paper: false, generic: false },
  { feature: "Owner and mechanic linked accounts", us: true, paper: false, generic: false },
  { feature: "Logbook entry generator", us: true, paper: false, generic: false },
];

export function FeaturesPage() {
  return (
    <div className="bg-[#0A1628] min-h-screen">

      {/* ── Hero ── */}
      <section className="relative pt-24 pb-20 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#1E3A5F]/40 to-transparent pointer-events-none" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#2563EB]/8 blur-[120px] pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <FadeIn>
            <div className="inline-flex items-center gap-2 bg-[#2563EB]/15 border border-[#2563EB]/30 rounded-full px-4 py-1.5 mb-6">
              <Zap className="w-3.5 h-3.5 text-[#60a5fa]" />
              <span className="text-[#60a5fa] text-[12px]" style={{ fontWeight: 700, letterSpacing: "0.07em" }}>FULL PLATFORM OVERVIEW</span>
            </div>
          </FadeIn>
          <FadeIn delay={0.08}>
            <h1 className="text-white text-[52px] tracking-tight mb-5 leading-[1.1]" style={{ fontWeight: 900 }}>
              Everything your aircraft records<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#60a5fa] to-[#2563EB]">need to be intelligent</span>
            </h1>
          </FadeIn>
          <FadeIn delay={0.14}>
            <p className="text-white/50 text-[18px] leading-relaxed max-w-2xl mx-auto mb-8">
              myaircraft.us replaces paper logbooks, spreadsheets, and filing cabinets with a unified intelligence platform purpose-built for general aviation.
            </p>
          </FadeIn>
          <FadeIn delay={0.2}>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Link href="/signup" className="inline-flex items-center gap-2 bg-[#2563EB] hover:bg-[#1d4ed8] text-white px-6 py-3 rounded-xl text-[14px] transition-all shadow-lg shadow-blue-900/40" style={{ fontWeight: 700 }}>
                Start Free Trial <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/dashboard" className="inline-flex items-center gap-2 border border-white/20 text-white/70 hover:text-white hover:border-white/40 px-6 py-3 rounded-xl text-[14px] transition-all" style={{ fontWeight: 500 }}>
                <Play className="w-4 h-4" /> Live Demo
              </Link>
            </div>
          </FadeIn>

          {/* Hero pills */}
          <FadeIn delay={0.28}>
            <div className="flex items-center justify-center gap-3 mt-10 flex-wrap">
              {FEATURES_HERO.map((f) => (
                <div key={f.label} className={`flex items-center gap-2 px-4 py-2 rounded-full border ${f.bg} ${f.color}`}>
                  {f.icon}
                  <span className="text-[13px]" style={{ fontWeight: 600 }}>{f.label}</span>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Feature groups ── */}
      <section className="px-4 pb-20">
        <div className="max-w-6xl mx-auto space-y-20">
          {FEATURE_GROUPS.map((group, gi) => (
            <FadeIn key={group.id} delay={gi * 0.05}>
              <div>
                {/* Group header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${group.color} border ${group.border} flex items-center justify-center ${group.accent}`}>
                    {group.icon}
                  </div>
                  <div>
                    <h2 className="text-white text-[24px]" style={{ fontWeight: 800 }}>{group.label}</h2>
                    <p className="text-white/40 text-[14px]">{group.tagline}</p>
                  </div>
                </div>
                <div className="h-px bg-white/8 mb-8" />

                {/* Feature grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.features.map((f) => (
                    <div key={f.title} className={`bg-gradient-to-br ${group.color} border ${group.border} rounded-2xl p-5`}>
                      <div className={`w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center mb-3 ${group.accent}`}>
                        {f.icon}
                      </div>
                      <h3 className="text-white text-[14px] mb-1.5" style={{ fontWeight: 700 }}>{f.title}</h3>
                      <p className="text-white/45 text-[13px] leading-relaxed">{f.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── Comparison table ── */}
      <section className="px-4 py-20 bg-[#060f1e]">
        <div className="max-w-4xl mx-auto">
          <FadeIn className="text-center mb-12">
            <h2 className="text-white text-[36px] mb-3" style={{ fontWeight: 800 }}>How we compare</h2>
            <p className="text-white/40 text-[16px]">myaircraft.us vs. paper records vs. generic software</p>
          </FadeIn>
          <FadeIn delay={0.1}>
            <div className="bg-[#0d1f3c] border border-white/10 rounded-2xl overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-4 bg-white/5 px-6 py-4 border-b border-white/10">
                <div className="text-white/40 text-[12px]" style={{ fontWeight: 700 }}>FEATURE</div>
                <div className="text-center">
                  <div className="text-[#60a5fa] text-[13px]" style={{ fontWeight: 700 }}>myaircraft.us</div>
                </div>
                <div className="text-center">
                  <div className="text-white/40 text-[13px]" style={{ fontWeight: 600 }}>Paper Records</div>
                </div>
                <div className="text-center">
                  <div className="text-white/40 text-[13px]" style={{ fontWeight: 600 }}>Generic Software</div>
                </div>
              </div>
              {/* Rows */}
              {COMPARE.map((row, i) => (
                <div key={row.feature} className={`grid grid-cols-4 px-6 py-3.5 items-center ${i < COMPARE.length - 1 ? "border-b border-white/5" : ""}`}>
                  <div className="text-white/70 text-[13px]">{row.feature}</div>
                  <div className="flex justify-center">
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="flex justify-center">
                    {row.paper === false
                      ? <span className="text-white/20 text-[18px]">—</span>
                      : <CheckCircle className="w-5 h-5 text-emerald-400" />}
                  </div>
                  <div className="flex justify-center">
                    {row.generic === false
                      ? <span className="text-white/20 text-[18px]">—</span>
                      : row.generic === "partial"
                      ? <span className="text-amber-400 text-[12px]" style={{ fontWeight: 600 }}>Partial</span>
                      : <CheckCircle className="w-5 h-5 text-emerald-400" />}
                  </div>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="px-4 py-20">
        <div className="max-w-2xl mx-auto text-center">
          <FadeIn>
            <div className="w-14 h-14 rounded-2xl bg-[#2563EB]/20 border border-[#2563EB]/30 flex items-center justify-center mx-auto mb-6">
              <Plane className="w-7 h-7 text-[#60a5fa]" />
            </div>
            <h2 className="text-white text-[36px] mb-4" style={{ fontWeight: 800 }}>Ready to fly smarter?</h2>
            <p className="text-white/45 text-[16px] mb-8">14-day free trial. Free on-site scanning. Cancel anytime.</p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Link href="/signup" className="inline-flex items-center gap-2 bg-[#2563EB] hover:bg-[#1d4ed8] text-white px-8 py-3.5 rounded-xl text-[15px] transition-all shadow-xl shadow-blue-900/40" style={{ fontWeight: 700 }}>
                Start Free Trial <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/pricing" className="inline-flex items-center gap-2 text-white/50 hover:text-white text-[14px] transition-colors" style={{ fontWeight: 500 }}>
                View pricing →
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>

    </div>
  );
}
