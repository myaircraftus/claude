"use client";

import React from "react";
import { OWNER_TUTORIALS } from "./tutorialData";
import { MECHANIC_TUTORIALS } from "./mechanicTutorialData";
import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X, Search, ChevronRight, ChevronLeft, Clock, BookOpen,
  Play, Pause, RefreshCw, CheckCircle, Star, ArrowLeft,
  User, HardHat, Tag, Lightbulb, Hash,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════════════ */
export interface SimFrame {
  label: string;
  content: React.ReactNode;
}

export interface TutorialStep {
  title: string;
  content: string;
  tip?: string;
}

export interface Tutorial {
  id: string;
  title: string;
  category: string;
  persona: "owner" | "mechanic";
  duration: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  pinned?: boolean;
  tags: string[];
  description: string;
  sim: SimFrame[];
  steps: TutorialStep[];
  related?: string[];
}

/* ═══════════════════════════════════════════════════════════════
   SIMULATION PLAYER  (enlarged canvas h-80)
═══════════════════════════════════════════════════════════════ */
function SimPlayer({ sim }: { sim: SimFrame[] }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => { setStep(0); setPlaying(true); }, [sim]);

  useEffect(() => {
    if (!playing || sim.length <= 1) return;
    const t = setInterval(() => setStep(s => (s + 1) % sim.length), 3200);
    return () => clearInterval(t);
  }, [playing, sim.length]);

  const restart = () => { setStep(0); setPlaying(true); };

  return (
    <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-[#0c1e3d]">
      {/* Browser chrome */}
      <div className="h-9 bg-[#060e1f] flex items-center gap-2 px-4 border-b border-white/10 shrink-0">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/70" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
          <div className="w-3 h-3 rounded-full bg-green-500/70" />
        </div>
        <div className="flex-1 mx-3 h-5 bg-white/5 rounded-full text-[9px] text-white/30 flex items-center px-3">
          myaircraft.us/app
        </div>
        <div className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center">
          <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
        </div>
      </div>

      {/* Simulation canvas — enlarged to h-80 */}
      <div className="h-80 bg-[#f8fafc] relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 22 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -22 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0"
          >
            {sim[step]?.content}
          </motion.div>
        </AnimatePresence>

        {/* Step overlay label */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-4 py-3 pointer-events-none">
          <span className="text-[11px] text-white/95 leading-snug" style={{ fontWeight: 500 }}>
            {sim[step]?.label}
          </span>
        </div>
      </div>

      {/* Controls bar */}
      <div className="h-11 bg-[#060e1f] flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStep(s => (s - 1 + sim.length) % sim.length)}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-white" />
          </button>
          <button
            onClick={() => setPlaying(p => !p)}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            {playing ? <Pause className="w-3.5 h-3.5 text-white" /> : <Play className="w-3.5 h-3.5 text-white" />}
          </button>
          <button
            onClick={restart}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5 text-white" />
          </button>
          <button
            onClick={() => setStep(s => (s + 1) % sim.length)}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Step dots */}
        <div className="flex items-center gap-2">
          {sim.map((_, i) => (
            <button
              key={i}
              onClick={() => { setStep(i); setPlaying(false); }}
              className={`h-2 rounded-full transition-all duration-300 ${i === step ? "w-6 bg-[#2563EB]" : "w-2 bg-white/25 hover:bg-white/50"}`}
            />
          ))}
        </div>

        <span className="text-[11px] text-white/40" style={{ fontWeight: 500 }}>{step + 1} / {sim.length}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STEP CARDS  (replaces accordion — always visible, card style)
═══════════════════════════════════════════════════════════════ */
function StepCards({ steps }: { steps: TutorialStep[] }) {
  const stepColors = [
    "bg-blue-500", "bg-violet-500", "bg-emerald-500",
    "bg-amber-500", "bg-rose-500", "bg-teal-500", "bg-indigo-500",
  ];

  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <div
          key={i}
          className="rounded-xl border border-border bg-white p-4 shadow-sm hover:shadow-md hover:border-primary/20 transition-all"
        >
          <div className="flex gap-3.5">
            {/* Step number circle */}
            <div
              className={`w-8 h-8 rounded-full ${stepColors[i % stepColors.length]} text-white text-[13px] flex items-center justify-center shrink-0 mt-0.5 shadow-sm`}
              style={{ fontWeight: 800 }}
            >
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] text-foreground mb-1.5 leading-snug" style={{ fontWeight: 600 }}>
                {s.title}
              </p>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                {s.content}
              </p>
              {s.tip && (
                <div className="mt-3 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
                  <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[12px] text-amber-800 leading-relaxed">
                    <span style={{ fontWeight: 700 }}>Pro tip: </span>{s.tip}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CATEGORY CONFIG  (accent colour + emoji per category)
═══════════════════════════════════════════════════════════════ */
const CAT_CFG: Record<string, { accent: string; emoji: string }> = {
  "Getting Started":        { accent: "#10b981", emoji: "🚀" },
  "Dashboard":              { accent: "#3b82f6", emoji: "📊" },
  "Aircraft":               { accent: "#0ea5e9", emoji: "✈️" },
  "Aircraft Management":    { accent: "#0ea5e9", emoji: "✈️" },
  "AI & Chat":              { accent: "#8b5cf6", emoji: "🤖" },
  "Ask & AI Command":       { accent: "#8b5cf6", emoji: "🤖" },
  "Documents":              { accent: "#f59e0b", emoji: "📄" },
  "Compliance":             { accent: "#ef4444", emoji: "🛡️" },
  "Compliance & Safety":    { accent: "#ef4444", emoji: "🛡️" },
  "Squawks":                { accent: "#f97316", emoji: "⚠️" },
  "Work Orders":            { accent: "#6366f1", emoji: "📋" },
  "Parts":                  { accent: "#14b8a6", emoji: "🔩" },
  "Invoices":               { accent: "#06b6d4", emoji: "💵" },
  "Logbook":                { accent: "#a855f7", emoji: "📖" },
  "Customers":              { accent: "#f472b6", emoji: "🏢" },
  "Mechanics & Team":       { accent: "#64748b", emoji: "👥" },
  "Team":                   { accent: "#64748b", emoji: "👥" },
  "Settings & Profile":     { accent: "#94a3b8", emoji: "⚙️" },
  "Settings":               { accent: "#94a3b8", emoji: "⚙️" },
  "Marketplace":            { accent: "#16a34a", emoji: "🛒" },
};
function catCfg(cat: string) {
  return CAT_CFG[cat] ?? { accent: "#2563EB", emoji: "✈️" };
}

/* ═══════════════════════════════════════════════════════════════
   DIFFICULTY BADGE
═══════════════════════════════════════════════════════════════ */
const diffColor: Record<string, string> = {
  Beginner: "bg-emerald-100 text-emerald-700",
  Intermediate: "bg-blue-100 text-blue-700",
  Advanced: "bg-violet-100 text-violet-700",
};

/* ═══════════════════════════════════════════════════════════════
   BROWSE CARD  — dark 3-D tile, title-only
═══════════════════════════════════════════════════════════════ */
function TutorialCard({
  t, viewed, onOpen, delay,
}: {
  t: Tutorial; viewed: boolean; onOpen: () => void; delay: number;
}) {
  const [hov, setHov] = useState(false);
  const cfg = catCfg(t.category);

  return (
    <motion.button
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 280, damping: 26 }}
      whileHover={{ y: -10, scale: 1.025 }}
      // @ts-ignore
      onHoverStart={() => setHov(true)}
      onHoverEnd={() => setHov(false)}
      onClick={onOpen}
      className="relative text-left rounded-2xl overflow-hidden flex flex-col h-48 cursor-pointer"
      style={{
        background: "linear-gradient(148deg, #0F2447 0%, #16305A 50%, #0C1D3A 100%)",
        borderTop: `3px solid ${cfg.accent}`,
        boxShadow: hov
          ? `0 28px 56px rgba(0,0,0,0.55), 0 12px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.07), 0 0 40px ${cfg.accent}30`
          : "0 6px 20px rgba(0,0,0,0.3), 0 2px 6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.05)",
        transition: "box-shadow 0.35s ease",
      }}
    >
      {/* Subtle dot-grid texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.045) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />

      {/* Glow orb behind emoji */}
      <div
        className="absolute right-0 bottom-0 w-32 h-32 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${cfg.accent}20 0%, transparent 70%)`,
          transform: "translate(25%, 25%)",
        }}
      />

      {/* Large decorative emoji */}
      <div
        className="absolute right-4 bottom-3 text-[68px] leading-none select-none pointer-events-none transition-all duration-500"
        style={{ opacity: hov ? 0.18 : 0.1, transform: hov ? "scale(1.1)" : "scale(1)" }}
      >
        {cfg.emoji}
      </div>

      {/* Viewed / pinned corner badges */}
      <div className="absolute top-3.5 right-4 flex items-center gap-2 z-10">
        {t.pinned && (
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: "#f59e0b", boxShadow: "0 0 6px #f59e0b99" }}
          />
        )}
        {viewed && (
          <CheckCircle className="w-4 h-4 text-emerald-400 drop-shadow-sm" />
        )}
      </div>

      {/* Content */}
      <div className="relative z-10 p-5 flex flex-col h-full">
        {/* Category label */}
        <p
          className="text-[9px] uppercase tracking-[0.18em] mb-3 transition-colors duration-300"
          style={{ fontWeight: 700, color: hov ? cfg.accent : "rgba(255,255,255,0.38)" }}
        >
          {t.category}
        </p>

        {/* Title — the main focus */}
        <h3
          className="text-white leading-snug flex-1 line-clamp-3 transition-colors duration-200"
          style={{ fontWeight: 700, fontSize: "15px", textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}
        >
          {t.title}
        </h3>

        {/* Footer */}
        <div
          className="flex items-center gap-2 mt-auto pt-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
        >
          {/* Accent dot + difficulty */}
          <div className="flex items-center gap-1.5">
            <div
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: cfg.accent }}
            />
            <span className="text-[10px] text-white/45" style={{ fontWeight: 500 }}>
              {t.difficulty}
            </span>
          </div>
          <span className="text-white/20 text-[10px]">·</span>
          <span className="text-[10px] text-white/45">{t.duration}</span>
          <span className="text-white/20 text-[10px]">·</span>
          <span className="text-[10px] text-white/45">{t.steps.length} steps</span>

          <div className="ml-auto">
            <ChevronRight
              className="w-4 h-4 transition-all duration-300"
              style={{ color: hov ? cfg.accent : "rgba(255,255,255,0.2)" }}
            />
          </div>
        </div>
      </div>
    </motion.button>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN TUTORIAL MODAL
═══════════════════════════════════════════════════════════════ */
interface TutorialModalProps {
  onClose: () => void;
  defaultPersona?: "owner" | "mechanic";
}

export function TutorialModal({ onClose, defaultPersona = "owner" }: TutorialModalProps) {
  const [persona, setPersona] = useState<"owner" | "mechanic">(defaultPersona);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [activeTutorial, setActiveTutorial] = useState<Tutorial | null>(null);
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  const all = persona === "owner" ? OWNER_TUTORIALS : MECHANIC_TUTORIALS;

  const categories = useMemo(() => {
    return ["All", ...Array.from(new Set(all.map(t => t.category)))];
  }, [all]);

  const filtered = useMemo(() => {
    let list = all;
    if (activeCategory !== "All") list = list.filter(t => t.category === activeCategory);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some(tag => tag.toLowerCase().includes(q)) ||
        t.steps.some(s => s.title.toLowerCase().includes(q))
      );
    }
    return list;
  }, [all, activeCategory, query]);

  const pinned = all.filter(t => t.pinned);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => { setTimeout(() => searchRef.current?.focus(), 100); }, []);

  function openTutorial(t: Tutorial) {
    setActiveTutorial(t);
    setViewedIds(prev => new Set(prev).add(t.id));
  }

  function closeDetail() { setActiveTutorial(null); }

  function switchPersona(p: "owner" | "mechanic") {
    setPersona(p);
    setActiveCategory("All");
    setActiveTutorial(null);
    setQuery("");
  }

  const relatedTutorials = activeTutorial?.related
    ? all.filter(t => activeTutorial.related!.includes(t.id))
    : [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-6xl h-[92vh] bg-background rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="h-16 bg-[#0A1628] flex items-center gap-3 px-6 shrink-0">
          {activeTutorial ? (
            <button
              onClick={closeDetail}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4 text-white" />
            </button>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-[#2563EB] flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
          )}

          <div className="min-w-0">
            <div className="text-white text-[14px]" style={{ fontWeight: 700 }}>
              {activeTutorial ? activeTutorial.title : "Tutorial Center"}
            </div>
            {activeTutorial && (
              <div className="text-white/50 text-[11px]">{activeTutorial.category}</div>
            )}
          </div>

          {/* Persona toggle — browse only */}
          {!activeTutorial && (
            <div className="flex items-center gap-1 bg-white/10 rounded-xl p-1 ml-2">
              {(["owner", "mechanic"] as const).map(p => (
                <button
                  key={p}
                  onClick={() => switchPersona(p)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] transition-all ${persona === p ? "bg-white text-[#0A1628]" : "text-white/60 hover:text-white"}`}
                  style={{ fontWeight: persona === p ? 700 : 400 }}
                >
                  {p === "owner" ? <User className="w-3.5 h-3.5" /> : <HardHat className="w-3.5 h-3.5" />}
                  {p === "owner" ? "Aircraft Owner" : "A&P Mechanic"}
                </button>
              ))}
            </div>
          )}

          {/* Meta badges — detail only */}
          {activeTutorial && (
            <div className="flex items-center gap-2 ml-2">
              <span className={`text-[11px] px-2.5 py-0.5 rounded-full ${diffColor[activeTutorial.difficulty]}`} style={{ fontWeight: 600 }}>
                {activeTutorial.difficulty}
              </span>
              <span className="flex items-center gap-1 text-white/50 text-[11px]">
                <Clock className="w-3 h-3" />{activeTutorial.duration}
              </span>
              <span className="flex items-center gap-1 text-white/50 text-[11px]">
                <Hash className="w-3 h-3" />{activeTutorial.steps.length} steps
              </span>
            </div>
          )}

          {/* Search — browse only */}
          {!activeTutorial && (
            <div className="flex-1 max-w-sm mx-2 flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2">
              <Search className="w-4 h-4 text-white/50 shrink-0" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search tutorials…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="bg-transparent text-white text-[13px] outline-none flex-1 placeholder:text-white/30"
              />
              {query && (
                <button onClick={() => setQuery("")} className="text-white/40 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          <div className="ml-auto">
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── Left Sidebar (browse mode only) ── */}
          {!activeTutorial && (
            <aside className="w-52 shrink-0 overflow-y-auto" style={{ background: "#0A1628", borderRight: "1px solid rgba(255,255,255,0.07)" }}>
              {/* Pinned */}
              {pinned.length > 0 && (
                <div className="px-3 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="text-[9px] text-white/30 uppercase tracking-[0.18em] mb-3 px-1 flex items-center gap-1.5" style={{ fontWeight: 700 }}>
                    <Star className="w-3 h-3 text-amber-400" /> Pinned
                  </div>
                  {pinned.map(t => (
                    <button
                      key={t.id}
                      onClick={() => openTutorial(t)}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-left group mb-0.5 transition-all"
                      style={{ background: "transparent" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <span className="text-[11px] text-white/55 group-hover:text-white flex-1 leading-tight transition-colors" style={{ fontWeight: 500 }}>
                        {t.title}
                      </span>
                      {viewedIds.has(t.id) && <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0 opacity-70" />}
                    </button>
                  ))}
                </div>
              )}

              {/* Categories */}
              <div className="px-3 py-4">
                <div className="text-[9px] text-white/30 uppercase tracking-[0.18em] mb-3 px-1" style={{ fontWeight: 700 }}>
                  Categories
                </div>
                {categories.map(cat => {
                  const count = cat === "All" ? all.length : all.filter(t => t.category === cat).length;
                  const cfg2 = catCfg(cat);
                  const isActive = activeCategory === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-[11px] transition-all mb-0.5"
                      style={{
                        background: isActive ? "rgba(255,255,255,0.1)" : "transparent",
                        color: isActive ? "#fff" : "rgba(255,255,255,0.45)",
                        fontWeight: isActive ? 600 : 400,
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                    >
                      <div className="flex items-center gap-2">
                        {cat !== "All" && (
                          <div
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ background: isActive ? cfg2.accent : "rgba(255,255,255,0.2)" }}
                          />
                        )}
                        <span>{cat}</span>
                      </div>
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-full min-w-[20px] text-center"
                        style={{
                          background: isActive ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.07)",
                          color: isActive ? "#fff" : "rgba(255,255,255,0.35)",
                          fontWeight: 700,
                        }}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>
          )}

          {/* ── Main Content ── */}
          <main className="flex-1 overflow-y-auto">

            {/* ── Browse view ── */}
            {!activeTutorial && (
              <div className="p-6" style={{ background: "linear-gradient(180deg, #f0f4f9 0%, #f8fafc 100%)" }}>
                {/* Section header */}
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-[17px] text-foreground" style={{ fontWeight: 800 }}>
                      {query
                        ? `Results for "${query}"`
                        : activeCategory === "All"
                          ? `All ${persona === "owner" ? "Owner" : "Mechanic"} Tutorials`
                          : activeCategory}
                    </h2>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      {filtered.length} tutorial{filtered.length !== 1 ? "s" : ""}
                      {activeCategory !== "All" && (
                        <button onClick={() => setActiveCategory("All")} className="ml-2 text-primary hover:underline">
                          show all
                        </button>
                      )}
                    </p>
                  </div>
                </div>

                {filtered.length === 0 && (
                  <div className="text-center py-20">
                    <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-[14px] text-muted-foreground">No tutorials found for "{query}"</p>
                    <button onClick={() => setQuery("")} className="text-[13px] text-primary mt-2">
                      Clear search
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filtered.map((t, i) => (
                    <TutorialCard
                      key={t.id}
                      t={t}
                      viewed={viewedIds.has(t.id)}
                      onOpen={() => openTutorial(t)}
                      delay={i * 0.025}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Detail view — 2-column: sim + steps ── */}
            {activeTutorial && (
              <div className="p-6">
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,420px)_1fr] gap-6">

                  {/* ── Left: Simulation + meta + related ── */}
                  <div className="space-y-5">
                    {/* Description card */}
                    <div className="bg-muted/40 rounded-xl border border-border p-4">
                      <p className="text-[13px] text-muted-foreground leading-relaxed">
                        {activeTutorial.description}
                      </p>
                    </div>

                    {/* Simulation player */}
                    <SimPlayer sim={activeTutorial.sim} />

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5">
                      {activeTutorial.tags.map(tag => (
                        <span
                          key={tag}
                          className="text-[11px] bg-muted px-2.5 py-1 rounded-full text-muted-foreground flex items-center gap-1 border border-border"
                        >
                          <Tag className="w-2.5 h-2.5" />{tag}
                        </span>
                      ))}
                    </div>

                    {/* Related tutorials */}
                    {relatedTutorials.length > 0 && (
                      <div>
                        <h3 className="text-[13px] text-foreground mb-2.5 flex items-center gap-2" style={{ fontWeight: 700 }}>
                          <ChevronRight className="w-4 h-4 text-primary" />
                          Related Tutorials
                        </h3>
                        <div className="space-y-2">
                          {relatedTutorials.map(t => (
                            <button
                              key={t.id}
                              onClick={() => openTutorial(t)}
                              className="w-full text-left bg-white rounded-xl border border-border p-3 hover:border-primary/30 hover:shadow-sm transition-all group"
                            >
                              <div className="flex items-center justify-between">
                                <div className="text-[13px] text-foreground group-hover:text-primary transition-colors" style={{ fontWeight: 600 }}>
                                  {t.title}
                                </div>
                                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary shrink-0" />
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                                <span>{t.category}</span>
                                <span>·</span>
                                <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{t.duration}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── Right: Step-by-step cards ── */}
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <h3 className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>
                        Step-by-Step Guide
                      </h3>
                      <span className="text-[12px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full" style={{ fontWeight: 500 }}>
                        {activeTutorial.steps.length} steps
                      </span>
                    </div>
                    <StepCards steps={activeTutorial.steps} />
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>

        {/* ── Footer status bar ── */}
        <div className="h-11 flex items-center px-6 gap-4 shrink-0" style={{ background: "#0A1628", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <span className="text-[11px] text-white/40">
            {viewedIds.size} of {all.length} viewed
          </span>
          <div className="flex-1 h-1 rounded-full overflow-hidden max-w-48" style={{ background: "rgba(255,255,255,0.08)" }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: "#2563EB" }}
              animate={{ width: `${(viewedIds.size / all.length) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <span className="text-[11px] text-white/30 ml-auto">Press Esc to close</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
