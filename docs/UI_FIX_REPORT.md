# UI Fix Report — 2026-05-15

Authority: the 9 SOP files in `docs/sop/`. No nav items or features were
invented beyond what the SOPs define. No DB migrations, RLS policies, or
column names were changed.

## Sidebar Cleanup

All changes in `apps/web/components/redesign/AppLayout.tsx`, function
`buildMechanicNav` (the shop-side sidebar — the surface the mechanic /
shop-admin role split governs).

**Items removed** — the old `if (perm.settingsFull && isShopAdmin)` block
(previously ~lines 173–189) pushed 14 nav items; 13 of them are backed by
no SOP and were deleted:

| Removed item | href | was at (old line) |
|--------------|------|-------------------|
| Taxonomy | `/settings/taxonomy` | ~175 |
| Compliance | `/compliance` | ~176 |
| Expirations | `/documents/expiring` | ~177 |
| Inspections | `/inspections` | ~178 |
| Continued | `/continued` | ~179 |
| Approvals (Customer Approvals) | `/approvals` | ~180 |
| Tools | `/tools` | ~181 |
| Time clock | `/time-clock` | ~182 |
| Scheduler (Workforce) | `/scheduler` | ~184 |
| Time Off (Workforce) | `/time-off` | ~185 |
| Clock In/Out (Workforce) | `/clock` | ~186 |
| Meters | `/meters` | ~187 |
| Locations | `/locations` | ~188 |
| Marketplace | `/marketplace` | ~189 |

`Settings` was the only item kept from that block. `buildMechanicNav` was
also rewritten from permission-driven to role-driven, so the item set is
now fixed and SOP-aligned (no speculative items can reappear via a `perm`
flag).

**Items kept (the 10):** Dashboard · Aircraft · Work Orders · Squawks ·
Estimates · Invoices · Logbook · Parts & Inventory · Reports · Settings.

**Mechanic nav verified:** YES — a `mechanic` (or any non-`owner`/`admin`)
role gets exactly: Dashboard, Aircraft, Work Orders, Squawks, Logbook,
Parts & Inventory (6 items).

**Shop/Admin nav verified:** YES — an `owner`/`admin` role gets all 10
items above (the 6 base + Estimates, Invoices, Reports, Settings).

**Role badge:** still present — the navy "Shop Admin" / blue "Mechanic"
pill in the sidebar user footer was not touched.

## Fix 1: Squawk Page Title

- **File changed:** none — no change was required.
- **Finding:** the squawks module already uses "Squawks" everywhere:
  - `apps/web/app/(app)/squawks/page.tsx` → `export const metadata = { title: 'Squawks' }` and `<Topbar breadcrumbs={[{ label: 'Squawks' }]} />`
  - `apps/web/components/squawks/squawks-workspace.tsx` line 462 → `<h1>` renders `'Squawks'`
- There is **no `"Mechanic Portal"` string anywhere in the squawks module**
  (verified by repo-wide grep). The string the user saw comes from the
  separate legacy `/mechanic` route (`app/(app)/mechanic/page.tsx`,
  `metadata.title = 'Mechanic Portal'`), which is out of scope for the
  squawks SOP. The cleaned sidebar points the "Squawks" item at `/squawks`,
  the correct standalone page.
- **Before / After:** n/a — already correct.

## Fix 2: Logbook UUID Display

- **Root cause:** `apps/web/components/logbook/logbook-workflow-board.tsx`
  rendered the entries list "Entry" column as `{entry.id.slice(0, 8)}` —
  the first 8 characters of the row UUID — as the entry label.
- **Fix applied:** the "Entry" cell now renders a human-readable label:
  - **Entry type** — `labelize(entry.entry_type)` (e.g. "Annual Inspection")
  - **Date** — `entry.entry_date` formatted **MM/DD/YYYY** via a new
    `formatEntryDate()` helper (handles a plain `YYYY-MM-DD` date column
    with no timezone shift, and ISO timestamps)
  - **Mechanic** — `entry.mechanic_name`, falling back to
    `entry.mechanic_cert_number` when the name is absent
  The aircraft **tail number** is already its own adjacent column.
  The page query was extended to select `mechanic_name, mechanic_cert_number`
  (display only — no column was renamed).
- **Files changed:**
  - `apps/web/app/(app)/logbook-entries/page.tsx` — added `mechanic_name, mechanic_cert_number` to the `logbook_entries` select
  - `apps/web/components/logbook/logbook-workflow-board.tsx` — added `formatEntryDate()`; replaced the UUID-fragment cell with the type/date/mechanic label

## Fix 3: AI Parts Search

- **Root cause:** the `/api/parts/search` route has `maxDuration = 30`
  (30-second serverless timeout) and calls `resolvePartWithAI()` (an OpenAI
  chat completion) with **no per-request timeout**. The `openai` SDK
  defaults to a 10-minute request timeout — so a slow or hung OpenAI
  response made the route exceed its 30s `maxDuration`, the serverless
  function was killed mid-response, the connection dropped, and the
  browser's `fetch()` rejected with the bare `TypeError: Failed to fetch`.
- **Fix applied:**
  1. **Root cause** — `lib/parts/ai-resolve.ts`: the OpenAI call now passes
     `{ timeout: 12000, maxRetries: 1 }`. On timeout it throws → the existing
     `catch` returns `null` → the search still runs with the raw query (just
     no AI optimization). The route now stays well under 30s.
  2. **Error handling** — `part-search-panel.tsx` `runSearch()` was hardened:
     an `AbortController` 32s client-side backstop, defensive `resp.json()`
     parsing (a crashed route can return a non-JSON HTML page), and
     specific messages — `AbortError` → "timed out", `TypeError` (the
     "Failed to fetch" case) → "Could not reach the parts search service" —
     so a bare "Failed to fetch" can no longer surface to the user.
- **Files changed:**
  - `apps/web/lib/parts/ai-resolve.ts`
  - `apps/web/app/(app)/parts/components/part-search-panel.tsx`
- Note: required env vars (`SERPAPI_API_KEY`, `EBAY_APP_ID/CERT_ID/DEV_ID`,
  `OPENAI_API_KEY`) are all confirmed present in production; the SerpAPI and
  eBay providers already have 9s `AbortController` timeouts — the missing
  OpenAI timeout was the gap.

## Fix 4: Work Order Wizard Overlay

- **Root cause:** not a z-index bug. The wizard
  (`apps/web/components/work-orders/create-work-order-modal.tsx`) already
  rendered as `fixed inset-0 z-50`, and the app chrome (sidebar/topbar) has
  no explicit z-index (`z-auto`), so `z-50` already sat above it. The
  problem was the **translucent backdrop** — `bg-black/50 backdrop-blur-sm`
  is a 50%-opacity scrim, so the Dashboard remained visible behind the
  wizard.
- **Fix applied:** the overlay backdrop is now **opaque** — `bg-black/50
  backdrop-blur-sm` → `bg-slate-950` — so it completely covers the page
  behind it. `z-50` was also bumped to `z-[100]` as a defensive measure so
  the wizard stays above any future high-z UI.
- **Files changed:**
  - `apps/web/components/work-orders/create-work-order-modal.tsx`

## Remaining Issues (not fixed in this sprint)

1. **Owner-persona and Admin-persona navs still contain non-SOP items.**
   `AppLayout.tsx` also defines `ownerNavItems` (the aircraft-owner customer
   surface — Compliance, Costs, Expirations, Inspections, Continued, Tools,
   Time clock, Scheduler, Marketplace, etc.) and `adminNavItems` (the
   platform-staff admin surface — Command Center, Vision, Billing batch,
   "FAR/AIM AI", etc.). PHASE 2's scope and verification criteria were the
   *mechanic vs shop/admin* shop sidebar, which the 9 shop SOPs govern;
   those 9 SOPs do not define the owner-customer or admin-platform surfaces.
   Per the sprint RULES ("if unsure, leave and note"), both were left
   untouched. **Suggested next step:** decide whether the owner-customer and
   admin-platform navs should also be SOP-trimmed, and against which SOPs.

2. **Removed-nav page files still exist.** The page files for the removed
   items (`app/(app)/compliance/`, `/inspections/`, `/continued/`, `/tools/`,
   `/meters/`, `/locations/`, `/scheduler/`, `/time-off/`, `/clock/`,
   `/time-clock/`, `/marketplace/`, `/settings/taxonomy/`, `/documents/expiring/`,
   `/approvals/`) were **not deleted** — only their sidebar entries were
   removed (per the brief). They remain reachable by direct URL. **Suggested
   next step:** if these modules are truly retired, delete the route files
   in a follow-up; otherwise they linger as orphaned routes.

3. **Logbook mechanic name depends on stored data.** Fix 2 shows
   `mechanic_name` / `mechanic_cert_number` only when the entry row has them
   populated; pre-existing entries created before those columns were filled
   will show just type + date.

4. **Legacy `/mechanic` route title.** `app/(app)/mechanic/page.tsx` still
   has `metadata.title = 'Mechanic Portal'`. It is the legacy multi-tab
   portal, not the squawks module, so it was left as-is (renaming it to
   "Squawks" would be wrong). **Suggested next step:** decide whether the
   legacy `/mechanic` portal route should be retired now that the SOP
   modules (Squawks, Work Orders, Logbook, etc.) have standalone pages.
