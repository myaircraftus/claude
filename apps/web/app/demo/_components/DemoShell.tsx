"use client";

import { useEffect, type ReactNode } from "react";
import { AppLayout } from "@/components/redesign/AppLayout";
import { useAppContext } from "@/components/redesign/AppContext";
import { DemoBanner } from "./DemoBanner";
import { DemoFetchInterceptor } from "./DemoFetchInterceptor";

function DemoModeBootstrap({ persona }: { persona: "owner" | "mechanic" }) {
  const { setPersona } = useAppContext();

  useEffect(() => {
    setPersona(persona === "mechanic" ? "shop" : "owner");
  }, [persona, setPersona]);

  // Auto-tour launch removed. Live-test on /demo/mechanic showed the tour
  // popup visually overlapping the sidebar / target it pointed at
  // ("Welcome, aviation pro" rendered ON TOP of "My Aircraft (0)") which
  // made the demo feel buggy, not guided. First-time visitors land on a
  // clean shell now; the sidebar "Guided Tour" link still triggers the
  // tour on demand.

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
