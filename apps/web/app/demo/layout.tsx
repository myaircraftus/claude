import type { ReactNode } from "react";
import { DemoLayoutClient } from "./_components/DemoLayoutClient";

export const metadata = { title: "Demo · MyAircraft" };

// Demo pages reuse real client components that call useSearchParams() and
// other dynamic browser APIs. Disable static prerendering so the build does
// not try to serialise them at compile time.
export const dynamic = "force-dynamic";

export default function DemoLayout({ children }: { children: ReactNode }) {
  return <DemoLayoutClient>{children}</DemoLayoutClient>;
}
