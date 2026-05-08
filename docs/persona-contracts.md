# Persona Contracts

> **Status:** First-draft audit produced during the 2026-05-08 overnight run (Phase 1).
> **Source of truth for personas:** `apps/web/lib/persona/config.ts` (PERSONA_CONFIG).
> **Source of truth for nav:** `apps/web/components/redesign/AppLayout.tsx` lines 61–168 (owner) + `buildMechanicNav` + 346–351 (admin).

---

## Personas

The canonical enum (`apps/web/types`) is **4 personas**, not 3 as the overnight brief suggests:

| Persona | Home route | Notes |
|---|---|---|
| `owner` | `/my-aircraft` | Aircraft owner. Hides labor rates / shop pricing / WO profitability via `hiddenModules`. |
| `mechanic` | `/my-day` | A&P technician. Hides org-billing / owner-finances. |
| `shop` | `/dashboard/ops` | Shop foreman / dispatcher. Full visibility (`hiddenModules: []`). |
| `admin` | `/admin` | Internal platform-admin persona. Same `hiddenModules: []` as shop; reuses ops surfaces until a dedicated admin layout exists (per the comment in PERSONA_CONFIG). |

**Architectural note (vs. the overnight brief):** the brief assumes nav is a single array where each item declares `personas: Persona[]`. Reality is three persona-specific arrays plus a `module: string` field that's filtered against `PERSONA_CONFIG[p].hiddenModules`. The mechanic nav additionally layers `MechanicPermissions` (settingsFull, dashboard, aircraft, …) on top. Restructuring to a single array would lose the mechanic-permissions expressivity and risks regressing live behavior — kept the existing structure and produced this contract as the audit artifact instead.

The dispatcher at `AppLayout.tsx:353-358` is:
```ts
const navItemsRaw =
  persona === "admin"  ? adminNavItems :
  persona === "owner"  ? ownerNavBase  :
                         buildMechanicNav(activeMechanic.permissions);
```

→ **`shop` is NOT explicitly cased** and falls through to the mechanic nav. That's intentional per the PERSONA_CONFIG comment ("shop reuses ops surfaces until a dedicated admin layout exists"), but it means the brief's "shop sees vendors / invoices / accounting" expectations don't match observed behavior — see `Discrepancies` section below.

---

## Contract per persona

For each persona, three sections:
- **A. Should-see** — what the brief's "default for missing" rules + spec stipulate.
- **B. Currently-sees** — what AppLayout actually renders today (from the static arrays).
- **C. Diff** — items missing or extra; flagged for future cleanup, NOT auto-fixed in this pass.

---

### Owner (Aircraft Owner)

#### A. Should-see (per brief defaults + spec)
- Nav: Home (`/my-aircraft`), Inbox (`/inbox`), Aircraft (`/aircraft`), Compliance (`/compliance`), Inspections (`/inspections`), Continued (`/continued`), Approvals (`/approvals`), Telemetry, Economics (`/economics`), Tax P&L (`/reports/tax-pnl`), My Day (`/my-day`), Ask (`/ask`), Costs (`/costs`).
- Direct-URL access: All of the above + `/aircraft/[id]/economics`, `/aircraft/[id]/components`.
- NOT in nav, NOT accessible: `/org/*` (admin-only), `/work-orders/*` (mechanic+shop+admin), `/scheduler` etc. (mechanic+shop+admin), `/billing-rates` etc. (shop+admin).

#### B. Currently-sees (from `ownerNavItems`, lines 61–92)
1. Home → `/my-aircraft` ✓
2. AI Inbox → `/inbox` ✓
3. Aircraft → `/aircraft` ✓
4. Ask / AI Command → `/ask` ✓
5. Compliance → `/compliance` ✓
6. Costs → `/costs` (module: `owner-finances`, suppressible) ✓
7. Expirations → `/documents/expiring`
8. Inspections → `/inspections` ✓
9. Continued → `/continued` ✓
10. Approvals → `/approvals` ✓
11. Parts → `/parts` ⚠ (per brief defaults, parts is mechanic+shop+admin only)
12. Purchase orders → `/purchase-orders` ⚠ (same)
13. Vendors → `/vendors` ⚠ (per brief defaults, shop+admin only)
14. Tools → `/tools` ⚠ (per brief defaults, mechanic+shop+admin only)
15. Time clock → `/time-clock` ⚠ (per brief defaults, mechanic+shop+admin only)
16. Scheduler → `/scheduler` ⚠
17. Time Off → `/time-off` ⚠
18. Clock In/Out → `/clock` ⚠
19. Meters → `/meters`
20. Locations → `/locations`
21. Marketplace → `/marketplace`
22. Users → `/settings`

Owner also sees the persona switcher (lines 717+) which exposes Mechanic personas if the user has a mechanic membership.

#### C. Diff (Owner vs brief defaults)

**In nav but per brief shouldn't be (10 items):**
- Parts, Purchase orders, Vendors, Tools, Time clock, Scheduler, Time Off, Clock In/Out, Meters, Locations.

**Missing from nav per brief defaults:**
- Telemetry (no `/telemetry` route exists in the deployed app — flagged below).
- Economics (the smoke test showed economics lives under `/aircraft/[id]/economics`, not as a top-level route).
- Tax P&L (`/reports/tax-pnl` exists but isn't in owner nav — only reachable via direct URL).
- My Day (`/my-day` exists but the owner nav uses `/my-aircraft` as Home; My Day is mechanic's home).
- Bookmarks (`/org/bookmarks` exists but is admin-only currently).

**Action:** owner nav surfaces a "shop foreman" expansion of capabilities (parts/vendors/scheduler/etc.) — likely intentional for single-aircraft owners who self-maintain, but worth a product call. Logged here, not auto-changed.

---

### Mechanic (A&P Technician)

#### A. Should-see (per brief defaults + spec)
- Nav: Home (`/my-day`), Inbox (`/inbox`), Aircraft (`/aircraft`), Work Orders (`/work-orders`), Parts (`/parts`), Tools (`/tools`), Documents (`/documents`), Compliance, Inspections, Continued, Approvals, Scheduler, Time Off, Clock, Telemetry, Ask.
- Direct-URL access: above + per-aircraft drilldowns.
- NOT in nav: `/org/*`, `/economics`, `/reports/tax-pnl`, `/billing-rates`, `/accounting/*`.

#### B. Currently-sees (from `buildMechanicNav(perm)`, lines 103–168)

The mechanic nav is **permission-gated**, not just persona-gated. Each item appears only if the corresponding `MechanicPermissions` field is true. Default mechanic permissions (need to read `lib/persona/defaults.ts` to confirm):
1. AI Inbox (`/inbox`) — always shown
2. AI Command Center (`/workspace`) — `perm.aiCommandCenter`
3. My Day (`/my-day`) — `perm.dashboard`
4. Aircraft (`/mechanic?tab=aircraft`) — `perm.aircraft`, badge=3
5. Workflow (`/workflow`) — always shown
6. Parts (`/mechanic?tab=parts`) — always shown
7. Manuals (`/manuals`) — always shown
8. Logbook (`/mechanic?tab=logbook`) — `perm.logbook`, badge=3
9. (settingsFull permission gates a much larger block: Compliance, Expirations, Inspections, Continued, Approvals, Parts again, POs, Vendors, Tools, Time clock, Workforce group)

#### C. Diff (Mechanic vs brief defaults)

**Brief expects:**
- `/work-orders` as a top-level entry → currently routed through `/workflow` instead. The route `/work-orders` exists (smoke test confirmed) but mechanic nav doesn't link to it directly.
- `/documents` for mechanics → currently NOT in mechanic nav (comment says "Documents lives under Admin now — mechanics don't see it"). Conflict with brief.
- Telemetry → no `/telemetry` route.

**Mechanic nav uses `/mechanic?tab=parts` URL pattern,** which combines query-string-driven tab navigation. Brief assumes flat top-level routes. Both patterns work; the existing one was an explicit decision (Operations Hub retirement, per code comment).

---

### Shop (Shop Foreman)

#### A. Should-see (per brief)
- Everything mechanic sees + Vendors, Invoices, Billing Rates, Accounting, Customer Portal Settings.
- `homeRoute = '/dashboard/ops'` per PERSONA_CONFIG.

#### B. Currently-sees
- **`shop` is NOT cased in the dispatch.** Falls through to `buildMechanicNav(activeMechanic.permissions)`. So shop sees the same nav as mechanic — gated by `MechanicPermissions`, not by `shop`-specific items.
- `homeRoute='/workflow'` (✅ updated 2026-05-08, was `/dashboard/ops`). The previous `/dashboard/ops` route exists as a server-side redirect to `/workflow`, so sign-in as shop never 404'd — but it added a wasted hop. Pointing `homeRoute` directly at `/workflow` skips the redirect.

#### C. Diff
- ~~**CRITICAL gap:** PERSONA_CONFIG says `shop.homeRoute = '/dashboard/ops'`, but that route doesn't exist.~~ **RESOLVED 2026-05-08.** Audit-doc finding was incorrect: `/dashboard/ops` does exist as a redirect-only route at `apps/web/app/(app)/dashboard/ops/page.tsx` that redirects to `/workflow`. Shop persona never 404'd; it landed on `/workflow` after one hop. To skip the hop, `PERSONA_CONFIG.shop.homeRoute` was changed to `/workflow` directly. The redirect file is preserved for saved bookmarks.
- Shop persona doesn't see distinct shop-only items (invoices/billing-rates/QBO push) because those don't exist as routes either.
- Effectively shop ≈ mechanic-with-full-permissions today.

---

### Admin (Platform Admin)

#### A. Should-see (per brief)
- All `/org/*` admin pages, plus a smaller set of admin-only platform pages.

#### B. Currently-sees (from `adminNavItems`, lines 346–351)
1. Admin Console → `/admin`
2. All Documents → `/documents`
3. Ingestion Health → `/admin/ingestion-health`
4. Marketing CMS → `/admin/content`

#### C. Diff
- **Missing from admin nav per brief:** `/org/settings`, `/org/billing`, `/org/integrations/*`, `/org/invite`, `/org/bookmarks`, `/org/bulk-updates`, `/org/trash`, `/org/info`, `/org/directory`. The smoke test confirmed all these `/org/*` routes render correctly when accessed by an admin/owner who has org-admin role — they exist, but the admin persona's *sidebar* only surfaces 4 platform-admin entries. To reach `/org/billing` etc., the user has to switch to owner persona first.
- This may be intentional ("admin" persona == platform-staff, not org-admin), but the brief conflates the two. Logged for product call.

---

## Routes referenced in the brief that DO NOT exist in the deployed app

The Phase 2 nav reorg references many routes that aren't in `apps/web/app/(app)/**`. Per the brief's instruction ("must already exist OR be flagged in the report — DO NOT create them"):

| Brief route | Status |
|---|---|
| `/telemetry` | Does not exist. Per-aircraft telemetry lives at `/aircraft/[id]/sync` and on the Smart Home cards. |
| `/economics` (top-level) | Does not exist. Per-aircraft economics at `/aircraft/[id]/economics`. |
| `/reports/profitability` | Does not exist. |
| `/billing-rates` | Does not exist. Labor rates live in `/org/settings`. |
| `/accounting/qbo-push` | Does not exist. QBO is at `/org/integrations/qbo`. |
| `/parts/cores` | Does not exist. Cores live in the aircraft component tree (`/aircraft/[id]/components`). |
| `/ai/predictions` | Does not exist. Predictions surface inside the AI Inbox. |
| `/ai/voice-notes` | Does not exist. Voice input is the floating VoiceButton on home surfaces. |
| `/ai/receipts` | Does not exist. Receipt intake is `/costs/intake`. |
| `/org/customer-portal` | Does not exist. Customer-portal config lives in `/org/settings`. |
| `/org/notifications` | Does not exist. Notification prefs live in `/org/settings`. |
| `/dashboard/ops` (shop home) | EXISTS as redirect → `/workflow`. (Was incorrectly logged as missing in the first-pass audit; corrected 2026-05-08.) |

---

## Per-page persona-gating audit (page-level redirects)

The brief asks: "every protected route needs either `<RequirePersona>` wrapper OR an in-component check `if (!ALLOWED.includes(persona)) return <Redirect to="/home" />`".

**Finding:** the deployed app uses a different (and arguably more robust) pattern: server-side `requireAppServerSession()` + Supabase RLS at the data layer. Page components are server components that fetch data via the user's session; if RLS rejects, the data is empty and the page renders an empty state (no redirect). Where role-based access matters (e.g. `/org/*`), the page checks `membership.role` server-side.

There is **no `<RequirePersona>` component** in the codebase (grep confirmed). Adding one would create a parallel auth layer that competes with the existing RLS-first model — that's an architecture call the brief doesn't have authority to make autonomously.

**What I observed in the smoke test (Owner persona, full org-admin):**
- All `/org/*` paths render correctly under owner + admin role.
- Mechanic-only paths (`/work-orders`, `/parts`, etc.) also render under owner — the data is filtered by RLS, not by persona-gate.
- This is consistent with the "owner who self-maintains" model where the same person wears multiple hats.

**Recommendation (logged, not auto-applied):** if persona-strict gating is genuinely needed (e.g. mechanic should be redirected from `/org/billing`), implement it server-side in the page component using `getCurrentPersona()` from `lib/persona/server.ts`, returning a `redirect('/my-day')` for the wrong persona. Don't introduce `<RequirePersona>` as a client wrapper — too easy to bypass and creates dual-source-of-truth with the server checks.

---

## Summary for the overnight report

Phase 1 produced this contract document as the read-only deliverable. The brief's "auto-fix missing personas[] arrays" instruction doesn't map onto the actual nav architecture. The brief's "auto-add `<RequirePersona>` wrapper" instruction would create a parallel auth layer that competes with the existing RLS-first server-side model. Both were logged and skipped per HARD STOP rule 8 (ambiguous → log, skip).

Concrete items the operator should triage:
1. ~~**Shop persona has a broken `homeRoute`** (`/dashboard/ops` doesn't exist) — sign-in as `shop` likely 404s or fallbacks.~~ **RESOLVED 2026-05-08:** `/dashboard/ops` actually exists as a redirect to `/workflow`; `PERSONA_CONFIG.shop.homeRoute` updated to point directly at `/workflow` to skip the redirect hop.
2. **Owner nav contains many shop/mechanic items** (parts, vendors, scheduler, time-off, etc.) — possibly intentional for single-aircraft owners but worth verifying against the persona spec.
3. **Admin persona's sidebar omits all `/org/*` paths** — admin can only reach them by switching to owner. May or may not be intended.
4. **12 routes in the brief don't exist** in the deployed app (table above) — Phase 2 nav reorg should be revised before any nav restructuring lands.

No code changes were made in Phase 1. AppLayout.tsx was read-only audited.
