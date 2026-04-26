import type { ReactNode } from "react";
import { DemoLayoutClient } from "./_components/DemoLayoutClient";

export const metadata = { title: "Demo · MyAircraft" };

export default function DemoLayout({ children }: { children: ReactNode }) {
  return <DemoLayoutClient>{children}</DemoLayoutClient>;
}
