"use client";

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react";
import { usePathname } from "next/navigation";
import { OWNER_STEPS, MECHANIC_STEPS, type TourStep } from "./onboardingSteps";
import { getEffectivePathname } from "@/lib/auth/tenant-routing";

export type TourPersona = "owner" | "mechanic";

interface OnboardingCtx {
  tourActive: boolean;
  tourPersona: TourPersona | null;
  tourStep: number;
  tourComplete: boolean;
  steps: TourStep[];

  launchTour: (persona?: TourPersona) => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
  finishTour: () => void;
  restartTour: () => void;
  jumpToStep: (index: number) => void;
}

const Ctx = createContext<OnboardingCtx | null>(null);

const STORAGE_KEY = "mau_onboarding_done_v2";

function detectPersonaFromPath(p: string): TourPersona {
  if (
    p.startsWith("/mechanic") ||
    p.startsWith("/workspace") ||
    p.startsWith("/maintenance")
  ) {
    return "mechanic";
  }
  return "owner";
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const effectivePathname = getEffectivePathname(pathname);

  const [tourActive, setTourActive] = useState(false);
  const [tourPersona, setTourPersona] = useState<TourPersona | null>(null);
  const [tourStep, setTourStep] = useState(0);
  const [tourComplete, setTourComplete] = useState(false);

  const steps =
    tourPersona === "owner"
      ? OWNER_STEPS
      : tourPersona === "mechanic"
        ? MECHANIC_STEPS
        : [];

  const launchTour = useCallback(
    (persona?: TourPersona) => {
      const p = persona ?? detectPersonaFromPath(effectivePathname);
      setTourPersona(p);
      setTourStep(0);
      setTourComplete(false);
      setTourActive(true);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, "1");
      }
    },
    [effectivePathname],
  );

  /* Auto-launch the tour the first time someone lands on the dashboard or mechanic
     home — instead of the previous role-select modal. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isLandingPage =
      effectivePathname === "/dashboard" || effectivePathname === "/mechanic";
    if (!isLandingPage) return;
    if (window.localStorage.getItem(STORAGE_KEY)) return;

    const t = setTimeout(() => {
      launchTour(detectPersonaFromPath(effectivePathname));
    }, 900);
    return () => clearTimeout(t);
  }, [effectivePathname, launchTour]);

  const nextStep = useCallback(() => {
    const list = tourPersona === "owner" ? OWNER_STEPS : MECHANIC_STEPS;
    if (tourStep < list.length - 1) {
      setTourStep((s) => s + 1);
    } else {
      setTourActive(false);
      setTourComplete(true);
    }
  }, [tourStep, tourPersona]);

  const prevStep = useCallback(() => {
    if (tourStep > 0) setTourStep((s) => s - 1);
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

  const jumpToStep = useCallback(
    (index: number) => {
      const list = tourPersona === "owner" ? OWNER_STEPS : MECHANIC_STEPS;
      if (index >= 0 && index < list.length) setTourStep(index);
    },
    [tourPersona],
  );

  return (
    <Ctx.Provider
      value={{
        tourActive,
        tourPersona,
        tourStep,
        tourComplete,
        steps,
        launchTour,
        nextStep,
        prevStep,
        skipTour,
        finishTour,
        restartTour,
        jumpToStep,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useOnboarding(): OnboardingCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOnboarding must be inside OnboardingProvider");
  return ctx;
}
