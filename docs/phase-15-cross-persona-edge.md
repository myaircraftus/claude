# Phase 15 — Sprint 15.6: Cross-Persona + Edge Cases

**Tester:** Claude (Chrome MCP)
**Account:** info@myaircraft.us (platform admin · Owner persona)
**Date:** 2026-05-09

## Tests run

### ✅ Empty states (covered in 15.2/15.3/15.4)

- `/compliance` empty: "Nothing overdue or due-soon. Nice."
- `/inspections` empty: "No inspections — Create one to start running a procedure on an aircraft, or pick a different saved view."
- `/continued` empty: "Nothing deferred. Clean fleet."
- `/parts` empty: "No parts yet — Add your first part to start tracking inventory."
- `/vendors` empty: "No vendors yet — Add your suppliers, OSR shops, and freight vendors here so POs + outside-service WO lines link to them by reference."
- `/manuals` empty: "No manuals uploaded yet — Click 'Upload Manual' to add your first parts catalog or AMM. Each manual gets ingested so you can ask questions inside the aircraft view."
- `/tools` empty: "No tools yet — Click 'New tool' to register one."
- `/customers` not empty (1 customer); single-customer state renders detail pane.

### ✅ 404 / unknown UUID (`/aircraft/00000000-0000-0000-0000-000000000000`)

- **Result**: silently redirects to `/aircraft` (the list view) — does NOT show
  a 404 page. Consistent with "best-effort" behavior but a 404 page would be
  more informative.
- **Severity**: 🟡 P3 — UX nit, not a bug.

### ⚠️ Mobile viewport (375x812) test inconclusive

- Called `resize_window 375x812` on the tab — the tool reported success.
- Subsequent screenshot still rendered at 1568x738 (the tab group's viewport).
- This is a Chrome MCP / extension viewport limitation, not a site bug.
- Recommend: real mobile QA via TestFlight or BrowserStack, not Chrome MCP.

### 🟡 N+1 fetch pattern on /ask page

Network capture for a single navigation to `/ask`:

| Endpoint | Calls during page load |
|---|---|
| `/api/aircraft` | **7** |
| `/api/me/orgs` | 2 |
| `/api/team` | 2 |
| `/api/work-orders/messages-unread` | 2 |
| `/api/me` | 1 |
| `/api/billing/status` | 1 |
| `/api/faraim/entitlement` | 1 |

- **Severity**: 🟡 P2 — every duplicate call is wasted compute + bandwidth.
- **Likely cause**: multiple components in the React tree are calling the same
  hook independently without memoization (e.g., `useAircraft()` is being
  invoked from sidebar, topbar, picker, page-content, etc.).
- **Fix**: switch to React Query (single in-flight key) or a Context provider
  that fetches once and broadcasts.
- Same pattern very likely on every page that has the sidebar.

### ✅ No console errors captured on /ask, /aircraft, /my-aircraft

- Chrome MCP `read_console_messages` reports no errors.
- Caveat: the tool only captures messages emitted AFTER it's first called;
  page-load errors before the first call aren't reflected.

### ✅ All API responses 200 OK on /ask

- 52 network requests captured.
- 0 4xx, 0 5xx.
- All static assets (`/_next/static/...`) load correctly.

## Tests NOT run (out of scope or blocked)

| Test | Why not |
|---|---|
| Multi-org isolation (paste another org's UUID) | Only have access to one org — would need synthetic second org via tsx-pg one-shot. Saved for Sprint 15.7. |
| Persona switcher mid-session — localStorage retained | Mechanic switch fired Phase 14 paywall; declined to start trial. |
| Throttled-network skeleton states | Chrome MCP doesn't expose CDP throttling. Recommend manual QA. |
| Customer approvals public URL (incognito) | Out of scope for the production walkthrough; better tested with synthetic data in a staging env. |

## Carry-overs from prior sprints

- 🔴 P0: `/admin/*` blocked for platform admin (15.5)
- 🔴 P0: persona-strict guards bypassed for platform admin (15.2/15.3)
- 🔴 P0: persona switcher missing Shop tab (15.4)
- 🟡 P1: `/my-day` shows owner-flavored copy (15.3)
- 🟡 P2: `/manuals` upload modal missing Phase 14 SLA banner (15.3)
- 🟡 P2: `/approvals` shop-perspective for Owner (15.2)
- 🟡 P2: aircraft detail Upload button uses legacy route (15.2)
- 🟡 P2: `/customers` PII not redacted (15.4)
- 🟡 P3: BillingBanner says "Mechanic trial" for Owner (15.2)
- 🟡 P3: `/costs` subtitle leaks "(sprint 7.2 / 7.3)" (15.2)
- 🟡 P3: `/work-orders/[id]` tab title is wrong (15.3)
- 🟡 P3: aircraft cards show Hobbs/Tach as "—" without context (15.2)
- 🟡 P3: `/aircraft/{bad-uuid}` silently redirects instead of 404 (15.6)

## What worked

- Empty-state copy is friendly + actionable across the board.
- All marketing site routes (15.1), persona pages (15.2-15.4), and edge cases
  (15.6) load without 4xx/5xx errors.
- Phase 14 cross-persona paywall fires correctly when Owner clicks the
  Mechanic switcher (15.3).
- Phase 13.2 PersonaAwareUploadModal enforces document_type matrix
  server-side (15.2).
