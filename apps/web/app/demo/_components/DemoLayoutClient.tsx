"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DemoShell } from "./DemoShell";

function detectPersona(pathname: string | null): "owner" | "mechanic" {
  if (!pathname) return "owner";
  if (pathname.startsWith("/demo/mechanic") || pathname.startsWith("/demo/workspace") || pathname.startsWith("/demo/maintenance")) {
    return "mechanic";
  }
  return "owner";
}

export function DemoLayoutClient({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const persona = detectPersona(pathname);
  return <DemoShell persona={persona}>{children}</DemoShell>;
}
