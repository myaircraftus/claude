"use client";

import React from "react";
import Link from "next/link";
import {
  CheckCircle, ArrowRight, HelpCircle, ChevronDown,
  Plane, Wrench, Shield, Sparkles, FileText, Bell,
  Users, Brain, Lock, Zap, Database, Star, Package,
  ScanLine, Award, Clock, Globe, Phone
} from "lucide-react";

import { useState, useRef } from "react";
import { motion, useInView, AnimatePresence } from "motion/react";

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

const ownerFeatures = [
  {
    icon: Brain,
    title: "AI-Powered Records Intelligence",
    desc: "Ask natural language questions about your aircraft — \"When was the last magneto inspection?\" — and get instant, source-backed answers from your actual logbooks and documents."
  },
  {
    icon: FileText,
    title: "Unlimited Document Storage & OCR",
    desc: "Upload logbooks, inspection reports, ADs, SBs, certificates and more. Every page is OCR-processed so every word is fully searchable and indexed."
  },
  {
    icon: Bell,
    title: "Smart Compliance & AD Tracking",
    desc: "Never miss an Airworthiness Directive. The system automatically cross-references your aircraft against FAA databases and flags upcoming compliance requirements."
  },
  {
    icon: Shield,
    title: "Maintenance Entry Generation",
    desc: "AI drafts FAR 43.9-compliant maintenance entries from your work history. Review, edit, and digitally sign — all from your phone or desktop."
  },
  {
    icon: Users,
    title: "Unlimited Team Members",
    desc: "Invite your mechanic, co-owner, flight school, or IA with role-based permissions. Owner, Mechanic, IA, and Read-Only access levels included at no extra cost."
  },
  {
    icon: Zap,
    title: "Smart Reminders & Calendar",
    desc: "Automated reminders for annual inspections, 100-hour checks, pitot-static tests, ELT inspections, and every other time/calendar-limited item in your maintenance program."
  },
  {
    icon: Lock,
    title: "Secure Digital Archive",
    desc: "Military-grade encryption at rest and in transit. Your records are stored with the same security standards used by financial institutions. Daily off-site backups."
  },
  {
    icon: Globe,
    title: "Anywhere Access",
    desc: "Access your complete aircraft records from any device, anywhere — preflight on your tablet, in the FBO on your phone, or in your office on desktop."
  },
];

const mechanicFeatures = [
  {
    icon: Sparkles,
    title: "AI Logbook Entry Generator",
    desc: "Describe the work performed and the AI generates a complete, FAR-compliant logbook entry. Save hours of paperwork on every job."
  },
  {
    icon: FileText,
    title: "Work Order Management",
    desc: "Create, track, and close work orders with full line-item detail. Attach documents, photos, parts receipts, and notes to every job."
  },
  {
    icon: Package,
    title: "Parts & Reference Lookup",
    desc: "Integrated parts catalog search across major suppliers. Look up P/N compatibility, pricing, and availability without leaving the platform."
  },
  {
    icon: CheckCircle,
    title: "Digital Sign-Off Workflows",
    desc: "Full e-signature support for logbook entries, work orders, and return-to-service statements. Legally binding digital signatures with audit trail."
  },
  {
    icon: FileText,
    title: "Professional Invoicing",
    desc: "Generate professional invoices from work orders in one click. Send via email, collect digital approval, and track payment status."
  },
  {
    icon: Users,
    title: "Unlimited Customer Aircraft",
    desc: "Manage records for every customer aircraft in your shop — no limits, no per-aircraft add-on fees. Your entire customer fleet in one place."
  },
  {
    icon: Shield,
    title: "Compliance Verification",
    desc: "Real-time AD and SB compliance checking against each aircraft's maintenance history. Catch missed items before return to service."
  },
  {
    icon: Database,
    title: "Complete Maintenance History",
    desc: "Full searchable maintenance history for every customer aircraft. Quickly pull up past annual reports, previous squawks, and historical parts usage."
  },
];

const faqs = [
  {
    q: "What counts as one aircraft?",
    a: "Each unique FAA tail number / registration is one aircraft. You can add or remove aircraft from your account at any time, and billing adjusts automatically on your next billing cycle."
  },
  {
    q: "Is there a free trial?",
    a: "Yes — 14 days free with one aircraft. No credit card required to start. You'll have full access to all features during the trial period."
  },
  {
    q: "Does the scanning service really cost nothing?",
    a: "Correct. Our on-site scanning service is provided at no charge. We travel to you, scan your complete logbook set, and deliver everything fully indexed and searchable in your account. The service is offered under a service agreement — details are explained on the Scanning page."
  },
  {
    q: "Can I share access with my mechanic?",
    a: "Yes. You can invite any number of team members with role-based permissions: Owner, Mechanic, IA, and Read-Only. Each role has carefully defined access controls so your mechanic sees exactly what they need."
  },
  {
    q: "What formats can I upload?",
    a: "PDF, JPG, PNG, TIFF, and HEIC. All files are OCR-processed regardless of format. Scanned documents, photos of logbook pages, and digital files are all supported."
  },
  {
    q: "Is my data secure?",
    a: "Yes. All data is encrypted at rest (AES-256) and in transit (TLS 1.3). We maintain daily off-site backups and comply with SOC 2 Type II security standards. Your records are never shared or sold."
  },
  {
    q: "What happens if I cancel?",
    a: "You can export all your data at any time in standard PDF and JSON formats. We provide a full 30-day window after cancellation to download your records."
  },
  {
    q: "Can I use myaircraft for multiple aircraft?",
    a: "Absolutely. Each aircraft is billed separately at $99/month (or $79/month on an annual plan). Many fleet operators run 10-50+ aircraft on a single account with centralized management."
  },
  {
    q: "How does the annual discount work?",
    a: "Choose annual billing at checkout and instantly save 20% on both plans. Both the Owner Plan and Mechanic Plan drop from $99 to $79/month (billed $948/year). You can switch between monthly and annual at any time."
  },
];

export function PricingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");

  const ownerMonthly = 99;
  const ownerAnnual = Math.round(ownerMonthly * 0.8); // $79
  const mechanicMonthly = 99;
  const mechanicAnnual = Math.round(mechanicMonthly * 0.8); // $79

  const ownerPrice = billing === "monthly" ? ownerMonthly : ownerAnnual;
  const mechanicPrice = billing === "monthly" ? mechanicMonthly : mechanicAnnual;

  return (
    <div className="bg-white">

      {/* ── Hero ── */}
      <section className="bg-gradient-to-br from-[#0A1628] via-[#0d1f3c] to-[#1E3A5F] py-24 md:py-32 relative overflow-hidden">
        {/* Background grid */}
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
          backgroundSize: "40px 40px"
        }} />
        {/* Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(37,99,235,0.15) 0%, transparent 70%)" }} />

        <div className="max-w-5xl mx-auto px-6 text-center relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 mb-6 backdrop-blur-sm">
              <Star className="w-3.5 h-3.5 text-[#2563EB]" />
              <span className="text-white/80 text-[12px]" style={{ fontWeight: 600, letterSpacing: "0.06em" }}>SIMPLE, TRANSPARENT PRICING</span>
            </div>
            <h1 className="text-[44px] md:text-[56px] tracking-tight text-white mb-4" style={{ fontWeight: 800 }}>
              One price.<br />
              <span className="text-[#2563EB]">Everything included.</span>
            </h1>
            <p className="text-white/60 text-[17px] max-w-xl mx-auto mb-8 leading-relaxed">
              No hidden fees. No per-user charges. No per-page limits. Just powerful aircraft records intelligence at a flat rate.
            </p>
            <div className="flex items-center justify-center gap-6 text-white/50 text-[13px]">
              <span className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4 text-emerald-400" /> 14-day free trial</span>
              <span className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4 text-emerald-400" /> No credit card required</span>
              <span className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4 text-emerald-400" /> Cancel anytime</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Plans ── */}
      <section className="py-16 bg-[#f8f9fb]">
        <div className="max-w-5xl mx-auto px-6">

          {/* ── Billing toggle ── */}
          <FadeIn>
            <div className="flex items-center justify-center mb-10">
              <div className="inline-flex items-center bg-white border border-[rgba(15,23,42,0.1)] rounded-2xl p-1.5 shadow-sm gap-1">
                <button
                  onClick={() => setBilling("monthly")}
                  className={`px-6 py-2.5 rounded-xl text-[13px] transition-all ${
                    billing === "monthly"
                      ? "bg-[#0A1628] text-white shadow-md"
                      : "text-[#64748b] hover:text-[#0A1628]"
                  }`}
                  style={{ fontWeight: 600 }}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBilling("annual")}
                  className={`px-6 py-2.5 rounded-xl text-[13px] transition-all flex items-center gap-2 ${
                    billing === "annual"
                      ? "bg-[#0A1628] text-white shadow-md"
                      : "text-[#64748b] hover:text-[#0A1628]"
                  }`}
                  style={{ fontWeight: 600 }}
                >
                  Annual
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                    billing === "annual"
                      ? "bg-emerald-500 text-white"
                      : "bg-emerald-100 text-emerald-700"
                  }`} style={{ fontWeight: 700 }}>
                    Save 20%
                  </span>
                </button>
              </div>
            </div>
          </FadeIn>

          <div className="grid md:grid-cols-2 gap-6">

            {/* Aircraft Owner Plan */}
            <FadeIn delay={0.1}>
              <div className="rounded-2xl bg-gradient-to-br from-[#0A1628] to-[#1E3A5F] p-8 text-left shadow-2xl shadow-[#0A1628]/30 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-10"
                  style={{ background: "radial-gradient(circle, #2563EB 0%, transparent 70%)", transform: "translate(30%, -30%)" }} />
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                        <Plane className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="text-[11px] text-white/50 uppercase tracking-widest" style={{ fontWeight: 600 }}>Aircraft Owner</div>
                        <div className="text-white text-[15px]" style={{ fontWeight: 700 }}>Owner Plan</div>
                      </div>
                    </div>
                    {billing === "annual" && (
                      <div className="bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[10px] px-2.5 py-1 rounded-full" style={{ fontWeight: 700 }}>
                        20% OFF
                      </div>
                    )}
                  </div>

                  <div className="flex items-baseline gap-1.5 mb-1">
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={ownerPrice}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={{ duration: 0.2 }}
                        className="text-[52px] text-white tracking-tight"
                        style={{ fontWeight: 800 }}
                      >
                        ${ownerPrice}
                      </motion.span>
                    </AnimatePresence>
                    <div>
                      <div className="text-white/50 text-[13px]">per aircraft</div>
                      <div className="text-white/50 text-[12px]">per month{billing === "annual" ? ", billed annually" : ""}</div>
                    </div>
                  </div>
                  {billing === "annual" && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-white/35 text-[13px] line-through">${ownerMonthly}/mo</span>
                      <span className="text-emerald-400 text-[12px]" style={{ fontWeight: 600 }}>Save ${(ownerMonthly - ownerAnnual) * 12}/aircraft/yr</span>
                    </div>
                  )}
                  <p className="text-white/50 text-[13px] mb-6 leading-relaxed">
                    Full records intelligence for your aircraft. Unlimited documents, unlimited users, AI-powered answers from your actual logbooks.
                  </p>

                  <div className="space-y-2.5 mb-7">
                    {[
                      "Unlimited document uploads (PDF, JPG, PNG, TIFF)",
                      "AI-powered Q&A from your actual logbooks",
                      "Source-backed answers with page references",
                      "AD & SB compliance tracking + alerts",
                      "Smart reminders for every inspection type",
                      "AI maintenance entry drafting",
                      "Document OCR & full-text indexing",
                      "Unlimited team members (any role)",
                      "Live track & status monitoring",
                      "Secure share links for buyer/lender due diligence",
                    ].map((f) => (
                      <div key={f} className="flex items-start gap-2.5">
                        <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
                        <span className="text-[13px] text-white/75">{f}</span>
                      </div>
                    ))}
                  </div>

                  <Link
                    href="/signup"
                    className="inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-[14px] bg-[#2563EB] hover:bg-[#1d4ed8] text-white transition-colors shadow-lg shadow-[#2563EB]/30"
                    style={{ fontWeight: 600 }}
                  >
                    Start Free Trial <ArrowRight className="w-4 h-4" />
                  </Link>
                  <Link
                    href="/app"
                    className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-[13px] text-white/40 hover:text-white/70 transition-colors mt-2"
                    style={{ fontWeight: 500 }}
                  >
                    Try live demo first →
                  </Link>
                </div>
              </div>
            </FadeIn>

            {/* Mechanic Plan */}
            <FadeIn delay={0.2}>
              <div className="rounded-2xl bg-white border border-[rgba(15,23,42,0.08)] p-8 text-left shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-[0.04]"
                  style={{ background: "radial-gradient(circle, #1E3A5F 0%, transparent 70%)", transform: "translate(30%, -30%)" }} />
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#0A1628]/8 flex items-center justify-center">
                        <Wrench className="w-5 h-5 text-[#1E3A5F]" />
                      </div>
                      <div>
                        <div className="text-[11px] text-[#64748b] uppercase tracking-widest" style={{ fontWeight: 600 }}>A&P / IA Mechanic</div>
                        <div className="text-[#0A1628] text-[15px]" style={{ fontWeight: 700 }}>Mechanic Plan</div>
                      </div>
                    </div>
                    {billing === "annual" && (
                      <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] px-2.5 py-1 rounded-full" style={{ fontWeight: 700 }}>
                        20% OFF
                      </div>
                    )}
                  </div>

                  <div className="flex items-baseline gap-1.5 mb-1">
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={mechanicPrice}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={{ duration: 0.2 }}
                        className="text-[52px] text-[#0A1628] tracking-tight"
                        style={{ fontWeight: 800 }}
                      >
                        ${mechanicPrice}
                      </motion.span>
                    </AnimatePresence>
                    <div>
                      <div className="text-[#64748b] text-[13px]">per mechanic</div>
                      <div className="text-[#64748b] text-[12px]">per month{billing === "annual" ? ", billed annually" : ""}</div>
                    </div>
                  </div>
                  {billing === "annual" && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[#94a3b8] text-[13px] line-through">${mechanicMonthly}/mo</span>
                      <span className="text-emerald-600 text-[12px]" style={{ fontWeight: 600 }}>Save ${(mechanicMonthly - mechanicAnnual) * 12}/yr</span>
                    </div>
                  )}
                  <p className="text-[#64748b] text-[13px] mb-6 leading-relaxed">
                    Full toolkit for A&P mechanics and IAs. Manage unlimited customers and aircraft with AI-powered logbook generation and professional workflows.
                  </p>

                  <div className="space-y-2.5 mb-7">
                    {[
                      "AI logbook entry generator (FAR 43.9 compliant)",
                      "Unlimited customer aircraft management",
                      "Work order creation & tracking",
                      "Parts catalog search & lookup",
                      "Digital e-signature workflows",
                      "Professional invoicing & estimates",
                      "Compliance verification per aircraft",
                      "Full maintenance history per customer",
                      "Customer portal with owner notifications",
                      "Inspection checklist templates",
                    ].map((f) => (
                      <div key={f} className="flex items-start gap-2.5">
                        <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-emerald-500" />
                        <span className="text-[13px] text-[#374151]">{f}</span>
                      </div>
                    ))}
                  </div>

                  <Link
                    href="/signup"
                    className="inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-[14px] bg-[#0A1628] hover:bg-[#1E3A5F] text-white transition-colors"
                    style={{ fontWeight: 600 }}
                  >
                    Start Free Trial <ArrowRight className="w-4 h-4" />
                  </Link>
                  <Link
                    href="/app/mechanic"
                    className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-[13px] text-[#64748b] hover:text-[#0A1628] transition-colors mt-2"
                    style={{ fontWeight: 500 }}
                  >
                    Try mechanic demo first →
                  </Link>
                </div>
              </div>
            </FadeIn>
          </div>

          {/* Compare note */}
          <FadeIn delay={0.3}>
            <div className="mt-5 text-center">
              <p className="text-[13px] text-[#64748b]">Both plans include the same 14-day free trial. No credit card required. <Link href="/signup" className="text-[#2563EB] hover:underline" style={{ fontWeight: 500 }}>Get started free →</Link></p>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Scanning CTA — FREE ── */}
      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <FadeIn>
            <div className="rounded-3xl overflow-hidden bg-gradient-to-br from-[#0A1628] via-[#0d1f3c] to-[#1E3A5F] relative">
              {/* Background pattern */}
              <div className="absolute inset-0 opacity-[0.05]" style={{
                backgroundImage: "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
                backgroundSize: "32px 32px"
              }} />
              <div className="relative z-10 p-10 md:p-14">
                <div className="grid md:grid-cols-2 gap-10 items-center">
                  <div>
                    <div className="inline-flex items-center gap-2 bg-emerald-500/20 border border-emerald-400/30 rounded-full px-4 py-1.5 mb-5">
                      <Award className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-300 text-[11px]" style={{ fontWeight: 700, letterSpacing: "0.06em" }}>COMPLIMENTARY SERVICE — NO CHARGE</span>
                    </div>
                    <h2 className="text-[32px] md:text-[38px] text-white tracking-tight mb-3" style={{ fontWeight: 800 }}>
                      On-Site Records<br />
                      <span className="text-emerald-400">Scanning — FREE</span>
                    </h2>
                    <p className="text-white/60 text-[15px] leading-relaxed mb-6">
                      We come to your hangar or FBO and digitize your complete aircraft records on-site. No shipping your irreplaceable logbooks. No logistics hassle. Our team handles everything while your aircraft stays right where it belongs.
                    </p>
                    <div className="grid grid-cols-2 gap-3 mb-7">
                      {[
                        { icon: Shield, label: "$100,000 Insurance Coverage", sub: "Full liability during scanning" },
                        { icon: ScanLine, label: "On-Site Service", sub: "We come to your location" },
                        { icon: Clock, label: "Same-Day Completion", sub: "Most logbook sets in 1 day" },
                        { icon: Lock, label: "Contract-Protected", sub: "Transparent service agreement" },
                      ].map((item) => (
                        <div key={item.label} className="flex items-start gap-2.5 bg-white/5 rounded-xl p-3 border border-white/10">
                          <item.icon className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" />
                          <div>
                            <div className="text-white text-[11px]" style={{ fontWeight: 700 }}>{item.label}</div>
                            <div className="text-white/40 text-[10px]">{item.sub}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Link
                      href="/scanning"
                      className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white px-6 py-3 rounded-xl text-[14px] transition-colors shadow-lg shadow-emerald-900/30"
                      style={{ fontWeight: 600 }}
                    >
                      Learn About Scanning <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                  <div className="hidden md:block">
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                      <div className="text-white/40 text-[11px] uppercase tracking-widest mb-4" style={{ fontWeight: 600 }}>What's Included — At No Cost</div>
                      {[
                        "On-site visit to your hangar or FBO",
                        "High-resolution scanning of all logbook pages",
                        "Engine logbook, airframe logbook & all supplements",
                        "Aviation-grade OCR text extraction",
                        "AI-powered document classification by type",
                        "Chronological organization & indexing",
                        "Quality review by aviation records specialists",
                        "Delivery to your myaircraft.us account",
                        "$100,000 liability insurance coverage",
                        "Records live in your account within 24-48 hours",
                      ].map((item) => (
                        <div key={item} className="flex items-center gap-2.5 py-2 border-b border-white/5 last:border-0">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="text-white/65 text-[13px]">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Feature Deep Dive — Owner ── */}
      <section className="py-20 bg-[#f8f9fb]">
        <div className="max-w-6xl mx-auto px-6">
          <FadeIn>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#1d4ed8] flex items-center justify-center">
                <Plane className="w-4 h-4 text-white" />
              </div>
              <span className="text-[12px] text-[#2563EB] uppercase tracking-widest" style={{ fontWeight: 700 }}>Owner Features — $99/aircraft/month</span>
            </div>
            <h2 className="text-[32px] text-[#0A1628] tracking-tight mb-2" style={{ fontWeight: 800 }}>Everything an aircraft owner needs</h2>
            <p className="text-[#64748b] text-[15px] mb-12 max-w-2xl">Your complete aircraft records — organized, searchable, and intelligently accessible from anywhere.</p>
          </FadeIn>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {ownerFeatures.map((f, i) => (
              <FadeIn key={f.title} delay={i * 0.05}>
                <div className="bg-white rounded-2xl p-5 border border-[rgba(15,23,42,0.06)] hover:shadow-md transition-shadow h-full">
                  <div className="w-9 h-9 rounded-xl bg-[#0A1628]/5 flex items-center justify-center mb-3">
                    <f.icon className="w-4.5 h-4.5 text-[#1E3A5F]" style={{ width: 18, height: 18 }} />
                  </div>
                  <h3 className="text-[13px] text-[#0A1628] mb-2" style={{ fontWeight: 700 }}>{f.title}</h3>
                  <p className="text-[12px] text-[#64748b] leading-relaxed">{f.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Feature Deep Dive — Mechanic ── */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <FadeIn>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1E3A5F] to-[#0A1628] flex items-center justify-center">
                <Wrench className="w-4 h-4 text-white" />
              </div>
              <span className="text-[12px] text-[#1E3A5F] uppercase tracking-widest" style={{ fontWeight: 700 }}>Mechanic Features — $99/mechanic/month</span>
            </div>
            <h2 className="text-[32px] text-[#0A1628] tracking-tight mb-2" style={{ fontWeight: 800 }}>Built for A&P mechanics and IAs</h2>
            <p className="text-[#64748b] text-[15px] mb-12 max-w-2xl">From first squawk to signed logbook entry and final invoice — your complete professional workflow in one platform.</p>
          </FadeIn>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {mechanicFeatures.map((f, i) => (
              <FadeIn key={f.title} delay={i * 0.05}>
                <div className="bg-[#f8f9fb] rounded-2xl p-5 border border-[rgba(15,23,42,0.06)] hover:shadow-md transition-shadow h-full">
                  <div className="w-9 h-9 rounded-xl bg-[#1E3A5F]/8 flex items-center justify-center mb-3">
                    <f.icon className="w-4.5 h-4.5 text-[#1E3A5F]" style={{ width: 18, height: 18 }} />
                  </div>
                  <h3 className="text-[13px] text-[#0A1628] mb-2" style={{ fontWeight: 700 }}>{f.title}</h3>
                  <p className="text-[12px] text-[#64748b] leading-relaxed">{f.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Demo CTA ── */}
      <section className="py-16 bg-gradient-to-br from-[#0A1628] to-[#1E3A5F]">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <FadeIn>
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 mb-6">
              <Zap className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-white/80 text-[12px]" style={{ fontWeight: 600 }}>INSTANT DEMO — NO SIGNUP REQUIRED</span>
            </div>
            <h2 className="text-[36px] text-white tracking-tight mb-4" style={{ fontWeight: 800 }}>
              See it before you sign up
            </h2>
            <p className="text-white/60 text-[16px] mb-8 max-w-xl mx-auto">
              Explore the full platform as an Aircraft Owner or as an A&P Mechanic — complete with sample aircraft records, work orders, and AI features.
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Link
                href="/app"
                className="inline-flex items-center gap-2 bg-[#2563EB] hover:bg-[#1d4ed8] text-white px-8 py-3.5 rounded-xl text-[15px] transition-colors shadow-lg shadow-[#2563EB]/30"
                style={{ fontWeight: 600 }}
              >
                <Plane className="w-4 h-4" />
                Demo as Aircraft Owner
              </Link>
              <Link
                href="/app/mechanic"
                className="inline-flex items-center gap-2 bg-white/10 border border-white/20 hover:bg-white/15 text-white px-8 py-3.5 rounded-xl text-[15px] transition-colors"
                style={{ fontWeight: 600 }}
              >
                <Wrench className="w-4 h-4" />
                Demo as A&P Mechanic
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-20 bg-white">
        <div className="max-w-3xl mx-auto px-6">
          <FadeIn>
            <h2 className="text-[32px] text-center tracking-tight text-[#0A1628] mb-3" style={{ fontWeight: 800 }}>Frequently asked questions</h2>
            <p className="text-center text-[#64748b] text-[15px] mb-12">Everything you need to know about pricing and the platform.</p>
          </FadeIn>
          <div className="space-y-2">
            {faqs.map((faq, i) => (
              <FadeIn key={i} delay={i * 0.04}>
                <div className="border border-[rgba(15,23,42,0.08)] rounded-2xl overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between p-5 text-left hover:bg-[#f8f9fb] transition-colors"
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  >
                    <span className="text-[14px] text-[#0A1628] pr-4" style={{ fontWeight: 600 }}>{faq.q}</span>
                    <ChevronDown className={`w-4 h-4 text-[#64748b] shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
                  </button>
                  <AnimatePresence>
                    {openFaq === i && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 pb-5 text-[13px] text-[#64748b] leading-relaxed border-t border-[rgba(15,23,42,0.05)] pt-4">{faq.a}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </FadeIn>
            ))}
          </div>

          <FadeIn>
            <div className="mt-12 text-center bg-[#f8f9fb] rounded-2xl p-8 border border-[rgba(15,23,42,0.06)]">
              <Phone className="w-6 h-6 text-[#2563EB] mx-auto mb-3" />
              <h3 className="text-[18px] text-[#0A1628] mb-2" style={{ fontWeight: 700 }}>Still have questions?</h3>
              <p className="text-[#64748b] text-[13px] mb-4">Our team is happy to walk you through the platform or answer any questions about fit for your operation.</p>
              <a href="mailto:hello@myaircraft.us" className="inline-flex items-center gap-2 text-[#2563EB] text-[14px] hover:underline" style={{ fontWeight: 500 }}>
                hello@myaircraft.us <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </FadeIn>
        </div>
      </section>

    </div>
  );
}
