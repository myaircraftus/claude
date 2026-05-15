---
title: "Dashboard + Create Menu"
module: "dashboard"
faa_refs:
  - "14 CFR 43.9"
slug: "01-dashboard-create-menu"
order: 1
version: "1.0.0"
last_updated: "2026-05-14"
status: "active"
---

# Dashboard + Create Menu

## Purpose

The Dashboard is the canonical landing surface for every authenticated user. Its persona-driven layout (Owner vs Shop) collapses the global "what's next" question into a small set of high-signal cards. The **Create menu** is the only sanctioned entry point for creating a new Aircraft, Work Order, Estimate, Invoice, Logbook Entry, or Squawk from anywhere in the app.

## Persona behavior

- **Owner home (`/my-aircraft`)** — surfaces the fleet, upcoming compliance, open squawks, and recent activity. Owners never see W/O profitability, labor rates, or shop pricing.
- **Shop home (`/workflow`)** — surfaces assigned & overdue work orders, today's shift schedule, low-stock parts, pending approvals, and shop KPIs.
- **Admin (`/admin/command-center`)** — separate from this SOP; covered by the Ops Command Center documentation.

## Create menu — required behaviors

1. Available from the top bar on every authenticated page.
2. Each item routes to its module's "new" surface. The form must validate against the module's own SOP (e.g., new Work Order honors §05).
3. Items disabled for a persona MUST render with a tooltip explaining why (e.g., Owner cannot create a Work Order; the upsell appears instead).

## SOP rules

- **One source of truth.** Creation flows in the sidebar's other entry points (e.g., per-aircraft "Add Squawk") must funnel through the same server actions as the Create menu. Never branch.
- **Audit log every create.** Every Create-menu action writes a row to the corresponding audit / activity log table.
- **Persona gate, server-side.** The Create menu is filtered client-side for UX, but the server action MUST re-check entitlement + persona before accepting the create.

## Failure modes

- **Persona drift after a switch:** if the user's persona changes mid-session (Phase 18 Sprint 18.6 `/api/persona/switch`), the Create menu re-renders from the new persona. No stale items.
- **No active org:** the Create menu is hidden until the user has an accepted org membership.

## Related modules

- Aircraft Master Record — §02
- Squawks — §03
- Work Order Execution — §05
- Invoices & Payments — §06
- Logbook Entries — §07
