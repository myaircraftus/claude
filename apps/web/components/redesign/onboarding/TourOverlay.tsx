"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Lightbulb,
  Sparkles,
  CheckCircle,
  RotateCcw,
  ArrowRight,
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import { useTenantRouter } from "@/components/shared/tenant-link";
import { usePathname } from "next/navigation";
import { useOnboarding } from "./OnboardingContext";
import { useAppContext } from "../AppContext";
import { getEffectivePathname } from "@/lib/auth/tenant-routing";
import type { TourStep, Placement } from "./onboardingSteps";

const TOOLTIP_WIDTH = 380;
const ESTIMATED_TOOLTIP_HEIGHT = 240;
const GAP = 14;
const VIEWPORT_PAD = 12;

type LucideIcon = React.ComponentType<React.SVGProps<SVGSVGElement>>;

function getLucideIcon(name: string): LucideIcon {
  const Icon = (LucideIcons as unknown as Record<string, LucideIcon>)[name];
  return Icon ?? (Sparkles as unknown as LucideIcon);
}

interface TooltipPosition {
  left: number;
  top: number;
  placement: Exclude<Placement, "auto">;
}

function fits(left: number, top: number, height: number): boolean {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return (
    left >= VIEWPORT_PAD &&
    left + TOOLTIP_WIDTH <= vw - VIEWPORT_PAD &&
    top >= VIEWPORT_PAD &&
    top + height <= vh - VIEWPORT_PAD
  );
}

function placeAt(
  rect: DOMRect,
  placement: Exclude<Placement, "auto">,
  height: number,
): { left: number; top: number } {
  if (placement === "right") {
    return {
      left: rect.right + GAP,
      top: rect.top + rect.height / 2 - height / 2,
    };
  }
  if (placement === "left") {
    return {
      left: rect.left - TOOLTIP_WIDTH - GAP,
      top: rect.top + rect.height / 2 - height / 2,
    };
  }
  if (placement === "bottom") {
    return {
      left: rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2,
      top: rect.bottom + GAP,
    };
  }
  return {
    left: rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2,
    top: rect.top - height - GAP,
  };
}

function computeTooltipPosition(
  rect: DOMRect,
  preferred: Placement,
  height: number,
): TooltipPosition {
  const order: Exclude<Placement, "auto">[] =
    preferred === "auto"
      ? ["right", "bottom", "left", "top"]
      : [
          preferred,
          ...(["right", "bottom", "left", "top"].filter(
            (p) => p !== preferred,
          ) as Exclude<Placement, "auto">[]),
        ];

  for (const p of order) {
    const { left, top } = placeAt(rect, p, height);
    if (fits(left, top, height)) return { left, top, placement: p };
  }

  // Fallback: clamp on the preferred side, never let it overflow the viewport.
  const fallback = preferred === "auto" ? "right" : preferred;
  let { left, top } = placeAt(rect, fallback, height);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  left = Math.min(Math.max(VIEWPORT_PAD, left), vw - TOOLTIP_WIDTH - VIEWPORT_PAD);
  top = Math.min(Math.max(VIEWPORT_PAD, top), vh - height - VIEWPORT_PAD);
  return { left, top, placement: fallback };
}

/* ── Spotlight ring with full-page dim via massive box-shadow ── */
function SpotlightRing({ rect, accent }: { rect: DOMRect; accent: string }) {
  const pad = 8;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed pointer-events-none rounded-xl"
      style={{
        left: rect.left - pad,
        top: rect.top - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
        zIndex: 1000,
        boxShadow: `0 0 0 3px ${accent}cc, 0 0 0 9999px rgba(7, 11, 28, 0.55)`,
        transition:
          "left 0.28s cubic-bezier(0.4,0,0.2,1), top 0.28s cubic-bezier(0.4,0,0.2,1), width 0.28s cubic-bezier(0.4,0,0.2,1), height 0.28s cubic-bezier(0.4,0,0.2,1)",
      }}
    />
  );
}

/* ── Outer pulse glow ── */
function PulseRing({ rect, accent }: { rect: DOMRect; accent: string }) {
  const pad = 8;
  return (
    <motion.div
      key={`${rect.left}-${rect.top}-${rect.width}`}
      initial={{ opacity: 0.55, scale: 1 }}
      animate={{ opacity: 0, scale: 1.18 }}
      transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
      className="fixed pointer-events-none rounded-xl"
      style={{
        left: rect.left - pad,
        top: rect.top - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
        zIndex: 1001,
        border: `2px solid ${accent}`,
      }}
    />
  );
}

/* ── Tooltip card ── */
function TooltipCard({
  step,
  index,
  total,
  position,
  onNext,
  onPrev,
  onSkip,
  cardRef,
}: {
  step: TourStep;
  index: number;
  total: number;
  position: TooltipPosition;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  cardRef: React.RefObject<HTMLDivElement>;
}) {
  const Icon = getLucideIcon(step.icon);
  const isFirst = index === 0;
  const isLast = index === total - 1;

  return (
    <motion.div
      ref={cardRef}
      key={index}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      className="fixed rounded-2xl overflow-hidden"
      style={{
        left: position.left,
        top: position.top,
        width: TOOLTIP_WIDTH,
        zIndex: 1010,
        background:
          "linear-gradient(155deg, #0F2447 0%, #162F56 60%, #0C1D3A 100%)",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow:
          "0 24px 64px rgba(0,0,0,0.6), 0 8px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
        transition:
          "left 0.28s cubic-bezier(0.4,0,0.2,1), top 0.28s cubic-bezier(0.4,0,0.2,1)",
      }}
      role="dialog"
      aria-modal="false"
      aria-label={step.title}
    >
      <div className="h-1 w-full" style={{ background: step.accent }} />

      <div className="flex items-start gap-3 px-4 pt-3.5 pb-2">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: step.accent + "22",
            border: `1px solid ${step.accent}55`,
          }}
        >
          <Icon
            className="w-4.5 h-4.5"
            style={{ color: step.accent, width: 18, height: 18 }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <span
            className="text-[10px] uppercase tracking-wider"
            style={{ color: step.accent, fontWeight: 700 }}
          >
            Step {index + 1} of {total}
          </span>
          <h3
            className="text-white text-[15px] leading-tight mt-0.5"
            style={{ fontWeight: 700 }}
          >
            {step.title}
          </h3>
        </div>
        <button
          onClick={onSkip}
          aria-label="End tour"
          className="text-white/35 hover:text-white/85 transition-colors shrink-0 -mt-1 -mr-1 p-1 rounded-md hover:bg-white/5"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 pb-3.5">
        <p className="text-white/65 text-[13px] leading-relaxed">{step.desc}</p>
        {step.tip && (
          <div
            className="flex items-start gap-2 mt-3 px-2.5 py-2 rounded-lg"
            style={{
              background: "rgba(245,158,11,0.08)",
              border: "1px solid rgba(245,158,11,0.22)",
            }}
          >
            <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-amber-200/90 text-[12px] leading-snug">
              {step.tip}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-1.5 px-4 pb-2">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className="rounded-full"
            style={{
              width: i === index ? 18 : 5,
              height: 5,
              background: i <= index ? step.accent : "rgba(255,255,255,0.18)",
              transition: "width 0.25s ease, background 0.25s ease",
            }}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 px-4 pb-4 pt-1">
        <button
          onClick={onPrev}
          disabled={isFirst}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] text-white/55 hover:text-white hover:bg-white/8 transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-white/55"
          style={{ fontWeight: 500 }}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back
        </button>

        <button
          onClick={onSkip}
          className="px-2.5 py-1.5 rounded-lg text-[12px] text-white/35 hover:text-white/65 hover:bg-white/5 transition-all"
        >
          End tour
        </button>

        <div className="flex-1" />

        <motion.button
          onClick={onNext}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12.5px] text-white"
          style={{
            background: step.accent,
            fontWeight: 700,
            boxShadow: `0 4px 14px ${step.accent}55`,
          }}
        >
          {isLast ? "Finish" : "Next"}
          {isLast ? (
            <CheckCircle className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}

/* ── Floating fallback when target can't be located ── */
function FallbackToast({
  step,
  onContinue,
  onSkip,
}: {
  step: TourStep;
  onContinue: () => void;
  onSkip: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{
        zIndex: 1010,
        background: "rgba(15, 36, 71, 0.96)",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
      }}
    >
      <Sparkles className="w-4 h-4 text-blue-300 shrink-0" />
      <p className="text-white/70 text-[12.5px]">
        Looking for <span className="text-white">{step.title}</span>…
      </p>
      <button
        onClick={onContinue}
        className="text-blue-300 text-[12px] hover:text-white transition-colors"
        style={{ fontWeight: 600 }}
      >
        Skip step
      </button>
      <button
        onClick={onSkip}
        className="text-white/40 text-[12px] hover:text-white transition-colors"
      >
        End tour
      </button>
    </motion.div>
  );
}

/* ── Completion modal ── */
function CompletionModal({
  onFinish,
  onRestart,
}: {
  onFinish: () => void;
  onRestart: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{
        zIndex: 1020,
        background: "rgba(5, 12, 28, 0.85)",
        backdropFilter: "blur(8px)",
      }}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 10 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        className="w-full max-w-sm rounded-2xl overflow-hidden text-center"
        style={{
          background:
            "linear-gradient(155deg, #0a1f10 0%, #0d2b14 50%, #0C1D3A 100%)",
          border: "1px solid rgba(16,185,129,0.25)",
          boxShadow:
            "0 32px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(16,185,129,0.1)",
        }}
      >
        <div className="pt-7 pb-3 px-6">
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{
              type: "spring",
              stiffness: 260,
              damping: 18,
              delay: 0.1,
            }}
            className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #10b981, #059669)",
              boxShadow: "0 8px 32px rgba(16,185,129,0.45)",
            }}
          >
            <CheckCircle className="w-8 h-8 text-white" />
          </motion.div>
          <h2
            className="text-white text-[22px] mb-1.5"
            style={{ fontWeight: 800 }}
          >
            You&apos;re all set!
          </h2>
          <p className="text-white/55 text-[13px] leading-relaxed">
            Tour complete. Replay it any time from the{" "}
            <span className="text-white">Guided Tour</span> button in the
            sidebar.
          </p>
        </div>
        <div className="flex gap-2 px-5 pb-5 pt-2">
          <button
            onClick={onRestart}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] text-white/65 hover:text-white hover:bg-white/10 transition-all"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.08)",
              fontWeight: 600,
            }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Replay
          </button>
          <button
            onClick={onFinish}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] text-white"
            style={{
              background: "linear-gradient(135deg, #10b981, #059669)",
              fontWeight: 700,
              boxShadow: "0 6px 20px rgba(16,185,129,0.35)",
            }}
          >
            Done
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN OVERLAY
══════════════════════════════════════════════════════════ */
export function TourOverlay() {
  const {
    tourActive,
    tourStep,
    tourComplete,
    steps,
    nextStep,
    prevStep,
    skipTour,
    finishTour,
    restartTour,
  } = useOnboarding();

  const router = useTenantRouter();
  const pathname = usePathname();
  const effectivePathname = getEffectivePathname(pathname);

  const { persona, setPersona } = useAppContext();

  const [rect, setRect] = useState<DOMRect | null>(null);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const [searching, setSearching] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const step = tourActive ? (steps[tourStep] as TourStep | undefined) : undefined;

  /* Switch persona if the step requires it */
  useEffect(() => {
    if (!step) return;
    if (step.setPersona && persona !== step.setPersona) {
      setPersona(step.setPersona);
    }
  }, [step, persona, setPersona]);

  /* Navigate to the step's route if specified */
  useEffect(() => {
    if (!step?.route) return;
    if (effectivePathname !== step.route) {
      router.push(step.route);
    }
  }, [step?.route, effectivePathname, router]);

  /* Find the target element, scroll it into view, position the tooltip.
     Polls for up to 5s in case the target mounts asynchronously after a route change. */
  useEffect(() => {
    if (!step) {
      setRect(null);
      setPosition(null);
      return;
    }

    let cancelled = false;
    setSearching(true);

    const measureAndPlace = (el: HTMLElement) => {
      if (cancelled) return;
      const r = el.getBoundingClientRect();
      const offscreen =
        r.top < 0 ||
        r.bottom > window.innerHeight ||
        r.left < 0 ||
        r.right > window.innerWidth;

      const finalize = () => {
        if (cancelled) return;
        const r2 = el.getBoundingClientRect();
        setRect(r2);
        const measuredHeight =
          cardRef.current?.offsetHeight ?? ESTIMATED_TOOLTIP_HEIGHT;
        setPosition(
          computeTooltipPosition(r2, step.placement ?? "auto", measuredHeight),
        );
        setSearching(false);
      };

      if (offscreen) {
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        setTimeout(finalize, 350);
      } else {
        finalize();
      }
    };

    const tryFind = (): boolean => {
      const el = document.querySelector(step.target) as HTMLElement | null;
      if (el) {
        measureAndPlace(el);
        return true;
      }
      return false;
    };

    if (tryFind()) return;

    const start = Date.now();
    const interval = setInterval(() => {
      if (cancelled || tryFind()) {
        clearInterval(interval);
        return;
      }
      if (Date.now() - start > 5000) {
        clearInterval(interval);
        if (!cancelled) {
          setRect(null);
          setPosition(null);
          setSearching(false);
        }
      }
    }, 120);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [step, tourStep]);

  /* Re-measure on scroll/resize so the spotlight & tooltip stay glued to the target */
  useEffect(() => {
    if (!step) return;
    const update = () => {
      const el = document.querySelector(step.target) as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect(r);
      const measuredHeight =
        cardRef.current?.offsetHeight ?? ESTIMATED_TOOLTIP_HEIGHT;
      setPosition(
        computeTooltipPosition(r, step.placement ?? "auto", measuredHeight),
      );
    };
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [step]);

  /* After the card renders, re-position with its true measured height to avoid clipping */
  useEffect(() => {
    if (!step || !rect || !cardRef.current) return;
    const measuredHeight = cardRef.current.offsetHeight;
    if (!measuredHeight) return;
    setPosition((prev) => {
      const recomputed = computeTooltipPosition(
        rect,
        step.placement ?? "auto",
        measuredHeight,
      );
      if (
        prev &&
        prev.left === recomputed.left &&
        prev.top === recomputed.top &&
        prev.placement === recomputed.placement
      ) {
        return prev;
      }
      return recomputed;
    });
    // re-runs when tourStep changes via cardRef
  }, [step, rect, tourStep]);

  /* Keyboard navigation */
  useEffect(() => {
    if (!tourActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skipTour();
      else if (e.key === "ArrowRight" || e.key === "Enter") nextStep();
      else if (e.key === "ArrowLeft") prevStep();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tourActive, nextStep, prevStep, skipTour]);

  const showFallback =
    tourActive && step && !rect && !searching;

  return (
    <AnimatePresence>
      {tourActive && step && rect && position && (
        <SpotlightRing key={`spot-${tourStep}`} rect={rect} accent={step.accent} />
      )}
      {tourActive && step && rect && position && (
        <PulseRing key={`pulse-${tourStep}`} rect={rect} accent={step.accent} />
      )}
      {tourActive && step && rect && position && (
        <TooltipCard
          key={`card-${tourStep}`}
          step={step}
          index={tourStep}
          total={steps.length}
          position={position}
          onNext={nextStep}
          onPrev={prevStep}
          onSkip={skipTour}
          cardRef={cardRef}
        />
      )}
      {showFallback && step && (
        <FallbackToast
          key="fallback"
          step={step}
          onContinue={nextStep}
          onSkip={skipTour}
        />
      )}
      {tourComplete && (
        <CompletionModal
          key="complete"
          onFinish={finishTour}
          onRestart={restartTour}
        />
      )}
    </AnimatePresence>
  );
}
