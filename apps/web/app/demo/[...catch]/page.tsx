import { notFound } from "next/navigation";

/**
 * Catch-all for unmatched /demo/* routes — the demo sidebar links to many
 * pages whose demo equivalents don't exist (work-orders, estimates, invoices,
 * squawks, approvals, due-list, reports, intelligence, customers, etc.).
 * Without this catch-all, Next.js falls through to the global /not-found.tsx
 * which renders an unfriendly "Back to Dashboard" CTA and loses the demo
 * shell entirely.
 *
 * By calling notFound() inside the /demo segment, the demo-scoped
 * /demo/not-found.tsx renders instead — preserving the demo shell and
 * showing the "preview-only" message with the "Start free 30-day trial"
 * CTA, which is the polished demo experience.
 */
export default function DemoCatchAll() {
  notFound();
}
