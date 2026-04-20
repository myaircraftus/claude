"use client";

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react";
import { usePathname } from "next/navigation";
import { OWNER_STEPS, MECHANIC_STEPS, type TourStep } from "./onboardingSteps";
import { getEffectivePathname } from "@/lib/auth/tenant-routing";

export type TourPersona = "owner" | "mechanic";

interface OnboardingCtx {
  /* ── Role-select flow ── */
  flowActive:  boolean;
  flowPhase:   "select-role" | "preview";

  /* ── Live tour ── */
  tourActive:   boolean;
  tourPersona:  TourPersona | null;
  tourStep:     number;
  tourComplete: boolean;
  steps:        TourStep[];

  /* ── Actions ── */
  launchFlow:    () => void;
  dismissFlow:   () => void;
  selectPersona: (p: TourPersona) => void;
  startTour:     () => void;
  nextStep:      () => void;
  prevStep:      () => void;
  skipTour:      () => void;
  finishTour:    () => void;
  restartTour:   () => void;
}

const Ctx = createContext<OnboardingCtx | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const effectivePathname = getEffectivePathname(pathname);
  const [flowActive,   setFlowActive]   = useState(false);
  const [flowPhase,    setFlowPhase]    = useState<"select-role" | "preview">("select-role");
  const [tourActive,   setTourActive]   = useState(false);
  const [tourPersona,  setTourPersona]  = useState<TourPersona | null>(null);
  const [tourStep,     setTourStep]     = useState(0);
  const [tourComplete, setTourComplete] = useState(false);

  const steps = tourPersona === "owner" ? OWNER_STEPS : tourPersona === "mechanic" ? MECHANIC_STEPS : [];

  /* Auto-launch on first visit */
  useEffect(() => {
    const canAutoLaunch = effectivePathname === "/dashboard" || effectivePathname === "/mechanic";
    if (!canAutoLaunch) return;

    const done = localStorage.getItem("mau_onboarding_done");
    if (!done) setTimeout(() => setFlowActive(true), 900);
  }, [effectivePathname]);

  const launchFlow = useCallback(() => {
    setFlowPhase("select-role");
    setFlowActive(true);
    setTourComplete(false);
  }, []);

  const dismissFlow = useCallback(() => {
    setFlowActive(false);
    localStorage.setItem("mau_onboarding_done", "1");
  }, []);

  const selectPersona = useCallback((p: TourPersona) => {
    setTourPersona(p);
    setFlowPhase("preview");
  }, []);

  const startTour = useCallback(() => {
    setFlowActive(false);
    setTourStep(0);
    setTourActive(true);
    localStorage.setItem("mau_onboarding_done", "1");
  }, []);

  const nextStep = useCallback(() => {
    const list = tourPersona === "owner" ? OWNER_STEPS : MECHANIC_STEPS;
    if (tourStep < list.length - 1) {
      setTourStep(s => s + 1);
    } else {
      setTourActive(false);
      setTourComplete(true);
    }
  }, [tourStep, tourPersona]);

  const prevStep = useCallback(() => {
    if (tourStep > 0) setTourStep(s => s - 1);
  }, [tourStep]);

  const skipTour = useCallback(() => {
    setTourActive(false);
    setTourComplete(false);
  }, []);

  const finishTour = useCallback(() => {
    setTourComplete(false);
  }, []);

  const restartTour = useCallback(() => {
    setTourComplete(false);
    setTourStep(0);
    setTourActive(true);
  }, []);

  return (
    <Ctx.Provider value={{
      flowActive, flowPhase,
      tourActive, tourPersona, tourStep, tourComplete, steps,
      launchFlow, dismissFlow, selectPersona, startTour,
      nextStep, prevStep, skipTour, finishTour, restartTour,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useOnboarding(): OnboardingCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOnboarding must be inside OnboardingProvider");
  return ctx;
}
