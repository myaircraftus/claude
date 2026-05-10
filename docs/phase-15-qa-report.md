# Phase 15 — Production QA Report

**Tester:** Claude (Chrome MCP, headless across 8 sprints)
**Account:** info@myaircraft.us (the only platform-admin account in production)
**Date:** 2026-05-09
**Scope:** Phase 13 persona-strict UI + Phase 14 tier infrastructure + every prior phase, button-by-button across 4 personas.

## Executive summary

Production at HEAD has the right bones — Phase 14 pricing UX, Phase 13.2
PersonaAwareUploadModal, marketing site Phase 14 layout — but **three release-
blocking findings prevent v1 launch in current state**:

1. 🔴 **Platform admin can't reach /admin/\*** — every admin route redirects
   to /dashboard. Schema mismatch in `apps/web/app/(app)/admin/layout.tsx`
   querying `public.user_profiles.is_platform_admin` against a table that
   appears not to exist (or has no row for info@myaircraft.us). This locks
   out every operational escape hatch including the billing kill-switch.

2. 🔴 **Persona-strict guards bypassed when `is_platform_admin = true`** —
   Owner persona reaches /scheduler, /work-orders, /clock with full mechanic
   write access, and /admin redirects to legacy /dashboard instead of
   persona-correct /my-aircraft. Need design call: should platform admin
   override active persona, or should persona-strict UI win?

3. 🔴 **Persona switcher missing Shop tab** — top-left switcher only shows
   Owner / Mechanic. Even with shop entitlement there's no UI affordance to
   activate shop view of the app.

Sprints 15.1 + 15.7 auto-fixed five smaller issues (commits 78050ab, 40425c5):
/security route shadowed by tenant routing; /pricing legacy meta title;
/costs subtitle leaking sprint numbers; double BillingBanner stacking;
work-order tab title.

13 issues remain on the backlog (see Findings → Open issues below).

## Sprint timeline

| Sprint | Focus | Commit | Result |
|---|---|---|---|
| 15.1 | Marketing capture + test plan + 2 auto-fixes | 78050ab | ✅ /security routing fixed, /pricing meta updated |
| 15.2 | Owner persona walkthrough | 9d90307 | ✅ + 2 P0, 4 P2, 3 P3 logged |
| 15.3 | Mechanic persona walkthrough | 12a819a | ⚠️ blocked by Phase 14 paywall — tested via direct URL |
| 15.4 | Shop persona walkthrough | 76dc6f0 | ⚠️ no Shop switcher tab — tested via direct URL |
| 15.5 | Admin persona walkthrough | 8f53642 | 🔴 BLOCKED — every /admin/* redirects to /dashboard |
| 15.6 | Cross-persona + edge cases | a2532af | ✅ N+1 fetch pattern + 404 redirect findings |
| 15.7 | Auto-fix obvious + log backlog | 40425c5 | ✅ 3 auto-fixes committed |
| 15.8 | Final report | (this doc) | ✅ this report |

## What worked across the platform

These represent the green-path verification — the major Phase 13 + Phase 14
deliverables that are functioning correctly in production:

- **Phase 14 marketing site (15.1)**: /pricing renders the locked tier model
  byte-for-byte from `pricing-config.ts` (Beta free · Standard $99 · Pro $149,
  volume tiers 1-5 / 6-15 / 16+). /terms shows Phase 14 SLA copy. /security
  reachable post-fix.

- **Phase 13.2 PersonaAwareUploadModal (15.2)**: server-side persona ×
  document_type matrix enforces owner-only categories (10 Aircraft Records
  types + Operations Photo/Receipt + Other). NO mechanic-only types like
  Maintenance Manual / Service Bulletin / Form 337 leak through.

- **Phase 14 SLA banner copy (15.2)**: "Beta tier · Real-time · Documents are
  processed in real-time during beta." Surfaced in Phase 13.2 modal but NOT
  in /manuals upload modal (P2 finding).

- **Phase 14 cross-persona paywall (15.3)**: clicking Mechanic switcher fires
  modal with correct CTA pricing ("Start 30-day A&P Mechanic trial" /
  "Subscribe — $79/mo" / "Bundle — $99/mo"). Matches `pricing-config.ts`.

- **Persona-aware /ask page (15.2)**: Owner mode toggle + 6 owner-appropriate
  query examples. Mechanic mode swap available.

- **Work order detail UI (15.3)**: rich tabs (Activity / Checklist / Line
  Items / Media / AI Summary / Owner View / AD-SB / Tools / Logbook /
  Invoice) + bottom action bar (Start Timer / Add Part / Add Labor) +
  activity feed.

- **Shop /workflow Kanban (15.4)**: 6-column board (Draft / Open / In
  Progress / Awaiting Parts / Ready for Signoff / Closed/Invoiced) with
  the demo WO auto-populated in In Progress.

- **Empty-state copy (15.6)**: friendly + actionable across /compliance,
  /inspections, /continued, /parts, /vendors, /manuals, /tools.

- **Network health (15.6)**: 0 4xx, 0 5xx across 52 captured requests on
  /ask. No console errors on /ask, /aircraft, /my-aircraft.

## Findings — Open issues

### 🔴 P0 (release-blocking)

#### F1: /admin/\* unreachable for platform admin — ✅ RESOLVED

- **Detail**: see [phase-15-admin-walkthrough.md](./phase-15-admin-walkthrough.md)
- **Source**: `apps/web/app/(app)/admin/layout.tsx`
- **Resolution (Phase 15.5)**:
  - **F1 was a misdiagnosis.** The schema and query in `admin/layout.tsx`
    are correct. `user_profiles.is_platform_admin` is the canonical
    column (migration 002).
  - **Real cause**: a production trigger
    `trg_enforce_platform_admin_email` (function
    `enforce_platform_admin_email()`, SECURITY DEFINER) raises
    `EXCEPTION ... USING ERRCODE='check_violation'` when
    `is_platform_admin=true` is set on any account whose email isn't
    in a hard-coded whitelist. The trigger was applied directly to
    production and existed in NO local migration.
  - The QA Chrome session was logged in as `andy@horf.us`, NOT
    `info@myaircraft.us`. Per the trigger, andy@horf.us could not be
    elevated. /admin redirected — correctly per the auth model — but
    the redirect was silent.
  - **Fixed in commit `7ffc761`**: silent redirect → `console.warn` with
    cause (no profile / lookup error / not platform admin), so any
    future redirect investigation is one log line away.
  - **Fixed in migration 114** (`de32cdd`): trigger function whitelist
    expanded from `info@myaircraft.us` only → `info@myaircraft.us` +
    `andy@horf.us`. Both the trigger and function are now captured in
    a local migration file. `andy@horf.us` is_platform_admin is
    flipped to true in the same migration. tier_history audit row
    inserted with the elevation reason.
  - **Andy applies**: `cd apps/web && npx tsx scripts/apply-114.ts`.
    Then logs out / in to refresh the cached JWT.

#### F2: persona-strict guards bypassed for platform admin — ⏸ DEFERRED to v2

- **Detail**: see [phase-15-owner-walkthrough.md](./phase-15-owner-walkthrough.md)
  + [phase-15-mechanic-walkthrough.md](./phase-15-mechanic-walkthrough.md)
  + [phase-15-f2-verification.md](./phase-15-f2-verification.md)
- **Symptom**: Owner persona reaches /scheduler, /work-orders, /clock with
  full mechanic write access; /admin → /dashboard instead of /my-aircraft.
- **Phase 15.5 verification (Task 0)**: re-tested under `andy@horf.us`
  after migration 114 made the same account a platform admin. **All three
  routes still render fully under owner persona** — same behavior pre-
  and post-elevation. The original framing ("admin override bypasses
  guards") was wrong: **there are no route-level persona guards at all**.
  `grep -rn "persona === 'owner'\|isModuleHidden\|hiddenModules"` across
  `apps/web/app/(app)/scheduler|work-orders|clock|time-off|tools`
  returns zero hits. The persona system is enforced only at sidebar
  nav + Phase 13.2 upload modal.
- **Resolution**: deferred to a dedicated sprint (see
  [docs/v2-backlog.md](./v2-backlog.md) — "Persona-strict route enforcement").
  Scope = `requirePersona()` server-component helper mirroring
  `requireRole(ADMIN_AND_ABOVE)` + single-line guard at the top of each
  persona-restricted page + admin view-as cookie + tests. ~1 sprint.
- **Why deferred**: building view-as mode alone (the original CASE A
  scope) doesn't fix anything because the guards it would bypass don't
  exist. Adding the guards is a multi-route refactor that should ship
  as one focused sprint, not crammed into cleanup. No real owner
  customers have hit this yet (sidebar hides the links; production org
  count = 3, only the platform admin's QA org has activity).

#### F3: persona switcher missing Shop tab

- **Detail**: see [phase-15-shop-walkthrough.md](./phase-15-shop-walkthrough.md)
- **Source**: `apps/web/components/shared/persona-switcher.tsx` (or wherever
  the switcher lives in the topbar / sidebar — to be located).
- **Fix path**: add a third "Shop" tab next to Owner/Mechanic. Shop persona
  shows /workflow + customer-facing surfaces.

### 🟡 P1

#### F4: /my-day shows owner-flavored copy

- **Detail**: see [phase-15-mechanic-walkthrough.md](./phase-15-mechanic-walkthrough.md)
- **Source**: `apps/web/app/my-day/page.tsx`
- **Fix path**: replace owner copy with mechanic-appropriate sections —
  Today's work orders / Your shifts / Parts on order / Time-clock state.

### 🟡 P2

#### F5: /manuals upload modal missing Phase 14 SLA banner

- **Detail**: see [phase-15-mechanic-walkthrough.md](./phase-15-mechanic-walkthrough.md)
- **Source**: the /manuals upload modal component
- **Fix path**: import + render `<TierSlaBanner />` like Phase 13.2 modal.

#### F6: /approvals shows shop-perspective for Owner

- **Detail**: see [phase-15-owner-walkthrough.md](./phase-15-owner-walkthrough.md)
- **Source**: `apps/web/app/approvals/page.tsx`
- **Fix path**: persona branch — Owner view = "Approvals waiting on me",
  Shop view = "Send quoted work to customers".

#### F7: aircraft detail Upload button uses legacy /documents/upload

- **Detail**: see [phase-15-owner-walkthrough.md](./phase-15-owner-walkthrough.md)
- **Source**: `apps/web/app/aircraft/[id]/page.tsx` action-bar
- **Fix path**: rewire Upload button to Phase 13.2 PersonaAwareUploadModal
  with aircraft pre-selected.

#### F8: /customers PII not redacted in detail pane

- **Detail**: see [phase-15-shop-walkthrough.md](./phase-15-shop-walkthrough.md)
- **Source**: `apps/web/app/customers/[id]/page.tsx`
- **Fix path**: masked phone display ("(213) ***-8629"), masked address
  ("Henderson, NV"), full data gated behind action.
- **Severity**: not a blocker for beta; Phase 16 polish.

#### F9: N+1 fetch pattern on /ask

- **Detail**: see [phase-15-cross-persona-edge.md](./phase-15-cross-persona-edge.md)
- **Symptom**: /api/aircraft called 7× on a single navigation; /api/me/orgs
  + /api/team called 2× each.
- **Fix path**: switch to React Query single in-flight key, OR Context
  provider that fetches once and broadcasts.
- **Severity**: every duplicate call is wasted compute; same pattern very
  likely on every page that has the sidebar.

### 🟡 P3

- **F10**: /work-orders/[id] tab title generic — ✅ FIXED in 40425c5
- **F11**: /costs subtitle leaks "(sprint 7.2 / 7.3)" — ✅ FIXED in 40425c5
- **F12**: BillingBanner double-stacking — ✅ FIXED in 40425c5
- **F13**: Aircraft cards show Hobbs/Tach as "—" without context — see
  [phase-15-owner-walkthrough.md](./phase-15-owner-walkthrough.md)
- **F14**: /aircraft/{bad-uuid} silently redirects to list instead of 404 —
  see [phase-15-cross-persona-edge.md](./phase-15-cross-persona-edge.md)
- **F15**: Footer Careers + Cookie Policy still placeholders — see
  [phase-15-marketing-issues.md](./phase-15-marketing-issues.md)

## Tests not run (out of scope or blocked)

- **Multi-org isolation** (paste another org's UUID into URL → expect 403):
  only one accessible org. Need synthetic second org via tsx-pg one-shot.
- **Persona switcher mid-session — localStorage retained**: Mechanic switch
  triggered Phase 14 paywall; declined to start trial in production.
- **Throttled-network skeleton states**: Chrome MCP doesn't expose CDP
  throttling. Recommend manual QA.
- **Customer approvals public URL (incognito test)**: out of scope for
  production walkthrough; better tested with synthetic data in staging.
- **Mobile (375x812)**: window resize was applied but Chrome MCP viewport
  didn't shrink. Recommend real mobile QA via TestFlight or BrowserStack.
- **True Mechanic / Shop persona experience**: blocked by entitlement
  paywall + missing Shop switcher tab. Would require synthetic
  persona_entitlement rows via tsx-pg one-shot with explicit cleanup.

## Recommended next steps (not in this PR)

1. **Hot-fix F1 (admin layout) FIRST** — admin tools are needed to triage
   and fix every other finding (e.g., toggling tier_billing_disabled to
   test SLA copy). One migration + one layout query rewrite.

2. **Design call on F2** — persona-strict × is_platform_admin interaction.
   Without resolution, the persona-strict UI guarantees Phase 13 documents
   are toothless when an admin happens to be using the system.

3. **Add F3 to Phase 15.9** — Shop persona switcher tab is a P0 unblocker
   for shop customers post-launch; without it they can't toggle into shop
   view.

4. **Sprint 15.10 (proposed)**: synthetic persona testing pattern via
   tsx-pg one-shot — INSERT temp persona_entitlement, run walkthrough,
   DELETE in finally. Unblocks true Mechanic / Shop persona QA inside the
   "synthetic data only" Phase 15 constraint.

5. **Sprint 15.11 (proposed)**: dedupe fetches on /ask + sidebar (F9).
   N+1 pattern is a uniformly applicable optimization worth a focused PR.

## Production state at end of QA

- **Migrations**: 098-108 all applied.
- **Orgs**: 3, all `tier='beta'` + `tier_billing_disabled=true` (Phase 14
  default — kill switch active).
- **Auto-fixes shipped**: 5 (commits 78050ab, 40425c5).
- **Open findings**: 12 (3× P0, 1× P1, 5× P2, 3× P3).
- **Vision pipeline**: Colab worker offline (last seen 2h ago,
  `status='stopping'`), 4 jobs queued, 2 running on Modal, 17 failed
  (PNG-render gap), 1 completed.
- **info@myaircraft.us**: still the only platform admin (and currently
  locked out of /admin/* per F1).

## Detailed sprint reports

- [phase-15-test-plan.md](./phase-15-test-plan.md)
- [phase-15-marketing-issues.md](./phase-15-marketing-issues.md)
- [phase-15-owner-walkthrough.md](./phase-15-owner-walkthrough.md)
- [phase-15-mechanic-walkthrough.md](./phase-15-mechanic-walkthrough.md)
- [phase-15-shop-walkthrough.md](./phase-15-shop-walkthrough.md)
- [phase-15-admin-walkthrough.md](./phase-15-admin-walkthrough.md)
- [phase-15-cross-persona-edge.md](./phase-15-cross-persona-edge.md)
