# Phase 15 — Marketing Site Issues

Captured 2026-05-09 during Sprint 15.1.

## Pages verified

| URL | Status | Notes |
|---|---|---|
| https://www.myaircraft.us/pricing | ✅ Renders | Phase 14 design live: hero, 3 tier cards ($99/$149/Free), volume table (1-5/6-15/16+), feature comparison, add-ons (Standard QA $50/hr, Expert A&P $150/hr), 5-question FAQ |
| https://www.myaircraft.us/terms | ✅ Renders | Phase 14 sections present: 4. Per-Aircraft Tiers, 4a. Processing Tiers — SLA Promises, 4b. Human Review (Available v2). Last updated April 1, 2026. |
| https://www.myaircraft.us/security | 🔴 Renders Dashboard | The /security URL serves the logged-in Dashboard instead of the security page. Likely tenant-routing middleware interpreting `security` as a tenant slug. The page exists in the source (`apps/web/app/security/page.tsx`) but production routing doesn't reach it. |
| https://www.myaircraft.us/privacy | (skipped — same /security middleware risk; verify in next sprint) |
| https://www.myaircraft.us/ (homepage) | (skipped — covered in homepage screenshot above) |

## Issues found

### 🔴 P0: /security route shadowed by tenant routing

- **Symptom**: navigating to `/security` renders the Dashboard for the
  authenticated user.
- **Likely root cause**: `apps/web/middleware.ts` + `lib/auth/tenant-routing.ts`
  treat the first path segment as a tenant slug for app routes. `security`
  isn't in `RESERVED_TOP_LEVEL_SEGMENTS`, so it falls through to tenant
  resolution, which puts the user on their tenant's dashboard.
- **Fix**: Add `'security'` to `RESERVED_TOP_LEVEL_SEGMENTS` (and update
  the matcher in middleware.ts to skip it). Same one-line fix used when
  /privacy + /terms were added.
- **Severity**: P0 — public marketing page is unreachable.

### 🟡 P2: Pricing page <title> still references legacy persona-based copy

- **Current**: `<title>Pricing — Simple plans for owners, mechanics, and fleets | myaircraft.us</title>`
- **Expected**: Phase 14 messaging ("pay per aircraft, no long contracts").
- **Source**: `apps/web/app/pricing/page.tsx` — `metadata.title` in the
  Next.js Metadata API.
- **Severity**: P2 — SEO-relevant but doesn't break the page; quick fix.

### 🟡 P3: Footer "Careers" link is greyed-out placeholder

- Footer uses `<span>` with disabled styling for "Careers" + "Cookie
  Policy" — no live destination.
- Fine to leave as-is for now; flag for future polish.

## What worked

- **Pricing page Phase 14 layout matches `pricing-config.ts` byte-for-byte.**
  Volume math (1-5: $99/$149, 6-15: $79/$129, 16+: $59/$109), feature
  comparison row counts, add-on pricing — all derived from constants.
- **Terms page Phase 14 sections present** with SLA copy that matches
  TIER_DEFINITIONS and the locked human-review rates.
- **Footer references** Privacy / Terms / Security / Cookie Policy — the
  Security link now goes somewhere (even if mis-routed).

## Network + console

- No 4xx/5xx network responses observed on /pricing or /terms.
- Console messages tool reported no captured messages (page loaded
  before tool was called — not a real signal of cleanliness).
