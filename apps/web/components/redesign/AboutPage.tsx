"use client";

import { useRef } from "react";
import { motion, useInView } from "motion/react";
import { Plane, Target, Heart, Shield, ArrowRight, CheckCircle, Users, Star, Zap, BookOpen } from "lucide-react";
import Link from "next/link";
import { ImageWithFallback } from "./figma/ImageWithFallback";

const IMG_TEAM    = "https://images.unsplash.com/photo-1579249813515-7c627e23f565?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhdmlhdGlvbiUyMHRlYW0lMjBwZW9wbGUlMjBvZmZpY2UlMjBtZWV0aW5nfGVufDF8fHx8MTc3NjAwODg1OXww&ixlib=rb-4.1.0&q=80&w=1080";
const IMG_HANGAR  = "https://images.unsplash.com/photo-1768967750878-e97c39508783?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhaXJjcmFmdCUyMG1haW50ZW5hbmNlJTIwaGFuZ2FyJTIwbWVjaGFuaWN8ZW58MXx8fHwxNzc2MDA4ODYwfDA&ixlib=rb-4.1.0&q=80&w=1080";

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

const VALUES = [
  {
    icon: <Shield className="w-5 h-5" />,
    title: "Aviation First",
    desc: "Every feature is designed around how real A&P mechanics, IAs, and aircraft owners actually work — not adapted from a generic SaaS template.",
    color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  },
  {
    icon: <Target className="w-5 h-5" />,
    title: "Accuracy Over Speed",
    desc: "We'd rather show you a verified answer from your records than a fast guess. AI responses are always traceable to source documents.",
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  },
  {
    icon: <Heart className="w-5 h-5" />,
    title: "Built by Pilots",
    desc: "Our founding team holds PPL and A&P certificates. We've experienced the pain of paper logbooks firsthand — and we built the fix.",
    color: "text-red-400 bg-red-500/10 border-red-500/20",
  },
  {
    icon: <Zap className="w-5 h-5" />,
    title: "Always Current",
    desc: "FAA regulations change. ADs are issued. Our platform stays current so your compliance posture stays current — automatically.",
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  },
];

const TEAM = [
  {
    name: "Marcus Webb",
    role: "CEO & Co-founder",
    cert: "PPL · Instrument Rated",
    bio: "20 years in enterprise SaaS before returning to his first love — aviation. Owns a Cessna 182 and has 1,200 hours TT.",
    initials: "MW",
    color: "bg-blue-600",
  },
  {
    name: "Sarah Okonkwo",
    role: "CTO & Co-founder",
    cert: "A&P · IA Certificate",
    bio: "Former FAA DER and A&P mechanic with 15 years of maintenance experience. Led digital transformation at a regional Part 135 operator.",
    initials: "SO",
    color: "bg-violet-600",
  },
  {
    name: "Daniel Reyes",
    role: "Head of AI",
    cert: "PhD, Machine Learning",
    bio: "Built document intelligence systems at two AI unicorns. Passionate about making complex regulatory data accessible to everyone.",
    initials: "DR",
    color: "bg-emerald-600",
  },
  {
    name: "Priya Nair",
    role: "Head of Design",
    cert: "Former ALPA staff",
    bio: "Professional pilot turned UX designer. Brings a cockpit clarity mindset to every interface — information where you need it, when you need it.",
    initials: "PN",
    color: "bg-amber-600",
  },
  {
    name: "Tom Brandt",
    role: "VP Sales & Success",
    cert: "2,500 hrs TT · CFI",
    bio: "Built sales orgs at three aviation technology companies. Deeply understands the needs of FBOs, flight schools, and maintenance shops.",
    initials: "TB",
    color: "bg-red-600",
  },
  {
    name: "Lisa Chen",
    role: "General Counsel",
    cert: "Aviation Law Specialist",
    bio: "Former NTSB attorney with expertise in FAA regulatory compliance, aviation data privacy, and liability frameworks for AI-assisted decisions.",
    initials: "LC",
    color: "bg-teal-600",
  },
];

const STATS = [
  { val: "2022", label: "Founded" },
  { val: "12K+", label: "Aircraft managed" },
  { val: "50K+", label: "Documents indexed" },
  { val: "98%", label: "Retention rate" },
];

const MILESTONES = [
  { year: "2022", label: "Founded in Austin, TX by Marcus Webb and Sarah Okonkwo after years of frustration with paper logbooks." },
  { year: "2023", label: "Launched scanning service and AI document Q&A. First 500 aircraft onboarded in 90 days." },
  { year: "2024", label: "Released Mechanic Portal with work orders, estimates, and invoicing. Crossed 5,000 aircraft milestone." },
  { year: "2025", label: "Launched owner–mechanic linked workspace, FAA Registry live sync, and Parts Ordering integration." },
  { year: "2026", label: "12,000+ aircraft across 47 states. Expanding to Canada, Australia, and the UK." },
];

export function AboutPage() {
  return (
    <div className="bg-[#0A1628] min-h-screen">

      {/* ── Hero ── */}
      <section className="relative pt-24 pb-20 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#1E3A5F]/40 to-transparent pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] rounded-full bg-[#2563EB]/8 blur-[140px] pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <FadeIn>
            <div className="inline-flex items-center gap-2 bg-[#2563EB]/15 border border-[#2563EB]/30 rounded-full px-4 py-1.5 mb-6">
              <Plane className="w-3.5 h-3.5 text-[#60a5fa]" />
              <span className="text-[#60a5fa] text-[12px]" style={{ fontWeight: 700, letterSpacing: "0.07em" }}>OUR STORY</span>
            </div>
          </FadeIn>
          <FadeIn delay={0.08}>
            <h1 className="text-white text-[52px] tracking-tight mb-5 leading-[1.1]" style={{ fontWeight: 900 }}>
              We got tired of losing<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#60a5fa] to-[#2563EB]">hours to paper records</span>
            </h1>
          </FadeIn>
          <FadeIn delay={0.14}>
            <p className="text-white/50 text-[18px] leading-relaxed max-w-2xl mx-auto">
              myaircraft.us was built by pilots and mechanics who spent too many Saturday mornings digging through logbooks to answer simple questions. We knew there had to be a better way.
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="px-4 pb-16">
        <div className="max-w-4xl mx-auto">
          <FadeIn>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {STATS.map((s) => (
                <div key={s.val} className="bg-[#0d1f3c] border border-white/10 rounded-2xl p-6 text-center">
                  <div className="text-white text-[36px] mb-1" style={{ fontWeight: 800 }}>{s.val}</div>
                  <div className="text-white/40 text-[13px]">{s.label}</div>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Mission ── */}
      <section className="px-4 py-16 bg-[#060f1e]">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <FadeIn>
              <div>
                <div className="inline-flex items-center gap-2 text-[#60a5fa] text-[12px] mb-4" style={{ fontWeight: 700, letterSpacing: "0.07em" }}>
                  <Target className="w-4 h-4" /> OUR MISSION
                </div>
                <h2 className="text-white text-[36px] mb-5 leading-tight" style={{ fontWeight: 800 }}>
                  Make aircraft records as intelligent as the aircraft themselves
                </h2>
                <p className="text-white/50 text-[15px] leading-relaxed mb-5">
                  Aviation safety depends on accurate records. Yet most of the industry still relies on handwritten logbooks, manila folders, and memory. We're changing that — one aircraft at a time.
                </p>
                <p className="text-white/50 text-[15px] leading-relaxed mb-6">
                  Our platform doesn't just digitize your records. It makes them queryable, compliant, and collaborative — connecting owners, mechanics, and IAs in a shared workspace built around the aircraft.
                </p>
                {["Not affiliated with the FAA or any government agency.", "Your data is never sold or used to train public AI models.", "Aircraft records are encrypted and access-controlled per role."].map((t) => (
                  <div key={t} className="flex items-start gap-2.5 mb-2.5">
                    <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    <span className="text-white/60 text-[13px]">{t}</span>
                  </div>
                ))}
              </div>
            </FadeIn>
            <FadeIn delay={0.1}>
              <div className="relative">
                <ImageWithFallback
                  src={IMG_HANGAR}
                  alt="Aircraft maintenance hangar"
                  className="w-full h-72 object-cover rounded-2xl"
                />
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-[#0A1628]/60 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="bg-[#0A1628]/90 border border-white/10 rounded-xl px-4 py-3 backdrop-blur-sm">
                    <p className="text-white text-[13px]" style={{ fontWeight: 600 }}>
                      "We scanned 800 pages of logbooks. The AI found an open AD the previous owner missed."
                    </p>
                    <p className="text-white/40 text-[11px] mt-1">— A&P Mechanic, Phoenix AZ</p>
                  </div>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── Values ── */}
      <section className="px-4 py-16">
        <div className="max-w-5xl mx-auto">
          <FadeIn className="text-center mb-10">
            <h2 className="text-white text-[36px] mb-3" style={{ fontWeight: 800 }}>What we stand for</h2>
            <p className="text-white/40 text-[15px]">The principles that guide every decision we make.</p>
          </FadeIn>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {VALUES.map((v, i) => (
              <FadeIn key={v.title} delay={i * 0.08}>
                <div className="bg-[#0d1f3c] border border-white/8 rounded-2xl p-6">
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-4 ${v.color}`}>
                    {v.icon}
                  </div>
                  <h3 className="text-white text-[17px] mb-2" style={{ fontWeight: 700 }}>{v.title}</h3>
                  <p className="text-white/45 text-[14px] leading-relaxed">{v.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Team ── */}
      <section className="px-4 py-16 bg-[#060f1e]">
        <div className="max-w-5xl mx-auto">
          <FadeIn className="text-center mb-10">
            <h2 className="text-white text-[36px] mb-3" style={{ fontWeight: 800 }}>Meet the team</h2>
            <p className="text-white/40 text-[15px]">Pilots, mechanics, and engineers who live and breathe aviation.</p>
          </FadeIn>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
            {TEAM.map((m, i) => (
              <FadeIn key={m.name} delay={i * 0.06}>
                <div className="bg-[#0d1f3c] border border-white/8 rounded-2xl p-5">
                  <div className={`w-12 h-12 rounded-2xl ${m.color} flex items-center justify-center text-white mb-4`} style={{ fontWeight: 700 }}>
                    {m.initials}
                  </div>
                  <div className="text-white text-[16px] mb-0.5" style={{ fontWeight: 700 }}>{m.name}</div>
                  <div className="text-[#60a5fa] text-[12px] mb-1" style={{ fontWeight: 600 }}>{m.role}</div>
                  <div className="text-white/30 text-[11px] mb-3">{m.cert}</div>
                  <p className="text-white/45 text-[13px] leading-relaxed">{m.bio}</p>
                </div>
              </FadeIn>
            ))}
          </div>
          <FadeIn delay={0.2}>
            <div className="bg-[#2563EB]/10 border border-[#2563EB]/20 rounded-2xl p-6 text-center">
              <Users className="w-8 h-8 text-[#60a5fa] mx-auto mb-3" />
              <h3 className="text-white text-[18px] mb-2" style={{ fontWeight: 700 }}>We're hiring</h3>
              <p className="text-white/45 text-[14px] mb-4">Join a small team building technology that makes aviation safer and more accessible.</p>
              <Link href="/contact" className="inline-flex items-center gap-2 bg-[#2563EB] hover:bg-[#1d4ed8] text-white px-5 py-2.5 rounded-xl text-[13px] transition-all" style={{ fontWeight: 600 }}>
                Get in touch <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Timeline ── */}
      <section className="px-4 py-16">
        <div className="max-w-3xl mx-auto">
          <FadeIn className="text-center mb-10">
            <h2 className="text-white text-[36px] mb-3" style={{ fontWeight: 800 }}>Our journey</h2>
          </FadeIn>
          <div className="relative">
            <div className="absolute left-[22px] top-0 bottom-0 w-px bg-white/10" />
            <div className="space-y-6">
              {MILESTONES.map((m, i) => (
                <FadeIn key={m.year} delay={i * 0.08}>
                  <div className="flex items-start gap-5">
                    <div className="w-11 h-11 rounded-full bg-[#2563EB] flex items-center justify-center text-white text-[12px] shrink-0 relative z-10" style={{ fontWeight: 700 }}>
                      {m.year.slice(2)}
                    </div>
                    <div className="bg-[#0d1f3c] border border-white/8 rounded-xl p-4 flex-1">
                      <div className="text-[#60a5fa] text-[12px] mb-1" style={{ fontWeight: 700 }}>{m.year}</div>
                      <p className="text-white/65 text-[13px] leading-relaxed">{m.label}</p>
                    </div>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Team photo + CTA ── */}
      <section className="px-4 py-16 bg-[#060f1e]">
        <div className="max-w-5xl mx-auto">
          <FadeIn>
            <div className="relative rounded-3xl overflow-hidden mb-10">
              <ImageWithFallback
                src={IMG_TEAM}
                alt="myaircraft.us team"
                className="w-full h-64 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0A1628] via-[#0A1628]/40 to-transparent" />
              <div className="absolute bottom-8 left-8">
                <div className="flex items-center gap-2 mb-2">
                  {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 text-yellow-400 fill-yellow-400" />)}
                </div>
                <p className="text-white text-[16px]" style={{ fontWeight: 700 }}>Trusted by 12,000+ aircraft owners and mechanics</p>
              </div>
            </div>
          </FadeIn>
          <FadeIn delay={0.1} className="text-center">
            <div className="inline-flex items-center gap-2 bg-[#2563EB]/15 border border-[#2563EB]/30 rounded-full px-4 py-1.5 mb-5">
              <BookOpen className="w-3.5 h-3.5 text-[#60a5fa]" />
              <span className="text-[#60a5fa] text-[12px]" style={{ fontWeight: 700 }}>READY TO START?</span>
            </div>
            <h2 className="text-white text-[36px] mb-4" style={{ fontWeight: 800 }}>Join thousands of aviation professionals</h2>
            <p className="text-white/45 text-[16px] mb-8">30-day free trial. Free scanning service. No credit card required.</p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Link href="/signup" className="inline-flex items-center gap-2 bg-[#2563EB] hover:bg-[#1d4ed8] text-white px-8 py-3.5 rounded-xl text-[15px] transition-all shadow-xl shadow-blue-900/40" style={{ fontWeight: 700 }}>
                Start Free Trial <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/contact" className="inline-flex items-center gap-2 text-white/50 hover:text-white text-[14px] transition-colors" style={{ fontWeight: 500 }}>
                Contact us →
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>

    </div>
  );
}
