# Phase 15 — Production QA Test Plan

**Goal:** Verify Phase 13 (persona-strict UI) + Phase 14 (tier infrastructure) +
all prior phases are working in production. Click every button, fill
every form, document broken behavior, auto-fix the trivial.

## Operating constraints

- **Auth:** info@myaircraft.us is the ONLY platform-admin account; only
  three orgs total in production. All on tier='beta' + billing_disabled=true.
- **Persona testing:** can't log in as separate mechanic/shop accounts —
  no test users with those roles. Use the **persona switcher** in the UI
  to flip mid-session (Phase 13.5 nav supports this for users with the
  right entitlements).
- **No password entry by Claude:** if a login challenge or 2FA appears,
  pause and ask Andy.
- **Already logged in:** Chrome MCP browser session has active cookies
  for info@myaircraft.us — most walkthrough work can proceed without
  re-auth.
- **Production data is sacred:** create no real records; every test row
  cleaned up. Synthetic test orgs/aircraft/docs only via tsx-pg one-shots
  with explicit DELETE in finally.

## Personas to test (per /docs/persona-contracts.md)

| Persona | homeRoute | Allowed pages (sample) | Disallowed (must redirect) |
|---|---|---|---|
| owner | /my-aircraft | /aircraft, /compliance, /inspections, /continued, /approvals, /costs, /economics, /ask, /documents (Aircraft Records uploads only), /reports/tax-pnl | /admin/*, /work-orders/*, /scheduler, /time-off, /clock |
| mechanic | /my-day | /work-orders, /scheduler, /time-off, /clock, /tools, /parts, /vendors, /manuals, /documents (Reference Manuals uploads only) | /aircraft/[id]/economics, /reports/tax-pnl, /admin/* |
| shop | /workflow | everything mechanic + invoices, billing-rates (legacy), customer approvals | /admin/*, aircraft_logbook + aircraft_registration upload types only |
| admin | /admin | everything (cross-org) including /admin/billing/{batch,orgs}, /admin/vision/*, /admin/ingestion/*, /admin/errors | nothing (admin sees all) |

## Critical workflows to verify per persona

### Owner
1. Upload Aircraft Document — only Aircraft Records category visible
2. Document picker rejects mechanic-only types (server-side)
3. Per-aircraft Economics view + Profitability/Cost charts
4. Tax-time P&L PDF export
5. Ask AI / Citations
6. SLA banner shows on upload (24h or real-time per tier)
7. Tier visibility (org's tier surfaced somewhere readable)

### Mechanic
1. Upload Reference Doc — only Reference Manuals + Operations + Compliance categories
2. Aircraft Records types REJECTED (server-side)
3. Work Order create/edit/complete + time clock
4. Scheduler Gantt + create shift
5. Tool calibration tracking
6. Time off + clock-in/out forms

### Shop
1. WO with billing
2. Customer approval public URL (incognito test)
3. Vendors + parts inventory
4. aircraft_logbook + aircraft_registration upload types REJECTED
5. Invoices

### Admin
1. /admin home — cross-org metrics, error log, worker health
2. /admin/vision/{workers,review,telemetry}
3. /admin/ingestion/progress
4. /admin/errors with retry/resolve
5. /admin/billing/batch (run-now per tier)
6. /admin/billing/orgs (change tier + audit)

## Cross-persona + edge cases

- Persona switcher mid-session: nav changes, home redirects, localStorage retained
- Multi-org isolation: paste another org's UUID into URL → 403
- Mobile (375x812): nav becomes Sheet, content reachable
- Empty states: new aircraft no docs, empty inbox
- Loading states: throttled network shows skeletons
- Error states: /aircraft/00000000-0000-0000-0000-000000000000 → 404
- Console error sweep: count distinct errors per page

## Auto-fix categories (commit immediately)

- Typos / labels / copy
- Missing aria-labels / alt text
- React key warnings
- Missing loading/empty states (one-line additions)
- Dead links (hrefs to old routes)
- Persona-leak fixes (button visible to wrong persona)

## Log-only categories (Phase 15.7 backlog)

- Workflow logic bugs
- Backend 500s
- Layout breaks at specific viewports
- Spec mismatches needing product judgment

## Findings already captured

- 🔴 P0: /security route shadowed by tenant routing
  → **Auto-fixed in Sprint 15.1** (added 'security' to RESERVED_TOP_LEVEL_SEGMENTS)
- 🟡 P2: /pricing `<title>` still legacy persona-based copy
- 🟡 P3: Footer Careers + Cookie Policy are placeholders

## Production state at start of QA

- Migrations 098-108 all applied
- 3 orgs, all tier='beta' + billing_disabled=true (Phase 14 default)
- Colab worker offline (last seen 2h ago, status='stopping')
- 4 jobs queued, 2 running on Modal, 17 failed (PNG-render gap), 1 completed
- info@myaircraft.us is only platform admin
