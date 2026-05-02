"use client";

import { useEffect, type ReactNode } from "react";
import { AppLayout } from "@/components/redesign/AppLayout";
import { useAppContext } from "@/components/redesign/AppContext";
import { useOnboarding } from "@/components/redesign/onboarding/OnboardingContext";
import { DemoBanner } from "./DemoBanner";
import { DemoFetchInterceptor } from "./DemoFetchInterceptor";

const TOUR_STORAGE_KEY = "mau_onboarding_done_v2";

function DemoModeBootstrap({ persona }: { persona: "owner" | "mechanic" }) {
  const { setPersona } = useAppContext();
  const { launchTour, tourActive, tourComplete } = useOnboarding();

  useEffect(() => {
    setPersona(persona);
  }, [persona, setPersona]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (tourActive || tourComplete) return;
    // Always re-launch the tour for first-time demo visitors so the demo is
    // self-explanatory.  We clear the "done" flag once per browser session so
    // someone who already finished the tour on the real app still sees it
    // when they pick a demo.
    const sessionKey = `${TOUR_STORAGE_KEY}_demo_${persona}`;
    if (window.sessionStorage.getItem(sessionKey)) return;
    window.sessionStorage.setItem(sessionKey, "1");
    window.localStorage.removeItem(TOUR_STORAGE_KEY);
    const t = window.setTimeout(() => launchTour(persona), 800);
    return () => window.clearTimeout(t);
  }, [persona, launchTour, tourActive, tourComplete]);

  return null;
}

export function DemoShell({
  persona,
  children,
}: {
  persona: "owner" | "mechanic";
  children: ReactNode;
}) {
  const userName = persona === "owner" ? "Demo Owner" : "Demo Mechanic";
  return (
    <>
      <DemoFetchInterceptor />
      <DemoBanner />
      <AppLayout userName={userName}>
        <DemoModeBootstrap persona={persona} />
        {children}
      </AppLayout>
    </>
  );
}
