"use client";

import Link from "next/link";

import React, { useState, useEffect, useRef } from "react";
import { motion, useInView } from "motion/react";
import {
  Plane, Brain, FileCheck, Shield, Users, ChevronRight,
  CheckCircle, Clock, Sparkles, ArrowRight, Wrench, Receipt,
  BookOpen, Zap, Database, Cpu, Store, BarChart3, FileText,
  AlertTriangle, MessageSquare, Upload, Star,
  Package, CheckCircle2, Play, Mic, Bell,
  DollarSign, RefreshCw, Edit3, ChevronDown, Settings,
  Clipboard, UserCheck, PhoneCall, Lock, Search,
  Infinity as InfinityIcon
} from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { ImageWithFallback } from "./ImageWithFallback";
import { MyAircraftLogo } from "./MyAircraftLogo";

/* ─── images ─────────────────────────────────────────────────────── */
const IMG_HERO     = "https://images.unsplash.com/photo-1767532704240-65f516e6d97d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzbWFsbCUyMGFpcmNyYWZ0JTIwZmx5aW5nJTIwYmx1ZSUyMHNreSUyMGFlcmlhbHxlbnwxfHx8fDE3NzU5MTM5MTl8MA&ixlib=rb-4.1.0&q=80&w=1080";
const IMG_MECHANIC = "https://images.unsplash.com/photo-1742729251800-2f58d9c91553?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhaXJjcmFmdCUyMG1lY2hhbmljJTIwd29ya2luZyUyMGVuZ2luZSUyMG1haW50ZW5hbmNlfGVufDF8fHx8MTc3NTkxMzkxOXww&ixlib=rb-4.1.0&q=80&w=1080";
const IMG_LOGBOOK  = "https://images.unsplash.com/photo-1547717015-67560f10d0a0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhdmlhdGlvbiUyMGxvZ2Jvb2slMjByZWNvcmRzJTIwZG9jdW1lbnRzJTIwc2Nhbm5pbmd8ZW58MXx8fHwxNzc1OTEzOTIyfDA&ixlib=rb-4.1.0&q=80&w=1080";
const IMG_OWNER    = "https://images.unsplash.com/photo-1686686489494-76caffffe5b5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwaWxvdCUyMGFpcmNyYWZ0JTIwb3duZXIlMjBwcml2YXRlJTIwcGxhbmUlMjBzdW5zZXR8ZW58MXx8fHwxNzc1OTEzOTc3fDA&ixlib=rb-4.1.0&q=80&w=1080";

/* ─── data ────────────────────────────────────────────────────────── */
const activityData = [
  { m: "Oct", v: 38 }, { m: "Nov", v: 52 }, { m: "Dec", v: 44 },
  { m: "Jan", v: 67 }, { m: "Feb", v: 58 }, { m: "Mar", v: 79 }, { m: "Apr", v: 91 },
];
const WAVE_HEIGHTS = [0.3,0.7,0.5,0.9,0.4,0.8,0.6,0.95,0.3,0.7,0.5,0.85,0.4,0.75,0.6,0.9,0.35,0.8,0.55,0.7,0.4,0.65,0.9,0.5,0.7];

const AIRCRAFT_BRANDS = [
  { name: "CESSNA",     tagline: "172 · 182 · 206 · Citation",    color: "#E05B1C", bg: "#FFF5F0", mark: "cessna" },
  { name: "PIPER",      tagline: "Cherokee · Archer · Seneca",    color: "#1B3A7A", bg: "#EEF3FF", mark: "piper" },
  { name: "BEECHCRAFT", tagline: "Bonanza · Baron · King Air",    color: "#C8102E", bg: "#FFF0F0", mark: "beechcraft" },
  { name: "CIRRUS",     tagline: "SR20 · SR22 · Vision Jet",      color: "#005087", bg: "#F0F7FF", mark: "cirrus" },
  { name: "DIAMOND",    tagline: "DA40 · DA42 · DA62",            color: "#003057", bg: "#F0F8FF", mark: "diamond" },
  { name: "MOONEY",     tagline: "M20 · Acclaim · Ovation",       color: "#003B8E", bg: "#EEF4FF", mark: "mooney" },
  { name: "GULFSTREAM", tagline: "G280 · G550 · G700",            color: "#013C71", bg: "#EEF5FF", mark: "gulfstream" },
  { name: "EMBRAER",    tagline: "Phenom 100 · 300 · Praetor",    color: "#003087", bg: "#EEF4FF", mark: "embraer" },
  { name: "PILATUS",    tagline: "PC-12 · PC-24 · PC-21",         color: "#E4002B", bg: "#FFF0F2", mark: "pilatus" },
  { name: "DAHER",      tagline: "TBM 910 · 940 · 960",           color: "#E87722", bg: "#FFF8F0", mark: "daher" },
  { name: "TEXTRON",    tagline: "Citation · King Air · Caravan", color: "#003DA5", bg: "#EEF4FF", mark: "textron" },
  { name: "SOCATA",     tagline: "TB-20 · TB-21 · Trinidad",      color: "#0055A0", bg: "#EEF6FF", mark: "socata" },
];

const TECH_PARTNERS = [
  { name: "OpenAI",              role: "ChatGPT Intelligence",   logoUrl: "https://logo.clearbit.com/openai.com",     bg: "from-emerald-50 to-teal-50",  border: "border-emerald-200" },
  { name: "Anthropic",           role: "Claude AI Reasoning",    logoUrl: "https://logo.clearbit.com/anthropic.com",  bg: "from-orange-50 to-amber-50",  border: "border-orange-200" },
  { name: "Google Cloud",        role: "Document AI · OCR",      logoUrl: "https://logo.clearbit.com/google.com",     bg: "from-blue-50 to-sky-50",      border: "border-blue-200" },
  { name: "AWS Textract",        role: "Intelligent Extraction", logoUrl: "https://logo.clearbit.com/aws.amazon.com", bg: "from-yellow-50 to-orange-50", border: "border-amber-200" },
  { name: "Amazon Web Services", role: "Cloud Infrastructure",   logoUrl: "https://logo.clearbit.com/amazon.com",     bg: "from-amber-50 to-yellow-50",  border: "border-yellow-200" },
  { name: "Figma",               role: "Design System · UI/UX",  logoUrl: "https://logo.clearbit.com/figma.com",      bg: "from-red-50 to-pink-50",      border: "border-red-200" },
];

/* ─── animation helpers ─────────────────────────────────────────── */
function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 32 }} animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }} className={className}>
      {children}
    </motion.div>
  );
}

function SlideIn({ children, delay = 0, from = "left", className = "" }: { children: React.ReactNode; delay?: number; from?: "left"|"right"; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, x: from === "left" ? -56 : 56 }} animate={inView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }} className={className}>
      {children}
    </motion.div>
  );
}

function Waveform({ bars = 25, color = "#2563EB", maxH = 32, className = "" }: { bars?: number; color?: string; maxH?: number; className?: string }) {
  return (
    <div className={`flex items-center gap-[3px] ${className}`} style={{ height: maxH }}>
      {WAVE_HEIGHTS.slice(0, bars).map((h, i) => (
        <motion.div key={i} className="rounded-full shrink-0" style={{ width: 3, background: color }}
          animate={{ height: [4, Math.round(h * maxH), 4] }}
          transition={{ duration: 0.6 + (i % 5) * 0.15, repeat: Infinity, delay: i * 0.04, ease: "easeInOut" }} />
      ))}
    </div>
  );
}

function Typewriter({ phrases, className = "" }: { phrases: string[]; className?: string }) {
  const [txt, setTxt] = useState("");
  const [pi, setPi] = useState(0);
  const [ci, setCi] = useState(0);
  const [del, setDel] = useState(false);
  useEffect(() => {
    const phrase = phrases[pi];
    const t = setTimeout(() => {
      if (!del) {
        if (ci < phrase.length) { setTxt(phrase.slice(0, ci + 1)); setCi(c => c + 1); }
        else setTimeout(() => setDel(true), 2200);
      } else {
        if (ci > 0) { setTxt(phrase.slice(0, ci - 1)); setCi(c => c - 1); }
        else { setDel(false); setPi(p => (p + 1) % phrases.length); }
      }
    }, del ? 28 : 52);
    return () => clearTimeout(t);
  }, [ci, del, pi, phrases]);
  return <span className={className}>{txt}<span className="animate-pulse text-[#2563EB]">|</span></span>;
}

function EpisodeBadge({ num, label }: { num: string; label: string }) {
  return (
    <div className="flex items-center gap-3 mb-8">
      <div className="flex items-center gap-2 bg-gradient-to-r from-[#2563EB] to-[#1d4ed8] text-white px-4 py-1.5 rounded-full text-[11px] shadow-lg shadow-blue-200" style={{ fontWeight: 700, letterSpacing: "0.08em" }}>
        <Mic className="w-3 h-3" /> EPISODE {num}
      </div>
      <div className="text-[12px] text-gray-400 uppercase tracking-widest" style={{ fontWeight: 600 }}>{label}</div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   AIRCRAFT BRAND LOGO MARKS (SVG — brand-accurate colors & shapes)
──────────────────────────────────────────────────────────────────── */
function AircraftBrandLogo({ mark, color }: { mark: string; color: string }) {
  const logos: Record<string, React.ReactElement> = {
    cessna: (
      <svg viewBox="0 0 32 32" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
        {/* Open-C arc — Cessna's iconic mark */}
        <path d="M26 8 A13 13 0 1 0 26 24 L23 21 A9.2 9.2 0 1 1 23 11Z" fill={color}/>
      </svg>
    ),
    piper: (
      <svg viewBox="0 0 32 32" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
        {/* Bold P letterform */}
        <rect x="6" y="5" width="5" height="22" rx="1.5" fill={color}/>
        <path d="M11 5 h5.5 a6.5 6.5 0 0 1 0 13 H11Z" fill={color}/>
      </svg>
    ),
    beechcraft: (
      <svg viewBox="0 0 32 32" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
        {/* Diamond / beechnut rotated square */}
        <polygon points="16,2 30,16 16,30 2,16" fill={color}/>
        <polygon points="16,8.5 23.5,16 16,23.5 8.5,16" fill="white"/>
      </svg>
    ),
    cirrus: (
      <svg viewBox="0 0 32 32" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
        {/* Swept wing swoosh */}
        <path d="M2 22 Q16 6 30 15 L28 20 Q16 12 5 24Z" fill={color}/>
        <path d="M2 26 Q16 10 30 19 L28 24 Q16 16 5 28Z" fill={color} opacity="0.35"/>
      </svg>
    ),
    diamond: (
      <svg viewBox="0 0 32 32" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
        {/* Diamond Aircraft diamond mark */}
        <polygon points="16,2 30,16 16,30 2,16" fill={color}/>
        <polygon points="16,9 23,16 16,23 9,16" fill="white"/>
        <polygon points="16,13 19,16 16,19 13,16" fill={color}/>
      </svg>
    ),
    mooney: (
      <svg viewBox="0 0 32 32" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
        {/* Angular M letterform */}
        <path d="M4 28 L4 6 L16 20 L28 6 L28 28 L25 28 L25 12 L16 24 L7 12 L7 28Z" fill={color}/>
      </svg>
    ),
    gulfstream: (
      <svg viewBox="0 0 32 32" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
        {/* G with horizontal bar — Gulfstream mark */}
        <path d="M27 8 A13 13 0 1 0 27 24" fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round"/>
        <path d="M17 16 L28 16" stroke={color} strokeWidth="3.5" strokeLinecap="round"/>
      </svg>
    ),
    embraer: (
      <svg viewBox="0 0 32 32" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
        {/* E letterform with blue swoosh accent */}
        <path d="M5 5 L5 27 M5 5 L19 5 M5 16 L15 16 M5 27 L19 27"
          fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M21 5 Q31 16 21 27" fill="none" stroke="#009FE3" strokeWidth="3" strokeLinecap="round"/>
      </svg>
    ),
    pilatus: (
      <svg viewBox="0 0 32 32" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
        {/* Mountain / peak mark — Swiss-inspired */}
        <polygon points="16,3 30,29 2,29" fill="none" stroke={color} strokeWidth="2.5"/>
        <polygon points="16,11 24,29 8,29" fill={color}/>
      </svg>
    ),
    daher: (
      <svg viewBox="0 0 32 32" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
        {/* Bold D — Daher wordmark initial */}
        <path d="M7 5 h6 a12 12 0 0 1 0 22 H7Z" fill={color}/>
        <path d="M7 9 h5 a8 8 0 0 1 0 14 H7Z" fill="white" opacity="0.22"/>
      </svg>
    ),
    textron: (
      <svg viewBox="0 0 32 32" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
        {/* T lettermark — Textron Aviation */}
        <rect x="4" y="5" width="24" height="5" rx="2" fill={color}/>
        <rect x="13.5" y="10" width="5" height="17" rx="2" fill={color}/>
      </svg>
    ),
    socata: (
      <svg viewBox="0 0 32 32" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
        {/* S-curve — Socata / Daher-Socata */}
        <path d="M26 10 Q26 5 16 5 Q6 5 6 11 Q6 17 26 17 Q26 23 16 27 Q6 27 6 23"
          fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round"/>
      </svg>
    ),
  };
  return logos[mark] ?? (
    <svg viewBox="0 0 32 32" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
      <text x="4" y="24" fill={color} fontSize="20" fontWeight="900">{mark[0].toUpperCase()}</text>
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────
   OWNER DASHBOARD MOCK  — 3D floating device
──────────────────────────────────────────────────────────────────── */
function OwnerDashboardMock() {
  const items = [
    <div key="fleet-content" className="p-5">
      {/* Fleet cards */}
      <div className="text-[11px] text-gray-400 uppercase tracking-widest mb-3" style={{ fontWeight: 600 }}>Your Fleet · 3 Aircraft</div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { tail: "N12345", model: "Cessna 172S", status: "Airworthy", color: "emerald", docs: 842, hours: "1,204 TT" },
          { tail: "N67890", model: "Piper PA-28", status: "Attention", color: "amber", docs: 634, hours: "2,891 TT" },
          { tail: "N24680", model: "Beechcraft A36", status: "Airworthy", color: "emerald", docs: 371, hours: "3,102 TT" },
        ].map(ac => (
          <div key={ac.tail} className="bg-white border border-gray-100 rounded-xl p-2.5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] text-[#0A1628]" style={{ fontWeight: 800, fontFamily: "monospace" }}>{ac.tail}</span>
              <span className={`text-[8px] px-1.5 py-0.5 rounded-full ${ac.color === "emerald" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`} style={{ fontWeight: 700 }}>
                {ac.status}
              </span>
            </div>
            <div className="text-[9px] text-gray-500">{ac.model}</div>
            <div className="text-[9px] text-gray-400 mt-0.5">{ac.hours} · {ac.docs} docs</div>
          </div>
        ))}
      </div>

      {/* AD Alert */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-3 mb-3 flex items-start gap-2.5">
        <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
        </div>
        <div>
          <div className="text-[11px] text-amber-800" style={{ fontWeight: 700 }}>AD Compliance Alert</div>
          <div className="text-[10px] text-amber-700">N67890 — Alternator AD 2024-15-06 due in 12 days</div>
        </div>
      </div>

      {/* AI Command box — light version */}
      <div className="bg-gradient-to-br from-[#EFF6FF] to-[#dbeafe] border border-[#2563EB]/20 rounded-xl p-4 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-5 h-5 rounded-md bg-[#2563EB] flex items-center justify-center">
            <Sparkles className="w-3 h-3 text-white" />
          </div>
          <span className="text-[11px] text-[#1d4ed8]" style={{ fontWeight: 700 }}>AircraftDesk AI — Command Center</span>
          <span className="ml-auto text-[9px] text-emerald-600 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" /> Live
          </span>
        </div>
        <div className="text-[10px] text-[#1d4ed8]/80 mb-2.5 leading-relaxed bg-white/60 rounded-lg p-2 border border-[#2563EB]/10">
          "Show all open squawks on N67890 and create a work order for the alternator AD"
        </div>
        <div className="bg-white border border-[#2563EB]/20 rounded-lg p-2 text-[10px] text-gray-600 leading-relaxed">
          ✓ Found 2 open squawks. Work order WO-2026-0051 created. Estimate $847.50 sent to owner for approval.
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white border border-gray-100 rounded-xl p-3 mb-3 shadow-sm">
        <div className="text-[10px] text-gray-400 mb-2 uppercase tracking-wide" style={{ fontWeight: 600 }}>Fleet Maintenance Activity</div>
        <ResponsiveContainer width="100%" height={70}>
          <AreaChart data={activityData}>
            <Area type="monotone" dataKey="v" stroke="#2563EB" strokeWidth={2} fill="#2563EB" fillOpacity={0.08} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Recent docs */}
      <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-2" style={{ fontWeight: 600 }}>Recent Documents</div>
      {[
        { name: "Annual Inspection — N12345", date: "Mar 15, 2026", type: "Inspection", color: "bg-blue-100 text-blue-700" },
        { name: "Oil Change Logbook — N67890", date: "Feb 28, 2026", type: "Maintenance", color: "bg-emerald-100 text-emerald-700" },
        { name: "AD 2024-15-06 Compliance — N24680", date: "Jan 12, 2026", type: "AD/STC", color: "bg-violet-100 text-violet-700" },
      ].map((doc, i) => (
        <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
          <div>
            <div className="text-[10px] text-[#0A1628]" style={{ fontWeight: 600 }}>{doc.name}</div>
            <div className="text-[9px] text-gray-400">{doc.date}</div>
          </div>
          <span className={`text-[8px] px-2 py-0.5 rounded-full ${doc.color}`} style={{ fontWeight: 700 }}>{doc.type}</span>
        </div>
      ))}
    </div>
  ];

  return (
    <div className="rounded-[18px] overflow-hidden bg-white" style={{
      boxShadow: "0 40px 80px rgba(37,99,235,0.18), 0 20px 40px rgba(0,0,0,0.1), inset 0 0 0 1px rgba(37,99,235,0.12)",
      maxWidth: 540
    }}>
      {/* Browser chrome */}
      <div className="flex items-center gap-2 bg-[#f5f7fa] px-4 py-2.5 border-b border-gray-200">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <div className="w-3 h-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 bg-white rounded-md px-3 py-1 text-[10px] text-gray-400 text-center border border-gray-200 flex items-center justify-center gap-1.5">
          <Lock className="w-2.5 h-2.5 text-[#2563EB]" />
          myaircraft.us/dashboard
        </div>
        <RefreshCw className="w-3 h-3 text-gray-400" />
      </div>
      {/* App nav */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-100">
        <div className="flex items-center gap-2">
          <MyAircraftLogo variant="dark" height={14} />
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Bell className="w-4 h-4 text-gray-400" />
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500" />
          </div>
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#2563EB] to-[#1d4ed8] flex items-center justify-center text-[9px] text-white" style={{ fontWeight: 700 }}>J</div>
        </div>
      </div>
      {/* Layout */}
      <div className="flex" style={{ height: 450 }}>
        {/* Sidebar */}
        <div className="w-[140px] bg-gradient-to-b from-[#0A1628] to-[#0d1f3c] shrink-0 py-3 flex flex-col gap-0.5">
          {[
            { icon: BarChart3, label: "Dashboard", active: true },
            { icon: Plane, label: "Aircraft" },
            { icon: Cpu, label: "Command" },
            { icon: MessageSquare, label: "Ask" },
            { icon: FileText, label: "Documents" },
            { icon: Store, label: "Marketplace" },
            { icon: Settings, label: "Settings" },
          ].map(item => (
            <div key={item.label} className={`flex items-center gap-2.5 px-3 py-1.5 mx-2 rounded-lg ${item.active ? "bg-gradient-to-r from-[#2563EB] to-[#1d4ed8]" : "hover:bg-white/5"}`}>
              <item.icon className={`w-3 h-3 ${item.active ? "text-white" : "text-white/35"}`} />
              <span className={`text-[10px] ${item.active ? "text-white" : "text-white/35"}`} style={{ fontWeight: item.active ? 700 : 400 }}>{item.label}</span>
            </div>
          ))}
        </div>
        {/* Scrolling content */}
        <div className="flex-1 overflow-hidden bg-[#f8f9fb]">
          <motion.div animate={{ y: [0, -500] }} transition={{ duration: 22, repeat: Infinity, ease: "linear", repeatDelay: 1 }}>
            <div key="own-1">{items}</div>
            <div key="own-2">{items}</div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   MECHANIC PORTAL MOCK  — 3D floating device
──────────────────────────────────────────────────────────────────── */
function MechanicPortalMock() {
  const content = (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[9px] text-gray-400 uppercase tracking-wide mb-0.5" style={{ fontWeight: 600 }}>Active Work Order</div>
          <div className="text-[13px] text-[#0A1628]" style={{ fontWeight: 800 }}>WO-2026-0047 · N12345 Annual</div>
        </div>
        <span className="bg-gradient-to-r from-blue-500 to-blue-600 text-white text-[9px] px-2.5 py-1 rounded-full shadow-sm" style={{ fontWeight: 700 }}>IN PROGRESS</span>
      </div>

      {/* Parts */}
      <div className="bg-white border border-gray-100 rounded-xl p-3 mb-3 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide" style={{ fontWeight: 600 }}>Parts & Materials</span>
          <span className="text-[10px] text-[#2563EB]" style={{ fontWeight: 600 }}>+ Add Part</span>
        </div>
        {[
          { pn: "K65597", desc: "Oil Filter", qty: 2, price: 24.50 },
          { pn: "REM37BY", desc: "Spark Plugs", qty: 4, price: 18.75 },
          { pn: "SA-244CE", desc: "Alternator Belt", qty: 1, price: 67.00 },
          { pn: "AV1-CH48110", desc: "Air Filter", qty: 1, price: 32.80 },
        ].map(p => (
          <div key={p.pn} className="flex items-center justify-between py-1.5 border-t border-gray-50">
            <div>
              <span className="text-[9px] text-[#0A1628]" style={{ fontWeight: 700, fontFamily: "monospace" }}>{p.pn}</span>
              <span className="text-[9px] text-gray-500 ml-2">{p.desc}</span>
            </div>
            <span className="text-[9px] text-[#0A1628]" style={{ fontWeight: 700 }}>${(p.qty * p.price).toFixed(2)}</span>
          </div>
        ))}
        <div className="flex justify-between pt-2 mt-1 border-t border-gray-200">
          <span className="text-[10px] text-gray-600" style={{ fontWeight: 600 }}>Parts Total</span>
          <span className="text-[10px] text-[#0A1628]" style={{ fontWeight: 800 }}>$272.30</span>
        </div>
      </div>

      {/* AI Logbook — light blue version */}
      <div className="bg-gradient-to-br from-[#EFF6FF] to-[#dbeafe] border border-[#2563EB]/20 rounded-xl p-3 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-5 h-5 rounded-md bg-[#2563EB] flex items-center justify-center shadow-sm">
            <Sparkles className="w-3 h-3 text-white" />
          </div>
          <span className="text-[11px] text-[#1d4ed8]" style={{ fontWeight: 700 }}>AI Logbook Entry Generator</span>
        </div>
        <div className="bg-white/80 rounded-lg p-2.5 text-[9px] text-gray-600 leading-relaxed mb-2 border border-[#2563EB]/10">
          "Annual inspection per 14 CFR Part 43 App D. Aircraft airworthy. Engine oil changed (6 qts AeroShell 15W-50), spark plugs inspected, alternator belt replaced. All ADs verified current. Returned to service."
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-emerald-600" style={{ fontWeight: 600 }}>✓ FAR 43.9 Compliant</span>
          <span className="text-[9px] text-[#2563EB]">· Ready for e-Signature</span>
        </div>
      </div>

      {/* Invoice */}
      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm mb-3">
        <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-2" style={{ fontWeight: 600 }}>Invoice Summary</div>
        {[
          { label: "Labor — 6.5 hrs @ $95/hr", val: "$617.50" },
          { label: "Parts & Materials", val: "$272.30" },
          { label: "Shop Supplies (5%)", val: "$44.49" },
        ].map((r, i) => (
          <div key={i} className="flex justify-between py-1 text-[10px]">
            <span className="text-gray-500">{r.label}</span>
            <span className="text-[#0A1628]" style={{ fontWeight: 600 }}>{r.val}</span>
          </div>
        ))}
        <div className="flex justify-between pt-2 mt-1 border-t border-gray-100">
          <span className="text-[11px] text-[#0A1628]" style={{ fontWeight: 800 }}>Total Invoice</span>
          <span className="text-[11px] text-[#2563EB]" style={{ fontWeight: 800 }}>$934.29</span>
        </div>
        <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-[9px] text-emerald-700">
          ✓ Owner approved estimate via myaircraft.us portal
        </div>
      </div>

      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-1">
          <Bell className="w-3.5 h-3.5 text-[#2563EB]" />
          <span className="text-[10px] text-[#2563EB]" style={{ fontWeight: 700 }}>Owner Update Sent</span>
        </div>
        <div className="text-[9px] text-gray-600">N12345 annual complete. Logbook updated. Aircraft airworthy and ready for pickup.</div>
      </div>
    </div>
  );

  return (
    <div className="rounded-[18px] overflow-hidden bg-white" style={{
      boxShadow: "0 40px 80px rgba(30,58,95,0.18), 0 20px 40px rgba(0,0,0,0.1), inset 0 0 0 1px rgba(37,99,235,0.1)",
      maxWidth: 540
    }}>
      <div className="flex items-center gap-2 bg-[#f5f7fa] px-4 py-2.5 border-b border-gray-200">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <div className="w-3 h-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 bg-white rounded-md px-3 py-1 text-[10px] text-gray-400 text-center border border-gray-200 flex items-center justify-center gap-1.5">
          <Lock className="w-2.5 h-2.5 text-[#2563EB]" />
          myaircraft.us/mechanic/portal
        </div>
        <RefreshCw className="w-3 h-3 text-gray-400" />
      </div>
      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#1E3A5F] to-[#0A1628] flex items-center justify-center shadow-sm">
            <Wrench className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-[12px] text-[#0A1628]" style={{ fontWeight: 800 }}>Mechanic Portal</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-emerald-600" style={{ fontWeight: 600 }}>● 3 Active Jobs</span>
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#1E3A5F] to-[#2563EB] flex items-center justify-center text-[9px] text-white" style={{ fontWeight: 700 }}>M</div>
        </div>
      </div>
      <div className="flex" style={{ height: 450 }}>
        <div className="w-[130px] bg-gradient-to-b from-[#1E3A5F] to-[#0A1628] shrink-0 py-3 flex flex-col gap-0.5">
          {[
            { icon: Clipboard, label: "Work Orders", active: true },
            { icon: FileText, label: "Estimates" },
            { icon: BookOpen, label: "Logbook" },
            { icon: Users, label: "Customers" },
            { icon: Package, label: "Parts" },
            { icon: Sparkles, label: "AI Workspace" },
            { icon: Receipt, label: "Invoices" },
          ].map(item => (
            <div key={item.label} className={`flex items-center gap-2 px-3 py-1.5 mx-2 rounded-lg ${item.active ? "bg-gradient-to-r from-[#2563EB] to-[#1d4ed8]" : "hover:bg-white/5"}`}>
              <item.icon className={`w-3 h-3 ${item.active ? "text-white" : "text-white/35"}`} />
              <span className={`text-[10px] ${item.active ? "text-white" : "text-white/35"}`} style={{ fontWeight: item.active ? 700 : 400 }}>{item.label}</span>
            </div>
          ))}
        </div>
        <div className="flex-1 overflow-hidden bg-[#f8f9fb]">
          <motion.div animate={{ y: [0, -520] }} transition={{ duration: 24, repeat: Infinity, ease: "linear", repeatDelay: 1 }}>
            <div key="mech-1">{content}</div>
            <div key="mech-2">{content}</div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════
   MAIN HOMEPAGE
══════════════════════════════════════════════════════════════════ */
export function HomePage() {
  return (
    <div className="overflow-x-hidden">

      {/* ══════════════ HERO ══════════════ */}
      <section className="relative min-h-screen flex items-center overflow-hidden" style={{ background: "linear-gradient(135deg, #ffffff 0%, #EFF6FF 50%, #dbeafe 100%)" }}>
        {/* Dot grid */}
        <div className="absolute inset-0 opacity-[0.035]"
          style={{ backgroundImage: "radial-gradient(rgba(37,99,235,1) 1px, transparent 1px)", backgroundSize: "30px 30px" }} />
        {/* Large gradient orbs */}
        <div className="absolute top-0 right-0 w-[700px] h-[700px] rounded-full opacity-25 pointer-events-none"
          style={{ background: "radial-gradient(circle at 70% 20%, #93c5fd 0%, #dbeafe 40%, transparent 70%)" }} />
        <div className="absolute -bottom-20 -left-20 w-[500px] h-[500px] rounded-full opacity-15 pointer-events-none"
          style={{ background: "radial-gradient(circle, #818cf8 0%, transparent 70%)" }} />

        <div className="relative z-10 max-w-7xl mx-auto px-6 pt-28 pb-16 grid lg:grid-cols-2 gap-12 items-center w-full">
          {/* Left copy */}
          <div>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-3 border border-[#2563EB]/25 bg-white/80 backdrop-blur-sm rounded-full px-4 py-2 mb-6 shadow-lg shadow-blue-100">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[11px] text-[#2563EB]" style={{ fontWeight: 700, letterSpacing: "0.06em" }}>NOW STREAMING</span>
              </div>
              <Waveform bars={14} color="#2563EB" maxH={18} />
              <span className="text-[11px] text-gray-500" style={{ fontWeight: 500 }}>Aircraft Records Revolution</span>
            </motion.div>

            <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 }}
              className="text-[52px] lg:text-[66px] text-[#0A1628] leading-[1.04] tracking-tight mb-3" style={{ fontWeight: 900 }}>
              Your aircraft<br />records have<br />
              <span className="text-[#2563EB]">
                <Typewriter phrases={["a story to tell.", "been waiting.", "finally found AI.", "never been safer."]} />
              </span>
            </motion.h1>

            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.25 }}
              className="text-[17px] text-gray-500 leading-relaxed max-w-lg mb-8">
              We built <span className="text-[#0A1628]" style={{ fontWeight: 700 }}>myaircraft.us</span> because aircraft owners and A&P mechanics were drowning in paper, missed ADs, and broken communication. There is a better way — and it starts here.
            </motion.p>

            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.35 }}
              className="flex flex-wrap gap-3 mb-10">
              <Link href="/signup?preview=1" className="inline-flex items-center gap-2 bg-gradient-to-r from-[#2563EB] to-[#1d4ed8] text-white px-7 py-3.5 rounded-xl hover:shadow-xl hover:shadow-blue-300/40 transition-all shadow-lg shadow-blue-200 text-[15px]" style={{ fontWeight: 600 }}>
                Start for Free <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/app" className="inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-7 py-3.5 rounded-xl hover:bg-[#EFF6FF] hover:border-[#2563EB]/30 transition-all text-[15px] shadow-sm" style={{ fontWeight: 500 }}>
                <Play className="w-4 h-4 text-[#2563EB]" /> See It Live
              </Link>
            </motion.div>

            {/* Trust signals */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
              className="flex flex-wrap items-center gap-8">
              {[
                { n: "12,400+", l: "Aircraft Managed" },
                { n: "2.8M+", l: "Documents Indexed" },
                { n: "840+", l: "Active Mechanics" },
              ].map(s => (
                <div key={s.l}>
                  <div className="text-[28px] text-[#0A1628]" style={{ fontWeight: 900 }}>{s.n}</div>
                  <div className="text-[11px] text-gray-400 uppercase tracking-wide" style={{ fontWeight: 500 }}>{s.l}</div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right — premium 3D floating device */}
          <motion.div initial={{ opacity: 0, x: 60, y: 20 }} animate={{ opacity: 1, x: 0, y: 0 }} transition={{ duration: 0.9, delay: 0.3 }}
            className="hidden lg:block">
            <motion.div animate={{ y: [-10, 10, -10] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}>
              <div style={{ perspective: "1600px" }}>
                <div style={{ transform: "rotateX(6deg) rotateY(-10deg) rotateZ(1.5deg)", transformOrigin: "center center" }}>
                  <OwnerDashboardMock />
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-gray-400">
          <span className="text-[10px] uppercase tracking-widest">Scroll the story</span>
          <motion.div animate={{ y: [0, 6, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
            <ChevronDown className="w-5 h-5" />
          </motion.div>
        </div>
      </section>

      {/* ══════════════ STATS TICKER ══════════════ */}
      <div className="bg-gradient-to-r from-[#2563EB] via-[#1d4ed8] to-[#1e40af] py-4 overflow-hidden">
        <motion.div className="flex gap-12 whitespace-nowrap" animate={{ x: ["0%", "-50%"] }} transition={{ duration: 32, repeat: Infinity, ease: "linear" }}>
          {[
            { icon: "✈️", t: "2.8M+ Records Processed" }, { icon: "🔧", t: "184K+ Work Orders" },
            { icon: "📖", t: "38K+ Logbooks Digitized" }, { icon: "⏱️", t: "14 hrs Saved Per Week" },
            { icon: "🛡️", t: "Zero Missed ADs" }, { icon: "📦", t: "2.1M+ Parts Indexed" },
            { icon: "💳", t: "$99/mo · $79 annual" }, { icon: "♾️", t: "Unlimited Users Included" },
            { icon: "✈️", t: "2.8M+ Records Processed" }, { icon: "🔧", t: "184K+ Work Orders" },
            { icon: "📖", t: "38K+ Logbooks Digitized" }, { icon: "⏱️", t: "14 hrs Saved Per Week" },
            { icon: "🛡️", t: "Zero Missed ADs" }, { icon: "📦", t: "2.1M+ Parts Indexed" },
            { icon: "💳", t: "$99/mo · $79 annual" }, { icon: "♾️", t: "Unlimited Users Included" },
          ].map((s, i) => (
            <div key={i} className="flex items-center gap-2.5 text-white shrink-0">
              <span>{s.icon}</span>
              <span className="text-[13px]" style={{ fontWeight: 600 }}>{s.t}</span>
              <span className="text-white/30 ml-4">◆</span>
            </div>
          ))}
        </motion.div>
      </div>

      {/* ══════════════ AIRCRAFT BRANDS COMPATIBILITY ══════════════ */}
      <section className="bg-white py-16 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6">
          <FadeIn className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-[#EFF6FF] border border-[#2563EB]/20 rounded-full px-4 py-1.5 mb-4">
              <Plane className="w-3.5 h-3.5 text-[#2563EB]" />
              <span className="text-[12px] text-[#2563EB]" style={{ fontWeight: 600 }}>Universal Aircraft Compatibility</span>
            </div>
            <h2 className="text-[32px] text-[#0A1628] tracking-tight mb-2" style={{ fontWeight: 900 }}>
              Works with every aircraft you fly
            </h2>
            <p className="text-[15px] text-gray-500">From Cessna 172 trainers to Gulfstream G700s — every make, every model, every tail number</p>
          </FadeIn>

          {/* Scrolling brand ticker */}
          <div className="overflow-hidden mb-6">
            <motion.div className="flex gap-4 whitespace-nowrap" animate={{ x: ["0%", "-50%"] }} transition={{ duration: 28, repeat: Infinity, ease: "linear" }}>
              {[...AIRCRAFT_BRANDS, ...AIRCRAFT_BRANDS].map((brand, i) => (
                <div key={i} className="flex items-center gap-3 bg-white border rounded-xl px-5 py-3 shrink-0 hover:shadow-md transition-all shadow-sm"
                  style={{ minWidth: 200, borderColor: brand.color + "28" }}>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: brand.bg }}>
                    <AircraftBrandLogo mark={brand.mark} color={brand.color} />
                  </div>
                  <div>
                    <div className="text-[13px]" style={{ fontWeight: 800, letterSpacing: "0.04em", color: brand.color }}>{brand.name}</div>
                    <div className="text-[10px] text-gray-400" style={{ fontWeight: 500 }}>{brand.tagline}</div>
                  </div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Second row moving opposite direction */}
          <div className="overflow-hidden">
            <motion.div className="flex gap-4 whitespace-nowrap" animate={{ x: ["-50%", "0%"] }} transition={{ duration: 32, repeat: Infinity, ease: "linear" }}>
              {[...AIRCRAFT_BRANDS.slice(6), ...AIRCRAFT_BRANDS.slice(0, 6), ...AIRCRAFT_BRANDS.slice(6), ...AIRCRAFT_BRANDS.slice(0, 6)].map((brand, i) => (
                <div key={i} className="flex items-center gap-3 bg-white border rounded-xl px-5 py-3 shrink-0 hover:shadow-md transition-all shadow-sm"
                  style={{ minWidth: 200, borderColor: brand.color + "28", background: brand.bg + "66" }}>
                  <div className="w-10 h-10 rounded-lg bg-white border flex items-center justify-center shrink-0 shadow-sm"
                    style={{ borderColor: brand.color + "30" }}>
                    <AircraftBrandLogo mark={brand.mark} color={brand.color} />
                  </div>
                  <div>
                    <div className="text-[13px]" style={{ fontWeight: 800, letterSpacing: "0.04em", color: brand.color }}>{brand.name}</div>
                    <div className="text-[10px] text-gray-400" style={{ fontWeight: 500 }}>{brand.tagline}</div>
                  </div>
                </div>
              ))}
            </motion.div>
          </div>

          <FadeIn delay={0.2} className="text-center mt-8">
            <p className="text-[13px] text-gray-400">
              <span className="text-[#2563EB]" style={{ fontWeight: 600 }}>Any N-number. Any tail registration.</span> If it flies and has records, we manage them.
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ══════════════ POWERED BY AI TECH PARTNERS ══════════════ */}
      <section className="bg-white py-20 border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-6">
          <FadeIn className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-[#EFF6FF] to-white border border-[#2563EB]/20 rounded-full px-4 py-1.5 mb-4 shadow-sm">
              <Zap className="w-3.5 h-3.5 text-[#2563EB]" />
              <span className="text-[12px] text-[#2563EB]" style={{ fontWeight: 600 }}>Powered By Next-Gen AI Stack</span>
            </div>
            <h2 className="text-[38px] text-[#0A1628] tracking-tight mb-3" style={{ fontWeight: 900 }}>
              Built on the world's most advanced<br /><span className="text-[#2563EB]">AI and cloud infrastructure</span>
            </h2>
            <p className="text-[16px] text-gray-500 max-w-2xl mx-auto">
              We've assembled the most powerful AI stack in aviation — combining ChatGPT, Claude, Google Document AI, and Amazon Textract to deliver intelligence that simply doesn't exist anywhere else.
            </p>
          </FadeIn>

          <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-4 mb-12">
            {TECH_PARTNERS.map((partner, i) => (
              <FadeIn key={partner.name} delay={i * 0.08}>
                <div className={`bg-gradient-to-br ${partner.bg} border ${partner.border} rounded-2xl p-4 text-center hover:shadow-xl transition-all group cursor-default`}>
                  <div className="flex items-center justify-center h-12 mb-3">
                    <img
                      src={partner.logoUrl}
                      alt={partner.name}
                      className="w-10 h-10 object-contain rounded-xl group-hover:scale-110 transition-transform"
                      onError={(e) => {
                        const t = e.currentTarget;
                        t.style.display = "none";
                        const sibling = t.nextElementSibling as HTMLElement;
                        if (sibling) sibling.style.display = "flex";
                      }}
                    />
                    <div className="w-10 h-10 rounded-xl bg-white/70 items-center justify-center text-[20px] hidden group-hover:scale-110 transition-transform"
                      style={{ display: "none" }}>
                      {partner.name.charAt(0)}
                    </div>
                  </div>
                  <div className="text-[13px] text-[#0A1628] mb-1" style={{ fontWeight: 700 }}>{partner.name}</div>
                  <div className="text-[10px] text-gray-500" style={{ fontWeight: 500 }}>{partner.role}</div>
                </div>
              </FadeIn>
            ))}
          </div>

          {/* How AI flows */}
          <FadeIn delay={0.2}>
            <div className="bg-gradient-to-br from-[#EFF6FF] to-[#dbeafe] border border-[#2563EB]/20 rounded-3xl p-8 shadow-xl">
              <div className="text-center mb-6">
                <h3 className="text-[22px] text-[#0A1628] tracking-tight" style={{ fontWeight: 800 }}>The AI Intelligence Pipeline</h3>
                <p className="text-[14px] text-gray-500 mt-1">How every logbook scan becomes actionable intelligence</p>
              </div>
              <div className="flex flex-col md:flex-row items-center gap-4 justify-center">
                {[
                  { step: "01", label: "You Upload",      desc: "Scan or mail your logbooks",                  icon: Upload },
                  { step: "02", label: "AWS Textract",    desc: "Extracts every character with 99.9% accuracy", icon: Database },
                  { step: "03", label: "Google Doc AI",   desc: "Classifies document type, date, aircraft",     icon: FileCheck },
                  { step: "04", label: "ChatGPT + Claude",desc: "Generates embeddings, answers queries",         icon: Brain },
                  { step: "05", label: "You Ask",         desc: "Plain English answers with source citations",  icon: MessageSquare },
                ].map((s, i) => (
                  <div key={s.step} className="flex md:flex-col items-center gap-3 md:gap-2 md:text-center flex-1">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#1d4ed8] flex items-center justify-center shrink-0 shadow-lg shadow-blue-200">
                      <s.icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="text-[11px] text-[#2563EB] mb-0.5" style={{ fontWeight: 700 }}>Step {s.step}</div>
                      <div className="text-[13px] text-[#0A1628]" style={{ fontWeight: 700 }}>{s.label}</div>
                      <div className="text-[11px] text-gray-500">{s.desc}</div>
                    </div>
                    {i < 4 && <ChevronRight className="w-4 h-4 text-[#2563EB] shrink-0 hidden md:block" />}
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ══════════════ EP 01: OWNER STORY ══════════════ */}
      <section className="bg-white py-28">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <SlideIn from="left">
              <EpisodeBadge num="01" label="The Owner's Reality" />
              <div className="text-[13px] text-gray-400 uppercase tracking-widest mb-4" style={{ fontWeight: 600 }}>The Story We Hear Every Day</div>
              <blockquote className="text-[32px] text-[#0A1628] leading-[1.2] tracking-tight mb-6" style={{ fontWeight: 800 }}>
                "I own three aircraft. I have no idea when the last AD was complied with on any of them."
              </blockquote>
              <p className="text-[17px] text-gray-500 mb-8 leading-relaxed">
                Jane is not alone. Aircraft owners across America are flying on faith — hoping their mechanic remembered, hoping the logbook is current, hoping nothing was missed. That's not safety. That's luck.
              </p>
              <div className="space-y-3">
                {[
                  { icon: Clock, label: "6+ hours/week", desc: "spent hunting down inspection records, calling mechanics, and chasing paperwork", color: "bg-red-50 border-red-100", iconBg: "bg-red-100 text-red-500" },
                  { icon: AlertTriangle, label: "ADs missed silently", desc: "no automated reminder system means critical airworthiness directives slip through unnoticed", color: "bg-amber-50 border-amber-100", iconBg: "bg-amber-100 text-amber-500" },
                  { icon: MessageSquare, label: "Zero real-time visibility", desc: "owners get an invoice — not a status update. They never know what's happening to their aircraft", color: "bg-orange-50 border-orange-100", iconBg: "bg-orange-100 text-orange-500" },
                  { icon: FileText, label: "Logbooks in binders & boxes", desc: "irreplaceable records stored in hangars and cardboard boxes — one fire from gone forever", color: "bg-rose-50 border-rose-100", iconBg: "bg-rose-100 text-rose-500" },
                ].map(p => (
                  <div key={p.label} className={`flex items-start gap-4 p-4 ${p.color} border rounded-2xl`}>
                    <div className={`w-9 h-9 rounded-xl ${p.iconBg} flex items-center justify-center shrink-0`}>
                      <p.icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[13px] text-[#0A1628] mb-0.5" style={{ fontWeight: 700 }}>{p.label}</div>
                      <div className="text-[12px] text-gray-500 leading-relaxed">{p.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </SlideIn>

            <SlideIn from="right" delay={0.15}>
              <div className="relative">
                <div className="rounded-3xl overflow-hidden shadow-2xl shadow-blue-100">
                  <ImageWithFallback src={IMG_OWNER} alt="Aircraft owner" className="w-full h-[480px] object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0A1628]/60 via-transparent to-transparent" />
                </div>
                <motion.div animate={{ y: [-4, 4, -4] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute top-6 -left-6 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl shadow-blue-100 border border-gray-100 p-4 max-w-[220px]">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    </div>
                    <span className="text-[12px] text-[#0A1628]" style={{ fontWeight: 700 }}>AD Due in 12 Days</span>
                  </div>
                  <div className="text-[11px] text-gray-500">N67890 — Alternator AD 2024-15-06. Mandatory compliance required.</div>
                </motion.div>
                <motion.div animate={{ y: [4, -4, 4] }} transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute -bottom-4 -right-4 bg-gradient-to-br from-[#2563EB] to-[#1d4ed8] rounded-2xl shadow-2xl shadow-blue-300 p-4 max-w-[200px]">
                  <div className="flex items-center gap-2 mb-1.5">
                    <BookOpen className="w-4 h-4 text-white" />
                    <span className="text-[12px] text-white" style={{ fontWeight: 700 }}>Logbook Secured</span>
                  </div>
                  <div className="text-[11px] text-blue-100">842 entries indexed, encrypted, and searchable forever.</div>
                </motion.div>
              </div>
            </SlideIn>
          </div>
        </div>
      </section>

      {/* ══════════════ EP 02: MECHANIC STORY ══════════════ */}
      <section className="py-28" style={{ background: "linear-gradient(180deg, #F0F7FF 0%, #EFF6FF 100%)" }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <SlideIn from="left" delay={0.1}>
              <div className="relative">
                <div className="rounded-3xl overflow-hidden shadow-2xl shadow-slate-200">
                  <ImageWithFallback src={IMG_MECHANIC} alt="A&P Mechanic" className="w-full h-[520px] object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#1E3A5F]/70 via-transparent to-transparent" />
                </div>
                <div className="absolute bottom-6 left-0 right-0 px-6">
                  <div className="bg-white/95 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-gray-100">
                    <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-2" style={{ fontWeight: 600 }}>The Old Way — Mechanic's Day</div>
                    <div className="flex gap-2 flex-wrap">
                      {["QuickBooks", "Word Docs", "Text Messages", "Paper Logbooks", "Email Chains", "Phone Calls", "Sticky Notes"].map(t => (
                        <span key={t} className="text-[9px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>{t}</span>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <ArrowRight className="w-3.5 h-3.5 text-[#2563EB]" />
                      <div className="text-[11px] text-[#2563EB]" style={{ fontWeight: 700 }}>7 disconnected tools → 1 unified platform</div>
                    </div>
                  </div>
                </div>
              </div>
            </SlideIn>

            <SlideIn from="right" delay={0.15}>
              <EpisodeBadge num="02" label="The Mechanic's Burden" />
              <blockquote className="text-[32px] text-[#0A1628] leading-[1.2] tracking-tight mb-6" style={{ fontWeight: 800 }}>
                "I'm an A&P with 20 years of experience. Half my day is paperwork nobody trained me for."
              </blockquote>
              <p className="text-[17px] text-gray-500 mb-8 leading-relaxed">
                Mechanics are craftsmen, not clerks. But aviation maintenance forces them to become billing specialists, document managers, and customer service reps — all with zero digital tools.
              </p>
              <div className="space-y-3">
                {[
                  { icon: Edit3, label: "Manual logbook entries", desc: "Retyping the same FAR 43.9 boilerplate by hand, every single time, risking errors and omissions" },
                  { icon: Search, label: "Parts hunted across 5 catalogs", desc: "Comparing prices on Aircraft Spruce, Chief Aircraft, and vendor websites just to find one part" },
                  { icon: RefreshCw, label: "Estimate → Invoice disconnect", desc: "Estimates in Word, invoices in QuickBooks, parts in a notebook — nothing talks to each other" },
                  { icon: Bell, label: "Owners kept in the dark", desc: "No system to notify owners of progress — so they call constantly, breaking the mechanic's focus" },
                ].map(p => (
                  <div key={p.label} className="flex items-start gap-4 p-4 bg-white border border-blue-100 rounded-2xl shadow-sm hover:shadow-md transition-all">
                    <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                      <p.icon className="w-4 h-4 text-[#2563EB]" />
                    </div>
                    <div>
                      <div className="text-[13px] text-[#0A1628] mb-0.5" style={{ fontWeight: 700 }}>{p.label}</div>
                      <div className="text-[12px] text-gray-500 leading-relaxed">{p.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </SlideIn>
          </div>
        </div>
      </section>

      {/* ══════════════ EP 03: THE GAP ══════════════ */}
      <section className="bg-white py-28">
        <div className="max-w-5xl mx-auto px-6">
          <FadeIn className="text-center mb-16">
            <EpisodeBadge num="03" label="The Communication Gap" />
            <h2 className="text-[44px] text-[#0A1628] leading-tight tracking-tight mb-4" style={{ fontWeight: 900 }}>
              The call that never comes.<br />
              <span className="text-red-500">The update that's always late.</span>
            </h2>
            <p className="text-[18px] text-gray-500 max-w-2xl mx-auto">
              Between squawk and logbook entry lies a black hole of missed communication — costing owners and mechanics thousands of dollars a year.
            </p>
          </FadeIn>

          <FadeIn delay={0.1}>
            <div className="relative">
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-[#2563EB] via-violet-400 to-emerald-400 -translate-x-1/2 hidden md:block" />
              <div className="space-y-8">
                {[
                  { side: "owner", icon: AlertTriangle, color: "bg-amber-100 text-amber-600", title: "Owner notices something wrong", desc: "Squawk reported: \"Alternator warning light intermittent on startup.\"", status: "REPORTED", statusColor: "bg-amber-100 text-amber-700" },
                  { side: "mechanic", icon: Wrench, color: "bg-blue-100 text-blue-600", title: "Mechanic receives squawk", desc: "Opens the job. Orders parts. Owner hears nothing for 5 days.", status: "IN PROGRESS", statusColor: "bg-blue-100 text-blue-700" },
                  { side: "owner", icon: PhoneCall, color: "bg-red-100 text-red-500", title: "Owner calls. Then calls again.", desc: "\"Is my plane done? What did you find? How much?\" Three calls. No callbacks.", status: "FRUSTRATED", statusColor: "bg-red-100 text-red-600", isCrisis: true },
                  { side: "mechanic", icon: FileText, color: "bg-violet-100 text-violet-600", title: "Estimate written in Word Doc", desc: "Emailed as PDF. Owner can't approve digitally. Prints it, signs it, mails it back.", status: "PAPER DELAY", statusColor: "bg-violet-100 text-violet-700", isCrisis: true },
                  { side: "owner", icon: BookOpen, color: "bg-gray-100 text-gray-500", title: "Logbook entry: handwritten", desc: "Entry complete but owner has no digital copy. The logbook sits in the hangar.", status: "DISCONNECTED", statusColor: "bg-gray-100 text-gray-600" },
                ].map((step, i) => (
                  <FadeIn key={i} delay={i * 0.08}>
                    <div className={`flex gap-6 items-start ${step.side === "mechanic" ? "md:flex-row-reverse" : ""}`}>
                      <div className={`hidden md:flex w-1/2 ${step.side === "mechanic" ? "justify-start pl-8" : "justify-end pr-8"}`}>
                        <div className={`max-w-[320px] ${step.isCrisis ? "bg-red-50 border-red-200" : "bg-white border-gray-200"} border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all`}>
                          <div className="flex items-center gap-2.5 mb-2">
                            <div className={`w-8 h-8 rounded-xl ${step.color} flex items-center justify-center shrink-0`}>
                              <step.icon className="w-4 h-4" />
                            </div>
                            <div className="text-[11px] text-gray-400 uppercase tracking-wide" style={{ fontWeight: 600 }}>{step.side === "owner" ? "✈️ Aircraft Owner" : "🔧 A&P Mechanic"}</div>
                          </div>
                          <div className="text-[13px] text-[#0A1628] mb-1" style={{ fontWeight: 700 }}>{step.title}</div>
                          <div className="text-[12px] text-gray-500 leading-relaxed">{step.desc}</div>
                          <span className={`inline-block mt-2 text-[9px] px-2 py-0.5 rounded-full ${step.statusColor}`} style={{ fontWeight: 700 }}>{step.status}</span>
                        </div>
                      </div>
                      <div className="md:hidden w-full border border-gray-200 rounded-2xl p-4 bg-white shadow-sm">
                        <div className="text-[12px] text-[#0A1628]" style={{ fontWeight: 700 }}>{step.title}</div>
                        <div className="text-[11px] text-gray-500 mt-0.5">{step.desc}</div>
                      </div>
                      <div className="hidden md:flex w-5 h-5 rounded-full bg-gradient-to-br from-[#2563EB] to-[#1d4ed8] border-4 border-white shadow-lg shrink-0 mt-4 -ml-2.5 -mr-2.5 relative z-10" />
                      <div className="hidden md:block w-1/2" />
                    </div>
                  </FadeIn>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ══════════════ THE SOLUTION — LIGHT & BRIGHT ══════════════ */}
      <section className="py-24 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #EFF6FF 0%, #dbeafe 50%, #c7d2fe 100%)" }}>
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(rgba(37,99,235,1) 1.5px, transparent 1.5px)", backgroundSize: "40px 40px" }} />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[300px] opacity-60 pointer-events-none"
          style={{ background: "radial-gradient(ellipse, rgba(37,99,235,0.15) 0%, transparent 70%)" }} />

        <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
          <FadeIn>
            <div className="inline-flex items-center gap-2 bg-white/80 backdrop-blur-sm border border-[#2563EB]/25 rounded-full px-4 py-1.5 mb-6 shadow-lg shadow-blue-100">
              <Sparkles className="w-3.5 h-3.5 text-[#2563EB]" />
              <span className="text-[12px] text-[#2563EB]" style={{ fontWeight: 600 }}>The Answer to All of It</span>
            </div>
            <h2 className="text-[52px] text-[#0A1628] leading-[1.05] tracking-tight mb-6" style={{ fontWeight: 900 }}>
              We rewrote the story.<br /><span className="text-[#2563EB]">Meet myaircraft.us.</span>
            </h2>
            <p className="text-[18px] text-gray-500 max-w-2xl mx-auto mb-12 leading-relaxed">
              One intelligent platform connecting aircraft owners and A&P mechanics in real time — with AI-powered records, automated workflows, and instant communication baked in from day one.
            </p>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { icon: Brain, title: "AI-Powered Intelligence", desc: "Google Document AI + Claude + ChatGPT make every logbook page searchable and every question answerable.", color: "from-[#2563EB] to-[#1d4ed8]", glow: "shadow-blue-200" },
                { icon: RefreshCw, title: "Real-Time Sync", desc: "Owners see every update as it happens. Mechanics send estimates, approvals, and logbook entries in one click.", color: "from-violet-500 to-violet-700", glow: "shadow-violet-200" },
                { icon: Shield, title: "Compliance Guardian", desc: "ADs tracked automatically. Inspection deadlines surfaced proactively. Airworthiness monitored 24/7.", color: "from-emerald-500 to-emerald-700", glow: "shadow-emerald-200" },
              ].map((f, i) => (
                <FadeIn key={f.title} delay={i * 0.1}>
                  <div className="bg-white/80 backdrop-blur-sm border border-white rounded-3xl p-6 text-left hover:shadow-2xl hover:shadow-blue-100 transition-all group shadow-lg">
                    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 shadow-lg ${f.glow} group-hover:scale-110 transition-transform`}>
                      <f.icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-[15px] text-[#0A1628] mb-2" style={{ fontWeight: 700 }}>{f.title}</h3>
                    <p className="text-[13px] text-gray-500 leading-relaxed">{f.desc}</p>
                  </div>
                </FadeIn>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ══════════════ OWNER DEEP DIVE ══════════════ */}
      <section className="bg-white py-28" id="features">
        <div className="max-w-7xl mx-auto px-6">
          <FadeIn className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-[#EFF6FF] border border-[#2563EB]/20 rounded-full px-4 py-1.5 mb-4">
              <Plane className="w-3.5 h-3.5 text-[#2563EB]" />
              <span className="text-[12px] text-[#2563EB]" style={{ fontWeight: 600 }}>For Aircraft Owners</span>
            </div>
            <h2 className="text-[44px] text-[#0A1628] leading-tight tracking-tight mb-4" style={{ fontWeight: 900 }}>
              Your entire fleet.<br />One intelligent command center.
            </h2>
            <p className="text-[18px] text-gray-500 max-w-2xl mx-auto">
              From real-time AD alerts to one-click estimate approvals, you finally have the visibility and control your aircraft deserves.
            </p>
          </FadeIn>

          <div className="grid lg:grid-cols-2 gap-16 items-start">
            <SlideIn from="left">
              <div className="space-y-4">
                {[
                  { icon: Cpu, color: "bg-blue-50 text-[#2563EB] border-blue-100", title: "AI Command Center", desc: "Type plain English: \"Ground N67890 until the alternator is fixed.\" The AI handles the rest — creating work orders, notifying mechanics, and updating records automatically." },
                  { icon: MessageSquare, color: "bg-violet-50 text-violet-600 border-violet-100", title: "Ask Your Aircraft Anything", desc: "\"When was the last mag timing check on N12345?\" — get a cited answer from the actual logbook page. Every entry indexed with Google Document AI + OpenAI embeddings." },
                  { icon: FileText, color: "bg-emerald-50 text-emerald-600 border-emerald-100", title: "Documents — Secured & Searchable", desc: "Upload or mail us your physical logbooks. We scan, OCR, classify, and index every page. Logbooks, ADs, STCs, 337 forms — organized automatically, encrypted, backed up." },
                  { icon: Store, color: "bg-amber-50 text-amber-600 border-amber-100", title: "Marketplace & Parts Visibility", desc: "See exactly what parts your mechanic is ordering and at what price. 2.1M+ parts indexed with full 8130-3 airworthiness traceability." },
                  { icon: Bell, color: "bg-red-50 text-red-500 border-red-100", title: "Proactive Compliance Alerts", desc: "Never miss an AD again. Our compliance engine tracks every airworthiness directive against your make, model, and serial — sending alerts weeks before deadlines." },
                ].map((f, i) => (
                  <FadeIn key={f.title} delay={i * 0.06}>
                    <div className={`flex gap-4 p-5 border ${f.color.split(" ")[2]} rounded-2xl hover:shadow-md transition-all bg-white group`}>
                      <div className={`w-10 h-10 rounded-xl ${f.color.split(" ")[0]} ${f.color.split(" ")[1]} border ${f.color.split(" ")[2]} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                        <f.icon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-[14px] text-[#0A1628] mb-1" style={{ fontWeight: 700 }}>{f.title}</div>
                        <div className="text-[12px] text-gray-500 leading-relaxed">{f.desc}</div>
                      </div>
                    </div>
                  </FadeIn>
                ))}
              </div>
            </SlideIn>

            <SlideIn from="right" delay={0.2}>
              <motion.div animate={{ y: [-8, 8, -8] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}>
                <div style={{ perspective: "1400px" }}>
                  <div style={{ transform: "rotateX(4deg) rotateY(10deg) rotateZ(-1deg)", transformOrigin: "center center" }}>
                    <OwnerDashboardMock />
                  </div>
                </div>
              </motion.div>
              <div className="mt-6 grid grid-cols-3 gap-3">
                {[
                  { label: "Avg Owner Time Saved", val: "6.2 hrs/wk", color: "from-blue-50 to-[#EFF6FF] text-[#2563EB] border-[#2563EB]/20" },
                  { label: "AD Compliance Rate", val: "99.97%", color: "from-emerald-50 to-teal-50 text-emerald-700 border-emerald-200" },
                  { label: "Query Accuracy", val: "98.4%", color: "from-violet-50 to-purple-50 text-violet-700 border-violet-200" },
                ].map(s => (
                  <div key={s.label} className={`rounded-2xl p-3 text-center bg-gradient-to-br ${s.color} border`}>
                    <div className="text-[18px] tracking-tight" style={{ fontWeight: 800 }}>{s.val}</div>
                    <div className="text-[9px] uppercase tracking-wide mt-0.5" style={{ fontWeight: 600 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </SlideIn>
          </div>
        </div>
      </section>

      {/* ══════════════ MECHANIC DEEP DIVE ══════════════ */}
      <section className="py-28" style={{ background: "linear-gradient(180deg, #F0F7FF 0%, #F8FBFF 100%)" }}>
        <div className="max-w-7xl mx-auto px-6">
          <FadeIn className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-white border border-[#1E3A5F]/20 rounded-full px-4 py-1.5 mb-4 shadow-sm">
              <Wrench className="w-3.5 h-3.5 text-[#1E3A5F]" />
              <span className="text-[12px] text-[#1E3A5F]" style={{ fontWeight: 600 }}>For A&P Mechanics</span>
            </div>
            <h2 className="text-[44px] text-[#0A1628] leading-tight tracking-tight mb-4" style={{ fontWeight: 900 }}>
              Your AI-powered workspace.<br />Maintenance, reimagined.
            </h2>
            <p className="text-[18px] text-gray-500 max-w-2xl mx-auto">
              From squawk to signed logbook entry — everything flows through one intelligent portal that works as hard as you do.
            </p>
          </FadeIn>

          <div className="grid lg:grid-cols-2 gap-16 items-start">
            <SlideIn from="left" delay={0.1}>
              <motion.div animate={{ y: [8, -8, 8] }} transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut" }}>
                <div style={{ perspective: "1400px" }}>
                  <div style={{ transform: "rotateX(4deg) rotateY(-10deg) rotateZ(1deg)", transformOrigin: "center center" }}>
                    <MechanicPortalMock />
                  </div>
                </div>
              </motion.div>
              <div className="mt-6 grid grid-cols-3 gap-3">
                {[
                  { label: "Logbook Entry Time", val: "45 sec", color: "from-blue-50 to-[#EFF6FF] text-[#2563EB] border-[#2563EB]/20" },
                  { label: "Invoice-to-Payment", val: "2.1 days", color: "from-emerald-50 to-teal-50 text-emerald-700 border-emerald-200" },
                  { label: "Parts Search Accuracy", val: "97.8%", color: "from-violet-50 to-purple-50 text-violet-700 border-violet-200" },
                ].map(s => (
                  <div key={s.label} className={`rounded-2xl p-3 text-center bg-gradient-to-br ${s.color} border`}>
                    <div className="text-[18px] tracking-tight" style={{ fontWeight: 800 }}>{s.val}</div>
                    <div className="text-[9px] uppercase tracking-wide mt-0.5" style={{ fontWeight: 600 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </SlideIn>

            <SlideIn from="right" delay={0.15}>
              <div className="space-y-4">
                {[
                  { icon: Sparkles, color: "bg-blue-50 text-[#2563EB] border-blue-100", title: "AI Logbook Entry Generator", desc: "Describe the work in plain English — or just check boxes. Our AI drafts a FAR 43.9-compliant logbook entry instantly, ready for your e-signature. 20 minutes → 45 seconds." },
                  { icon: Clipboard, color: "bg-emerald-50 text-emerald-600 border-emerald-100", title: "Work Order Lifecycle", desc: "Squawk → Estimate → Owner Approval → Work Order → Invoice → Logbook. Every step tracked, every transition automated, every stakeholder notified. No gaps." },
                  { icon: Package, color: "bg-amber-50 text-amber-600 border-amber-100", title: "Integrated Parts Marketplace", desc: "Search 2.1M+ aviation parts by P/N, description, or application. Compare vendor pricing. Add to work order with one click. Full 8130-3 traceability included." },
                  { icon: Receipt, color: "bg-violet-50 text-violet-600 border-violet-100", title: "Professional Invoicing & eSign", desc: "Generate polished invoices automatically from your work order. Owners approve and e-sign from their portal. Integrate with QuickBooks or Stripe for instant payment." },
                  { icon: UserCheck, color: "bg-cyan-50 text-cyan-600 border-cyan-100", title: "Owner Always Informed", desc: "Your customers get a private portal with every update, document, and invoice in real time. No more \"Where's my plane?\" calls. The loop is closed automatically." },
                ].map((f, i) => (
                  <FadeIn key={f.title} delay={i * 0.06}>
                    <div className={`flex gap-4 p-5 border ${f.color.split(" ")[2]} rounded-2xl hover:shadow-md transition-all bg-white group shadow-sm`}>
                      <div className={`w-10 h-10 rounded-xl ${f.color.split(" ")[0]} ${f.color.split(" ")[1]} border ${f.color.split(" ")[2]} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                        <f.icon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-[14px] text-[#0A1628] mb-1" style={{ fontWeight: 700 }}>{f.title}</div>
                        <div className="text-[12px] text-gray-500 leading-relaxed">{f.desc}</div>
                      </div>
                    </div>
                  </FadeIn>
                ))}
              </div>
            </SlideIn>
          </div>
        </div>
      </section>

      {/* ══════════════ LOGBOOK AI ══════════════ */}
      <section className="bg-white py-28 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <FadeIn>
              <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1 mb-5">
                <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-[12px] text-emerald-700" style={{ fontWeight: 600 }}>The Logbook Intelligence Engine</span>
              </div>
              <h2 className="text-[40px] text-[#0A1628] tracking-tight mb-4" style={{ fontWeight: 900 }}>
                Your logbook is worth<br />more than your airframe.<br />
                <span className="text-emerald-600">Treat it that way.</span>
              </h2>
              <p className="text-[16px] text-gray-500 mb-8 leading-relaxed">
                A logbook without an aircraft is worthless. An aircraft without a logbook can lose 40–60% of its value overnight. We digitize, index, secure, and make every entry queryable — so that record is preserved forever.
              </p>
              <div className="space-y-4">
                {[
                  { q: "\"When was the last prop overhaul on N24680?\"", a: "Feb 14, 2024 — Page 47, Entry 203. Sensenich 76EM8S5-0-62 overhauled at 1,840.2 hrs TT by Mike R. (IA 3847512)." },
                  { q: "\"List every AD complied with in the last 2 years\"", a: "8 AD entries found, Apr 2024–Apr 2026: AD 2023-17-01, 2024-15-06, 2024-22-09... Full list exported." },
                  { q: "\"Is N12345 eligible for the next 100-hour?\"", a: "Yes. Last 100-hr: Jan 8, 2026 at 1,197.3 hrs. Current: 1,204.3 hrs. Due at 1,297.3 hrs — 93 hours remaining." },
                ].map(ex => (
                  <div key={ex.q} className="bg-gradient-to-r from-[#EFF6FF] to-white border border-[#2563EB]/15 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all">
                    <div className="flex items-start gap-2 mb-2.5">
                      <div className="w-5 h-5 rounded-md bg-[#2563EB] flex items-center justify-center shrink-0 mt-0.5">
                        <MessageSquare className="w-3 h-3 text-white" />
                      </div>
                      <div className="text-[13px] text-[#2563EB]" style={{ fontWeight: 500 }}>{ex.q}</div>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-md bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                        <Sparkles className="w-3 h-3 text-emerald-600" />
                      </div>
                      <div className="text-[12px] text-gray-600 leading-relaxed">{ex.a}</div>
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>

            <FadeIn delay={0.15}>
              <div className="relative rounded-3xl overflow-hidden shadow-2xl shadow-emerald-100">
                <ImageWithFallback src={IMG_LOGBOOK} alt="Logbook scanning" className="w-full h-[400px] object-cover" />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent to-emerald-900/20" />
                <div className="absolute bottom-6 left-6 right-6">
                  <div className="bg-white/95 backdrop-blur-md border border-gray-100 rounded-2xl p-4 shadow-2xl">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[11px] text-emerald-700" style={{ fontWeight: 600 }}>Google Document AI — Processing</span>
                    </div>
                    <div className="space-y-1.5">
                      {["OCR — 847 characters extracted", "Aircraft: N12345 — matched", "Entry: 100-Hour Inspection", "Date: Feb 8, 2026 — parsed", "IA Cert #3847512 — verified", "AD 2024-15-06 — marked compliant", "Embedding generated — indexed"].map((l, i) => (
                        <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.4, repeat: Infinity, repeatDelay: 4 }}
                          className="flex items-center gap-2 text-[11px] text-gray-500">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                          {l}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-5 bg-gradient-to-r from-[#EFF6FF] to-[#dbeafe] border border-[#2563EB]/20 rounded-2xl p-5 flex items-start gap-3 shadow-md">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#1d4ed8] flex items-center justify-center shrink-0 shadow-lg shadow-blue-200">
                  <Lock className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="text-[13px] text-[#0A1628] mb-1" style={{ fontWeight: 700 }}>Bank-Level Security & Redundancy</div>
                  <div className="text-[12px] text-gray-500 leading-relaxed">AES-256 encryption at rest. SOC 2 compliant infrastructure. Triple-redundant backups. Your logbook survives fires, floods, and hangar disasters.</div>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ══════════════ WORKFLOW PIPELINE ══════════════ */}
      <section className="py-24" style={{ background: "linear-gradient(180deg, #EFF6FF 0%, white 100%)" }}>
        <div className="max-w-6xl mx-auto px-6">
          <FadeIn className="text-center mb-14">
            <h2 className="text-[40px] text-[#0A1628] tracking-tight mb-3" style={{ fontWeight: 900 }}>
              From squawk to logbook entry.<br /><span className="text-[#2563EB]">One seamless flow.</span>
            </h2>
            <p className="text-[16px] text-gray-500 max-w-xl mx-auto">Every step connected, every stakeholder notified, zero paperwork lost.</p>
          </FadeIn>
          <FadeIn delay={0.1}>
            <div className="relative">
              <div className="absolute top-9 left-[8%] right-[8%] h-0.5 bg-gradient-to-r from-[#2563EB] via-violet-500 to-emerald-500 hidden md:block opacity-30" />
              <div className="grid grid-cols-2 md:grid-cols-6 gap-5">
                {[
                  { icon: AlertTriangle, label: "Squawk Filed", sub: "Owner reports", color: "from-amber-50 to-orange-50 border-amber-200", iconBg: "bg-amber-100 text-amber-600", glow: "shadow-amber-100" },
                  { icon: FileText, label: "Estimate Built", sub: "AI-assisted pricing", color: "from-blue-50 to-[#EFF6FF] border-blue-200", iconBg: "bg-blue-100 text-[#2563EB]", glow: "shadow-blue-100" },
                  { icon: CheckCircle, label: "Owner Approves", sub: "1-tap via portal", color: "from-emerald-50 to-teal-50 border-emerald-200", iconBg: "bg-emerald-100 text-emerald-600", glow: "shadow-emerald-100" },
                  { icon: Wrench, label: "Work Order", sub: "Mechanic executes", color: "from-violet-50 to-purple-50 border-violet-200", iconBg: "bg-violet-100 text-violet-600", glow: "shadow-violet-100" },
                  { icon: Receipt, label: "Invoice Sent", sub: "eSign & payment", color: "from-pink-50 to-rose-50 border-pink-200", iconBg: "bg-pink-100 text-pink-600", glow: "shadow-pink-100" },
                  { icon: BookOpen, label: "Logbook Entry", sub: "AI-drafted, signed", color: "from-teal-50 to-cyan-50 border-teal-200", iconBg: "bg-teal-100 text-teal-600", glow: "shadow-teal-100" },
                ].map((step, i) => (
                  <FadeIn key={step.label} delay={i * 0.08}>
                    <div className="flex flex-col items-center text-center">
                      <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${step.color} border flex items-center justify-center mb-3 shadow-lg ${step.glow} relative z-10 hover:scale-110 transition-transform cursor-default`}>
                        <div className={`w-9 h-9 rounded-xl ${step.iconBg} flex items-center justify-center`}>
                          <step.icon className="w-5 h-5" />
                        </div>
                      </div>
                      <div className="text-[12px] text-[#0A1628]" style={{ fontWeight: 700 }}>{step.label}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{step.sub}</div>
                    </div>
                  </FadeIn>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ══════════════ TESTIMONIALS ══════════════ */}
      <section className="py-24" style={{ background: "linear-gradient(180deg, #F8FBFF 0%, white 100%)" }}>
        <div className="max-w-6xl mx-auto px-6">
          <FadeIn className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-full px-4 py-1.5 mb-4">
              <Star className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[12px] text-amber-700" style={{ fontWeight: 600 }}>Heard on the Ramp</span>
            </div>
            <h2 className="text-[38px] text-[#0A1628] tracking-tight" style={{ fontWeight: 900 }}>
              Real stories. Real aircraft. Real relief.
            </h2>
          </FadeIn>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                quote: "I spent six years losing sleep over whether my logbooks were compliant. The first week on myaircraft.us, I found two AD compliance gaps I didn't know existed. It potentially saved my certificate.",
                name: "Tom H.", role: "ATP · Fleet Owner of 8 Aircraft", stars: 5, abbr: "TH", color: "from-blue-50 to-[#EFF6FF]"
              },
              {
                quote: "The AI logbook entry generator alone is worth the subscription. What used to take me 20 minutes takes 45 seconds now. I've got my evenings back. My shop turned around 3 more jobs last month.",
                name: "Mike R.", role: "A&P / IA · 18 Years Experience", stars: 5, abbr: "MR", color: "from-emerald-50 to-teal-50"
              },
              {
                quote: "My owners used to call 3-4 times a day asking for updates. Since switching to myaircraft.us, those calls dropped to almost zero. They see everything in the portal. It's changed every customer relationship.",
                name: "Sarah W.", role: "Charter Ops Manager · 22 Aircraft Fleet", stars: 5, abbr: "SW", color: "from-violet-50 to-purple-50"
              },
            ].map((t, i) => (
              <FadeIn key={i} delay={i * 0.1}>
                <div className={`bg-gradient-to-br ${t.color} border border-white rounded-3xl p-7 hover:shadow-xl transition-all group shadow-md`}>
                  <div className="flex gap-0.5 mb-4">
                    {Array.from({ length: t.stars }).map((_, si) => (
                      <Star key={si} className="w-4 h-4 text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                  <blockquote className="text-[14px] text-gray-600 leading-relaxed mb-6 italic">"{t.quote}"</blockquote>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#2563EB] to-[#1d4ed8] flex items-center justify-center text-white text-[13px] shadow-md" style={{ fontWeight: 700 }}>{t.abbr}</div>
                    <div>
                      <div className="text-[13px] text-[#0A1628]" style={{ fontWeight: 700 }}>{t.name}</div>
                      <div className="text-[11px] text-gray-400">{t.role}</div>
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════ PRICING ══════════════ */}
      <section className="py-28 bg-white border-t border-gray-100">
        <div className="max-w-5xl mx-auto px-6">
          <FadeIn className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-[#EFF6FF] border border-[#2563EB]/20 rounded-full px-4 py-1.5 mb-5">
              <DollarSign className="w-3.5 h-3.5 text-[#2563EB]" />
              <span className="text-[12px] text-[#2563EB]" style={{ fontWeight: 600 }}>Radically Simple Pricing</span>
            </div>
            <h2 className="text-[48px] text-[#0A1628] tracking-tight mb-4" style={{ fontWeight: 900 }}>
              One flat price.<br /><span className="text-[#2563EB]">No hidden fees. No surprises.</span>
            </h2>
            <p className="text-[17px] text-gray-500 max-w-xl mx-auto">
              We believe in pricing that makes sense. Pay per aircraft or per mechanic — unlimited users always included.
            </p>
          </FadeIn>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Owner Plan */}
            <FadeIn delay={0.1}>
              <div className="relative bg-gradient-to-br from-[#EFF6FF] via-white to-[#dbeafe] border-2 border-[#2563EB]/30 rounded-3xl p-8 shadow-2xl shadow-blue-100 hover:shadow-blue-200 transition-all group overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-20 pointer-events-none"
                  style={{ background: "radial-gradient(circle, #2563EB 0%, transparent 70%)", transform: "translate(30%, -30%)" }} />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#1d4ed8] flex items-center justify-center shadow-lg shadow-blue-300">
                      <Plane className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <div className="text-[12px] text-[#2563EB] uppercase tracking-widest" style={{ fontWeight: 700 }}>For Aircraft Owners</div>
                      <div className="text-[20px] text-[#0A1628]" style={{ fontWeight: 900 }}>Aircraft Plan</div>
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-[64px] text-[#0A1628]" style={{ fontWeight: 900, lineHeight: 1 }}>$99</span>
                    <div>
                      <div className="text-[15px] text-[#2563EB]" style={{ fontWeight: 700 }}>/ aircraft</div>
                      <div className="text-[12px] text-gray-400">per month</div>
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] px-3 py-1 rounded-full mb-2" style={{ fontWeight: 700 }}>
                    Save 20% — $79/mo billed annually
                  </div>
                  <div className="inline-flex items-center gap-2 bg-[#2563EB] text-white text-[11px] px-3 py-1 rounded-full mb-6 shadow-md" style={{ fontWeight: 700 }}>
                    <InfinityIcon className="w-3.5 h-3.5" /> Unlimited Users Included
                  </div>
                  <div className="space-y-3 mb-8">
                    {[
                      "Unlimited document uploads",
                      "AI-powered search & ask",
                      "AD compliance tracking & alerts",
                      "AI Command Center access",
                      "Real-time mechanic updates",
                      "Owner portal for estimate approvals",
                      "Logbook digitization & indexing",
                      "Invite unlimited team members",
                    ].map(f => (
                      <div key={f} className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-[#2563EB] flex items-center justify-center shrink-0">
                          <CheckCircle className="w-3 h-3 text-white" />
                        </div>
                        <span className="text-[13px] text-gray-600">{f}</span>
                      </div>
                    ))}
                  </div>
                  <Link href="/signup" className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#2563EB] to-[#1d4ed8] text-white py-4 rounded-2xl hover:shadow-xl hover:shadow-blue-300/40 transition-all text-[15px] shadow-lg" style={{ fontWeight: 700 }}>
                    Start Free 14-Day Trial <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </FadeIn>

            {/* Mechanic Plan */}
            <FadeIn delay={0.2}>
              <div className="relative bg-gradient-to-br from-[#F0F4FF] via-white to-[#e0e7ff] border-2 border-[#1E3A5F]/20 rounded-3xl p-8 shadow-xl hover:shadow-2xl transition-all group overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-15 pointer-events-none"
                  style={{ background: "radial-gradient(circle, #1E3A5F 0%, transparent 70%)", transform: "translate(30%, -30%)" }} />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#1E3A5F] to-[#0A1628] flex items-center justify-center shadow-lg shadow-slate-300">
                      <Wrench className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <div className="text-[12px] text-[#1E3A5F] uppercase tracking-widest" style={{ fontWeight: 700 }}>For A&P Mechanics</div>
                      <div className="text-[20px] text-[#0A1628]" style={{ fontWeight: 900 }}>Mechanic Plan</div>
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-[64px] text-[#0A1628]" style={{ fontWeight: 900, lineHeight: 1 }}>$99</span>
                    <div>
                      <div className="text-[15px] text-[#1E3A5F]" style={{ fontWeight: 700 }}>/ mechanic</div>
                      <div className="text-[12px] text-gray-400">per month</div>
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] px-3 py-1 rounded-full mb-2" style={{ fontWeight: 700 }}>
                    Save 20% — $79/mo billed annually
                  </div>
                  <div className="inline-flex items-center gap-2 bg-[#1E3A5F] text-white text-[11px] px-3 py-1 rounded-full mb-6 shadow-md" style={{ fontWeight: 700 }}>
                    <InfinityIcon className="w-3.5 h-3.5" /> Unlimited Customers & Aircraft
                  </div>
                  <div className="space-y-3 mb-8">
                    {[
                      "Full Mechanic Portal access",
                      "AI logbook entry generator",
                      "Work order lifecycle management",
                      "Integrated parts marketplace",
                      "Professional invoicing & eSign",
                      "Customer notification portal",
                      "Estimate → approval workflows",
                      "Unlimited customer aircraft",
                    ].map(f => (
                      <div key={f} className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-[#1E3A5F] flex items-center justify-center shrink-0">
                          <CheckCircle className="w-3 h-3 text-white" />
                        </div>
                        <span className="text-[13px] text-gray-600">{f}</span>
                      </div>
                    ))}
                  </div>
                  <Link href="/signup" className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#1E3A5F] to-[#0A1628] text-white py-4 rounded-2xl hover:shadow-xl hover:shadow-slate-300/40 transition-all text-[15px] shadow-lg" style={{ fontWeight: 700 }}>
                    Start Free 14-Day Trial <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </FadeIn>
          </div>

          {/* Bottom trust */}
          <FadeIn delay={0.3} className="text-center mt-10">
            <div className="flex flex-wrap items-center justify-center gap-6">
              {["14-day free trial", "No credit card required", "Cancel anytime", "On-site scanning — FREE"].map((t) => (
                <div key={t} className="flex items-center gap-2 text-[13px] text-gray-500">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  {t}
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ══════════════ SCANNING CTA ══════════════ */}
      <section className="py-20 bg-gradient-to-br from-[#0A1628] via-[#0d1f3c] to-[#1E3A5F]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <FadeIn>
              <div className="inline-flex items-center gap-2 bg-emerald-500/20 border border-emerald-400/30 rounded-full px-4 py-1.5 mb-5">
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300 text-[11px]" style={{ fontWeight: 700, letterSpacing: "0.06em" }}>ON-SITE · FREE · $100K INSURED</span>
              </div>
              <h2 className="text-[38px] text-white tracking-tight mb-4" style={{ fontWeight: 800, lineHeight: 1.1 }}>
                Professional scanning.<br />
                <span className="text-emerald-400">No charge. Ever.</span>
              </h2>
              <p className="text-white/55 text-[15px] leading-relaxed mb-6">
                Our aviation records team travels to your hangar or FBO and professionally digitizes your complete logbook set on-site — while your aircraft stays right where it belongs. No shipping. No risk. Covered by $100,000 in liability insurance from the moment we arrive.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-7">
                {[
                  { label: "On-Site Service", sub: "We come to you" },
                  { label: "$0 Cost", sub: "Completely free" },
                  { label: "$100K Insurance", sub: "Full coverage" },
                  { label: "24h Delivery", sub: "Records live fast" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2.5 bg-white/5 rounded-xl p-3 border border-white/10">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <div className="text-white text-[12px]" style={{ fontWeight: 700 }}>{item.label}</div>
                      <div className="text-white/40 text-[10px]">{item.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
              <Link
                href="/scanning"
                className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white px-7 py-3.5 rounded-xl text-[15px] transition-colors shadow-lg shadow-emerald-900/30"
                style={{ fontWeight: 700 }}
              >
                Learn About Scanning <ArrowRight className="w-4 h-4" />
              </Link>
            </FadeIn>
            <FadeIn delay={0.15}>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-2">
                <div className="text-white/40 text-[11px] uppercase tracking-widest mb-4" style={{ fontWeight: 600 }}>What Happens During a Scan Session</div>
                {[
                  { step: "01", title: "We arrive at your hangar or FBO", desc: "Bonded, insured aviation records specialists with professional equipment." },
                  { step: "02", title: "We scan every page at 600 DPI", desc: "Airframe logbook, engine log(s), prop records, ADs, STCs, 337s — everything." },
                  { step: "03", title: "AI classifies every document", desc: "Aviation-specific OCR + AI categorizes, indexes, and cross-references all records." },
                  { step: "04", title: "Records live in your account in 24h", desc: "Fully searchable, AI-queryable, encrypted — delivered to your myaircraft.us dashboard." },
                ].map((item) => (
                  <div key={item.step} className="flex items-start gap-3 p-3 bg-white/5 rounded-xl border border-white/8">
                    <div className="w-8 h-8 rounded-lg bg-[#2563EB]/20 border border-[#2563EB]/30 flex items-center justify-center shrink-0">
                      <span className="text-[10px] text-[#2563EB]" style={{ fontWeight: 800 }}>{item.step}</span>
                    </div>
                    <div>
                      <div className="text-white text-[12px]" style={{ fontWeight: 700 }}>{item.title}</div>
                      <div className="text-white/40 text-[11px] leading-relaxed">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ══════════════ FINAL CTA ══════════════ */}
      <section className="py-32 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #1d4ed8 0%, #2563EB 40%, #1E3A5F 100%)" }}>
        {/* Decorative dots */}
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.8) 1px, transparent 1px)", backgroundSize: "36px 36px" }} />
        {/* Glowing sphere */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] pointer-events-none"
          style={{ background: "radial-gradient(ellipse, rgba(255,255,255,0.12) 0%, transparent 60%)" }} />
        <motion.div animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.5, 0.3] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-10 right-20 w-64 h-64 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%)" }} />
        <motion.div animate={{ scale: [1, 1.08, 1], opacity: [0.2, 0.4, 0.2] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-10 left-20 w-48 h-48 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%)" }} />

        {/* Waveform */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 opacity-30">
          <Waveform bars={40} color="rgba(255,255,255,0.8)" maxH={40} />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <FadeIn>
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm border border-white/25 rounded-full px-4 py-1.5 mb-6">
              <Mic className="w-3.5 h-3.5 text-white" />
              <span className="text-[12px] text-white" style={{ fontWeight: 600 }}>Final Episode — Your Story Starts Now</span>
            </div>
            <h2 className="text-[52px] text-white tracking-tight mb-5" style={{ fontWeight: 900 }}>
              Your aircraft records deserve<br />better than a filing cabinet.
            </h2>
            <p className="text-[19px] text-blue-100 mb-10 max-w-xl mx-auto leading-relaxed">
              Join thousands of owners and mechanics who've moved their records, workflows, and intelligence to myaircraft.us — and never looked back.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 mb-10">
              <Link href="/signup" className="inline-flex items-center gap-2 bg-white text-[#2563EB] px-9 py-4 rounded-2xl hover:bg-blue-50 transition-all shadow-2xl shadow-blue-900/30 text-[16px]" style={{ fontWeight: 700 }}>
                Start Free — No Credit Card <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/pricing" className="inline-flex items-center gap-2 border-2 border-white/35 text-white px-9 py-4 rounded-2xl hover:bg-white/10 transition-all text-[15px]" style={{ fontWeight: 600 }}>
                View Pricing
              </Link>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6 text-[13px] text-blue-100">
              {["$99/aircraft/mo · $79 annual", "$99/mechanic/mo · $79 annual", "14-day free trial", "Cancel anytime"].map((t) => (
                <div key={t} className="flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-300" />
                  {t}
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>
    </div>
  );
}
