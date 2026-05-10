# Phase 15 — Sprint 15.4: Shop Persona Walkthrough

**Tester:** Claude (Chrome MCP)
**Account:** info@myaircraft.us (platform admin · Owner persona in switcher)
**Date:** 2026-05-09
**Test approach:** Direct URL navigation to shop-allowed routes (persona switcher
only shows Owner / Mechanic — no "Shop" button visible — finding 1 below).

## Pages walked

| Route | Result | Notes |
|---|---|---|
| /workflow | ✅ Renders | Kanban board with 6 columns: Draft 0 / Open 0 / In Progress 1 / Awaiting Parts 0 / Ready for Signoff 0 / Closed/Invoiced 0. WO-2026-DEMO card shown in In Progress column. "All mechanics" filter dropdown. Subtitle "1 active work order across the shop · click any card to open." |
| /invoices | ✅ Renders | Tabbed nav (Work Orders/Estimates/Invoices/Logbook) with Invoices active. 4 metric cards (Total/Unpaid/Overdue/Paid). Status + Payment filters. "+ New Invoice" button. Empty state. |
| /estimates | ✅ Renders | Tabbed nav with Estimates active. "+ New Estimate" button. Empty state copy "No estimates yet — Create one from a work order or directly from an aircraft." |
| /customers | ✅ Renders | 1 customer (ANAND PATEL · Individual) with detail pane (email, phone, address, preferred contact). Quick Actions: New Work Order / Create Estimate / New Invoice. "+ Add Customer" button. |
| /purchase-orders | ✅ Renders | Status filters (All/Draft/Open/Ordered/Partial/Fulfilled/Cancelled). "+ New PO" + "← Inventory" link. Empty state. Bulk update collapsible. |

## Findings

### 🔴 P0: Persona switcher has no "Shop" option

- **Symptom**: Top-left persona switcher shows only Owner / Mechanic toggles.
  No way to switch into Shop persona from the UI.
- **Per persona contract**: shop is a distinct persona with its own homeRoute
  (/workflow), allowed pages (everything mechanic + invoices, billing-rates,
  customer approvals), and disallowed pages (admin-only).
- **Impact**: Even if a user has shop entitlement, they cannot activate the
  shop view of the app from this persona switcher.
- **Source**: `apps/web/components/shared/persona-switcher.tsx` (or wherever
  the switcher lives in the topbar / sidebar).
- **Fix**: Add a third "Shop" tab next to Owner/Mechanic. Shop persona shows
  the workflow board + customer-facing surfaces.

### 🟡 P2: /customers shows PII in side pane without redaction

- The customer detail pane shows email, phone, full address, preferred
  contact — these render plaintext.
- For Phase 14 production launch, consider:
  - Masked phone display ("(213) ***-8629") expand-on-click.
  - Masked address ("Henderson, NV") with full address gated behind action.
- Not a blocker for beta. Add to Phase 16 polish backlog.

### 🟡 P3: Subscription banner shows "Mechanic trial" CTA on shop pages

- The yellow trial banner ("Add a payment method to start your 30-day
  Mechanic trial...") shows on /workflow, /invoices, /estimates, /customers,
  /purchase-orders.
- For shop-context pages, this should either be hidden or read "30-day Shop
  trial" / "Bundle" — not "Mechanic".
- Carried over from 15.2 P3 (BillingBanner persona-aware copy).

### 🟡 P3: Shop pages don't show shop-specific empty-state copy

- /workflow with 0 active jobs would benefit from "Drag work orders here as
  they progress" guidance.
- /invoices, /estimates, /customers, /purchase-orders all have generic empty
  states. Could be tighter for shop onboarding.

## What worked

- /workflow Kanban board with 6 columns is well-designed and the
  In-Progress column auto-populates with the WO-2026-DEMO record.
- /invoices, /estimates have proper tab nav (Work Orders/Estimates/Invoices/
  Logbook) showing the four shop document types in one switchable view.
- /customers has detail pane + quick actions (New WO / Create Estimate / New
  Invoice) — fast path from customer to billable work.
- /purchase-orders has full status state machine (Draft → Open → Ordered →
  Partial → Fulfilled or Cancelled) reflected in filter chips.

## Cannot test

- Shop-only entitlement gates (no shop persona switcher button).
- Customer approvals public URL (incognito test) — would require creating an
  approval against a customer, sending the URL, and verifying anonymous access.
  Out of scope for production walkthrough.
- aircraft_logbook + aircraft_registration upload type rejection — would need a
  shop persona session, currently inaccessible.

## Recommendation

- Adding the "Shop" persona button to the switcher is a P0 unblocker for shop
  customers post-launch; without it they can't toggle into shop view.
- Multi-org isolation tests in Sprint 15.6 will catch many of the cross-persona
  edge cases.
