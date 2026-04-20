"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { User, HardHat, ArrowRight, Plane, CheckCircle, ChevronRight, X } from "lucide-react";
import { useOnboarding, type TourPersona } from "./OnboardingContext";
import { OWNER_STEPS, MECHANIC_STEPS } from "./onboardingSteps";
import { MyAircraftLogo } from "../MyAircraftLogo";

/* ──────────────────────────────────────────────────────────
   Feature chips shown in the "preview" phase
────────────────────────────────────────────────────────── */
const OWNER_FEATURES = [
  { icon: "📊", label: "Fleet Dashboard" },
  { icon: "✈️", label: "Aircraft Fleet" },
  { icon: "📁", label: "Document Vault" },
  { icon: "🤖", label: "AI Command" },
  { icon: "🛒", label: "Marketplace" },
  { icon: "🤝", label: "Invite Mechanic" },
];
const MECHANIC_FEATURES = [
  { icon: "🤖", label: "AI Command Center" },
  { icon: "📋", label: "Work Orders" },
  { icon: "⚠️", label: "Squawk Management" },
  { icon: "💰", label: "Estimate Builder" },
  { icon: "🔩", label: "Parts Search" },
  { icon: "💵", label: "Invoices & Billing" },
  { icon: "📖", label: "AI Logbook" },
];

/* ──────────────────────────────────────────────────────────
   Step counter pill
────────────────────────────────────────────────────────── */
function StepCount({ persona }: { persona: TourPersona | null }) {
  const count = persona === "owner" ? OWNER_STEPS.length - 1 : MECHANIC_STEPS.length - 1;
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white/60" style={{ fontWeight: 600 }}>
      ~{Math.ceil(count * 0.4)} min · {count} steps
    </span>
  );
}

/* ──────────────────────────────────────────────────────────
   Persona card
────────────────────────────────────────────────────────── */
function PersonaCard({
  icon: Icon,
  label,
  subtitle,
  accent,
  selected,
  onClick,
}: {
  icon: any; label: string; subtitle: string;
  accent: string; selected: boolean; onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ y: -6, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="relative flex flex-col items-center gap-5 px-8 py-8 rounded-2xl text-center cursor-pointer w-60 transition-all"
      style={{
        background: selected
          ? `linear-gradient(145deg, ${accent}22 0%, ${accent}11 100%)`
          : "rgba(255,255,255,0.04)",
        border: selected ? `2px solid ${accent}80` : "2px solid rgba(255,255,255,0.08)",
        boxShadow: selected
          ? `0 24px 48px rgba(0,0,0,0.5), 0 0 40px ${accent}22`
          : "0 8px 24px rgba(0,0,0,0.3)",
        transition: "box-shadow 0.3s ease, border 0.3s ease, background 0.3s ease",
      }}
    >
      {selected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-3 right-3"
        >
          <CheckCircle className="w-5 h-5" style={{ color: accent }} />
        </motion.div>
      )}

      {/* Icon circle */}
      <motion.div
        animate={{ scale: selected ? 1.1 : 1 }}
        className="w-20 h-20 rounded-2xl flex items-center justify-center"
        style={{
          background: selected
            ? `linear-gradient(135deg, ${accent}44 0%, ${accent}22 100%)`
            : "rgba(255,255,255,0.06)",
          border: `1px solid ${selected ? accent + "50" : "rgba(255,255,255,0.08)"}`,
          boxShadow: selected ? `0 8px 32px ${accent}33` : "none",
        }}
      >
        <Icon
          className="w-9 h-9"
          style={{ color: selected ? accent : "rgba(255,255,255,0.5)" }}
        />
      </motion.div>

      <div>
        <p className="text-white text-[17px] mb-1.5" style={{ fontWeight: 700 }}>
          {label}
        </p>
        <p className="text-white/50 text-[12px] leading-relaxed">{subtitle}</p>
      </div>

      {selected && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-1.5 text-[12px]"
          style={{ color: accent, fontWeight: 600 }}
        >
          Selected <CheckCircle className="w-3.5 h-3.5" />
        </motion.div>
      )}
    </motion.button>
  );
}

/* ──────────────────────────────────────────────────────────
   MAIN ROLE SELECT SCREEN
────────────────────────────────────────────────────────── */
export function RoleSelectScreen() {
  const { flowActive, flowPhase, tourPersona, selectPersona, startTour, dismissFlow } = useOnboarding();
  const [hovered, setHovered] = useState<TourPersona | null>(null);

  if (!flowActive) return null;

  const features = tourPersona === "mechanic" ? MECHANIC_FEATURES : OWNER_FEATURES;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[500] flex items-center justify-center"
      style={{ background: "rgba(5, 12, 28, 0.97)", backdropFilter: "blur(12px)" }}
    >
      {/* Background glow orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-10 blur-3xl"
          style={{ background: "radial-gradient(circle, #2563EB, transparent)" }} />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full opacity-8 blur-3xl"
          style={{ background: "radial-gradient(circle, #7c3aed, transparent)" }} />
      </div>

      {/* Dismiss button */}
      <button
        onClick={dismissFlow}
        className="absolute top-5 right-5 w-9 h-9 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
      >
        <X className="w-5 h-5" />
      </button>

      <AnimatePresence mode="wait">
        {/* ─── Phase 1: Role Selection ─── */}
        {flowPhase === "select-role" && (
          <motion.div
            key="select"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            className="flex flex-col items-center text-center max-w-2xl px-6"
          >
            {/* Logo */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="flex items-center gap-3 mb-8"
            >
              <MyAircraftLogo variant="light" height={36} />
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <h1 className="text-white text-[32px] leading-tight mb-3" style={{ fontWeight: 800 }}>
                Welcome aboard 👋
              </h1>
              <p className="text-white/55 text-[16px] mb-10 leading-relaxed max-w-md">
                Let's personalize your experience. How will you primarily use myaircraft.us?
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex items-center gap-5 mb-10"
            >
              <PersonaCard
                icon={User}
                label="Aircraft Owner"
                subtitle="I manage aircraft records, compliance, and maintenance coordination."
                accent="#3b82f6"
                selected={tourPersona === "owner"}
                onClick={() => selectPersona("owner")}
              />
              <PersonaCard
                icon={HardHat}
                label="A&P Mechanic"
                subtitle="I perform maintenance, manage work orders, and create logbook entries."
                accent="#8b5cf6"
                selected={tourPersona === "mechanic"}
                onClick={() => selectPersona("mechanic")}
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex flex-col items-center gap-3"
            >
              <motion.button
                onClick={startTour}
                disabled={!tourPersona}
                whileHover={tourPersona ? { scale: 1.04 } : {}}
                whileTap={tourPersona ? { scale: 0.97 } : {}}
                className="flex items-center gap-2.5 px-8 py-3.5 rounded-xl text-[14px] transition-all"
                style={{
                  background: tourPersona ? "#2563EB" : "rgba(255,255,255,0.07)",
                  color: tourPersona ? "#fff" : "rgba(255,255,255,0.3)",
                  fontWeight: 700,
                  boxShadow: tourPersona ? "0 8px 24px rgba(37,99,235,0.45)" : "none",
                  cursor: tourPersona ? "pointer" : "default",
                }}
              >
                Start Guided Tour
                <ArrowRight className="w-4 h-4" />
              </motion.button>

              <button
                onClick={dismissFlow}
                className="text-[13px] text-white/30 hover:text-white/60 transition-colors"
              >
                Skip tour, go straight to app →
              </button>
            </motion.div>
          </motion.div>
        )}

        {/* ─── Phase 2: Tour Preview (what you'll discover) ─── */}
        {flowPhase === "preview" && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center text-center max-w-xl px-6"
          >
            {/* Persona badge */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
              style={{
                background: tourPersona === "mechanic"
                  ? "linear-gradient(135deg, #4c1d95, #7c3aed)"
                  : "linear-gradient(135deg, #1e40af, #2563EB)",
                boxShadow: "0 12px 32px rgba(37,99,235,0.4)",
              }}
            >
              {tourPersona === "mechanic"
                ? <HardHat className="w-8 h-8 text-white" />
                : <User className="w-8 h-8 text-white" />
              }
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-white text-[26px] mb-2" style={{ fontWeight: 800 }}
            >
              {tourPersona === "mechanic" ? "A&P Mechanic" : "Aircraft Owner"} Tour
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="text-white/50 text-[14px] mb-2"
            >
              Here's what you'll discover:
            </motion.p>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mb-8"
            >
              <StepCount persona={tourPersona} />
            </motion.div>

            {/* Feature chips grid */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="grid grid-cols-3 gap-2.5 mb-10 w-full max-w-sm"
            >
              {features.map((f, i) => (
                <motion.div
                  key={f.label}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 + i * 0.06 }}
                  className="flex flex-col items-center gap-2 py-4 px-3 rounded-xl"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <span className="text-2xl">{f.icon}</span>
                  <span className="text-white/65 text-[11px] text-center leading-tight" style={{ fontWeight: 600 }}>
                    {f.label}
                  </span>
                </motion.div>
              ))}
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="flex items-center gap-3"
            >
              <button
                onClick={() => selectPersona("owner" === tourPersona ? "mechanic" : "owner")}
                className="flex items-center gap-1.5 text-[13px] text-white/35 hover:text-white/60 transition-colors px-4 py-2.5 rounded-lg hover:bg-white/05"
              >
                ← Change role
              </button>

              <motion.button
                onClick={startTour}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2.5 px-8 py-3.5 rounded-xl text-[14px] text-white"
                style={{
                  background: "linear-gradient(135deg, #2563EB 0%, #1d4ed8 100%)",
                  fontWeight: 700,
                  boxShadow: "0 8px 24px rgba(37,99,235,0.45)",
                }}
              >
                Let's Go! <ArrowRight className="w-4 h-4" />
              </motion.button>

              <button
                onClick={dismissFlow}
                className="text-[13px] text-white/30 hover:text-white/55 px-4 py-2.5 rounded-lg hover:bg-white/05 transition-colors"
              >
                Skip
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
