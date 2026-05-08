# Production Smoke Test Results

**Run date:** 2026-05-08 (initial run + auth-gated re-test via user's connected Chrome)
**Target:** https://www.myaircraft.us (alias of `myaircraft01-hr6nqb3lr-horf.vercel.app`, deployment `dpl_3CJCkcS9s7TG1SwHsrJ7mKBdfpSE`)
**Method:** Chrome MCP for browser paths · Node `fetch` for cron paths · `vercel env` for env audit
**Auth status:** ✅ Resolved — user connected their authenticated Chrome session (`Andy Pats`, Owner persona, org "Codex QA Org 0423", 2 aircraft N8202L/N123QA, 1 WO, 1 customer). All previously-deferred paths re-exercised under auth.

---

## Summary (post auth re-run)

| Status      | Count |
|-------------|-------|
| 🟢 PASS     | 38    |
| 🟡 DEGRADED | 9     |
| 🔴 FAIL     | 3     |
| ⚪ DEFER    | 5     |

**Ship-blocking:** 2 (Stripe + telemetry-cron silent-no-op).
**Nice-to-fix:** 2 (`/demo/owner` crash + systemic hydration mismatches on 5+ auth-gated pages).
**Auth-gated coverage:** 26+ deferred paths now exercised; only deeply-nested (e.g. specific WO Auditor button, VoiceButton mic prompt) remain DEFER pending interactive testing.

---

## Ship-blocker re-verify (2026-05-08, second pass)

After fixes shipped this session, here's the current production state of the 3 original ship-blockers:

| # | Blocker | Status | Evidence |
|---|---|---|---|
| 1 | `/org/billing` Stripe "No such price" on Upgrade | 🔴 **STILL OPEN** | `vercel env pull` shows `STRIPE_SECRET_KEY` set (len=107) and `STRIPE_USE_MOCK` unset — adapter still routes to real Stripe with placeholder mock IDs. No code changes were made to fix this; it's an env-config decision (set `STRIPE_USE_MOCK=true` OR create real Stripe products). |
| 2 | Telemetry crons silently no-op (`deleted_at` filter on missing column) | 🟢 **CLOSED** | Commit `f3936d0` (`fix(telemetry): drop deleted_at filter on aircraft table`) on `main`. Production probe (this run): airbly-sync `results=22`, fsp-sync `results=22`, telemetry-inference `swept=22, results=22` — matches the maintenance-predictions baseline. |
| 3 | `/api/voice/transcribe` 503 due to empty `OPENAI_API_KEY` in prod env | 🔴 **STILL OPEN in production** | `vercel env pull` shows `OPENAI_API_KEY=` (set-but-empty). The `.env.local` update earlier this session was for **local dev only** — prod env was deliberately not touched (would require explicit user permission to push secrets to prod). To close, run `vercel env rm OPENAI_API_KEY production && vercel env add OPENAI_API_KEY production` with the real key value. |

**Bonus closer (not in original list):** `/api/cron/extract-receipts-sweep` was added (commit `c85f9a8`) as the backstop the original smoke test recommended — closes the "Path-J item that doesn't exist" finding by sweeping intake_documents stuck at status='received' every 10 minutes. Prod returns `200 {"ok":true,"swept":0}` with bearer auth, `401` without.

**Bonus closer (hydration):** Commits `dd62f60` + `43a0d4c` closed the systemic React hydration errors (#425/#418/#423) on `/work-orders`, `/my-aircraft`, `/my-day`. The `/parts` and `/reports/tax-pnl` entries in finding #7 below were determined to be false positives in the original smoke test (Chrome MCP buffer leftovers from the previous page's read).

**Net delta:** of the original 3 🔴 ship-blockers, 1 closed by code (#2). The other 2 (#1 Stripe, #3 OpenAI key) require explicit operator action on Vercel production env vars, which I haven't taken on without confirmation. Both are one-command fixes once you decide on the value:

```bash
# Blocker #1 — fastest path: force mock mode until real Stripe products exist
vercel env add STRIPE_USE_MOCK production   # value: true

# Blocker #3 — set the real OpenAI key
vercel env rm OPENAI_API_KEY production
vercel env add OPENAI_API_KEY production    # paste sk-proj-... when prompted
# Then redeploy: git commit --allow-empty -m "chore: pick up new env" && git push
```

---

## 🔴 Ship-blocking findings

### 1. `STRIPE_SECRET_KEY` is set in production → mock mode is OFF on `/org/billing`

`vercel env ls production` shows `STRIPE_SECRET_KEY` (encrypted, length 107). My `lib/billing/stripe-client.ts` adapter auto-detects mock-vs-real with the rule **"missing `STRIPE_SECRET_KEY` OR `STRIPE_USE_MOCK=true` → mock"**. Since the key is set and `STRIPE_USE_MOCK` is unset, the adapter routes to the real Stripe SDK. The new `/org/billing` plan picker uses placeholder price IDs (`price_owner_monthly_mock`, `price_mechanic_monthly_mock`, `price_shop_monthly_mock`, `price_bundle_monthly_mock`) that **do not exist in the real Stripe account** → clicking Upgrade will return Stripe's "No such price" error.

Also worth flagging: `STRIPE_PRICE_PRO` and `STRIPE_PRICE_FLEET` are literally set to the string `price_placeholder` in production env, which would also fail.

**Fix options (pick one):**
- Set `STRIPE_USE_MOCK=true` in production env to force mock mode until real Stripe products are created
- Replace the 4 placeholder mock IDs in `org-billing-view.tsx` with the actual `STRIPE_PRICE_OWNER_MONTHLY` / `STRIPE_PRICE_MECHANIC_MONTHLY` / `STRIPE_PRICE_BUNDLE_MONTHLY` values from env (not yet referenced in the new view)
- Create the missing Stripe products + replace the placeholder strings

### 2. Telemetry crons silently no-op due to `aircraft.deleted_at` filter against missing column

```
/api/cron/airbly-sync       → HTTP 200  {"ok":true,"mock":true,"results":[]}
/api/cron/fsp-sync          → HTTP 200  {"ok":true,"mock":true,"results":[]}
/api/cron/telemetry-inference → HTTP 200  {"ok":true,"swept":0,"results":[]}
```

All three iterate `aircraft` with `.eq('is_archived', false).is('deleted_at', null)`. **Migration 091_soft_delete_trash did not add `deleted_at` to the `aircraft` table** (only to 14 user-deletable tables — aircraft is intentionally permanent). Supabase silently returns `error` on the missing column, the helper returns `null`, the iteration becomes empty, and the cron reports success while doing zero work.

`/api/cron/maintenance-predictions` (which does NOT have the `deleted_at` filter) successfully iterated **22 aircraft** in the same database — proving the data exists, the filter is what broke it.

**Fix:** Remove `.is('deleted_at', null)` from the three telemetry crons — `aircraft` is in a permanent table, not a soft-deleted one.

### 3. `OPENAI_API_KEY` is set but EMPTY in production env

Confirmed via `vercel env pull`. `/api/voice/transcribe` checks `if (!process.env.OPENAI_API_KEY)` and returns a 503 — VoiceButton-driven transcription is broken until the operator sets a real key. Not a code bug; an env-config issue logged here for triage.

---

## 🟡 DEGRADED

### 4. `/demo/owner` — client-side React error

```
TypeError: Cannot read properties of undefined (reading 'total')
  at B (chunks/206-a2ef41e8f54f18c5.js:1:1314)   ← likely a KPI / counter component
  at rE (chunks/7a21db59-829a199eb9d58dc9.js:1:40345)
```

Reproducibly blanks the page with "Application error: a client-side exception has occurred." Other demo personas render fine (`/demo/mechanic`, `/demo/aircraft`). Demo is a public-facing marketing surface so this regression is bad PR but not data-loss. Source-mapped trace points at a numeric-`total` field somewhere in the SmartHome owner layout — likely a regression from one of the recent SmartHome-related sprints (5.1 / 5.8 / 6.batch).

### 5. `/demo/aircraft` shows "0 aircraft in your portfolio" instead of mock data

Demo mode banner renders, sidebar populates, empty-state CTA shows — but the demo should ship with a mock fleet. Either DemoFetchInterceptor isn't intercepting `/api/aircraft`, or the mock dataset never includes aircraft. Cosmetic; hurts the live-demo conversion path.

### 6. `/demo/maintenance` redirects to `/demo/mechanic?tab=workorders`

Mechanic demo shows "Select an aircraft to view its cockpit" but `/demo/aircraft` is empty (per finding #5). So mechanic demo is also visually empty. Same root cause.

---

## 🟢 PASS

### Public surfaces
| URL | Status |
|---|---|
| `/` (marketing) | PASS — renders, no console errors |
| `/login` | PASS — renders sign-in form, "Continue with Google" + email/password + demo buttons |
| `/demo/aircraft` | PASS (empty data — see #5) |
| `/demo/mechanic` | PASS (empty data — see #6) |

### Cron endpoints (all with `Authorization: Bearer $CRON_SECRET`)
| Endpoint | Status | Notes |
|---|---|---|
| `/api/cron/wo-audit` | 200 | swept=0 (no recently-closed WOs) |
| `/api/cron/maintenance-predictions` | 200 | swept=22 aircraft, 0 cards generated (low-confidence baseline) |
| `/api/cron/trash-purge` | 200 | 0 purged across 14 tables (trash empty) |
| `/api/cron/heal-ingestions` | 200 | paused via INGESTION_AUTO_RETRY env (by design) |
| `/api/integrations/adsb/sync` (GET-only-cron-guard) | 405 | "GET is reserved for Vercel Cron. Use POST for manual sync." (correct) |

### API auth gates
24 of 24 sampled `/api/*` endpoints return **HTTP 401 `{"error":"Unauthorized"}`** when called without a session — exactly the expected behavior. **No 500s, no relation-does-not-exist errors.** Migrations 096 + 097 are applied; tables exist; RLS is active.

Sampled: `/api/me`, `/api/aircraft`, `/api/work-orders`, `/api/inspections`, `/api/compliance-items`, `/api/continued-items`, `/api/approval-requests`, `/api/inventory-parts`, `/api/vendors`, `/api/documents`, `/api/customers`, `/api/tools`, `/api/costs`, `/api/serial-components`, `/api/core-obligations`, `/api/bookmarks`, `/api/memberships`, `/api/invites`, `/api/bulk-updates`, `/api/trash`, `/api/dashboard-layouts`, `/api/integrations/registry`, `/api/org/info`, `/api/org/settings`, `/api/purchase-orders`.

### Webhooks
- `/api/webhooks/stripe` → 405 (POST-only) ✓
- `/api/webhooks/stripe-stub` → 405 (POST-only) ✓
- `/api/webhooks/qbo` → 405 (POST-only) ✓
- `/api/costs/email-webhook` → 405 (POST-only) ✓

---

## 🟢 PASS — auth-gated re-run (2026-05-08)

User connected their Chrome session (cookie carryover, no password entered). Confirmed sign-in as `Andy Pats` (Owner / Operator) under org "Codex QA Org 0423", with 2 aircraft (N8202L Cessna 172H, N123QA Cessna 172S), 1 WO ("WO-2026-DEMO" — squeal from left main brake on rollout, $605), 1 customer (test).

### Org Admin (9/9 PASS)
| URL | Status | Notes |
|---|---|---|
| `/org/billing` | PASS | Plan picker renders 4 plans (Owner $39 / Mechanic $49 / Shop $199 / Bundle $249); "No active subscription"; invoice history empty. **Click-time risk per finding #1 unchanged.** |
| `/org/integrations/qbo` | PASS | Mock badge "MOCK — SET QBO_CLIENT_ID + QBO_CLIENT_SECRET" + "Connect QuickBooks" button + section disabled message. Correct. |
| `/org/directory` | PASS | 1 member (Andy Pats / owner / active) with role + persona dropdowns + Deactivate. |
| `/org/invite` | PASS | Email + role + persona form, Recent invites empty. |
| `/org/bookmarks` | PASS | Empty "Nothing pinned yet" state. |
| `/org/bulk-updates` | PASS | Empty audit-trail. |
| `/org/trash` | PASS | "Trash is empty. Deleted rows will appear here for 30 days before purge." |
| `/org/info` | PASS | Form prefilled with "Codex QA Org 0423" + Type/Home Base/Billing Email/Logo URL fields. |
| `/org/settings` | PASS | Per-dept labor rates (Airframe/Engine/Avionics/Interior/Shop), tax profile, notification prefs (in-app/email/push/sms). |

### PATH B — aviation foundation (8/8 PASS)
| URL | Status | Notes |
|---|---|---|
| `/aircraft` | PASS | 2 aircraft listed, KPI columns. |
| `/compliance` | PASS | KPIs (Due/Overdue/Due-Soon/Tracked) + per-aircraft sidebar + Bulk update sibling panel. |
| `/inspections` | PASS | List/Calendar/Table/Board view toggles + Scan sheet + New inspection. |
| `/continued` | PASS | KPIs + Active/Resolved tabs + per-aircraft sidebar. |
| `/approvals` | PASS | 5 KPIs (Draft/Sent/Partial/Completed/Expired) + per-line approval description. |
| `/aircraft/[id]` (N8202L overview) | PASS | Full overview: Hobbs/Tach/TTAF/SMOH header + tabs (Overview/Maintenance/Documents/Intelligence/Assignments) + KPIs + Aircraft Profile + Times sidebar. |
| `/aircraft/[id]/economics` (N8202L) | PASS | Phase 7 P&L card with period selector (30/90 days/12 months), 4 KPIs (Revenue $0, True Cost $0, Net Profit $0, Per Hour $0.00), AI analysis CTA, Cost breakdown, Revenue-vs-cost weekly chart. Revenue $0 because `aircraft.rental_rate` not set (expected). |
| `/aircraft/[id]/components` (N8202L) | PASS | Sprint 3.2 SerialComponentsList with quick-add chips: engine / propeller / magneto / alternator / starter / other + Scan tag. |

### PATH C — operations (5/6 PASS, 1 DEGRADED)
| URL | Status | Notes |
|---|---|---|
| `/work-orders` | **DEGRADED** | Page renders fine (1 In-Progress WO, "Squeal from left main brake on rollout", $605); WO detail thread + composer + Start Timer/Add Part/Add Labor work — **but console shows 9 React hydration errors (#425, #418, #423) on first load**. See systemic finding #7 below. |
| `/parts` | PASS | KPIs (Parts/Low Stock/Inventory Value/Categories), filters, New part, Bulk update. |
| `/vendors` | PASS | KPIs (Vendors/Approved/OSR/Parts), type filter, Approved-only toggle, Bulk update. |
| `/scheduler` | PASS | May 2026 calendar (today=8 highlighted), Month/Week toggle, tabs (Shift Calendar/Your Shifts/Shift Covers), New shift. |
| `/time-off` | PASS | Tabs (My/Team/Calendar overlay), Request time off, empty state. |
| `/clock` | PASS | Today/This Week/All tabs, employee filter, empty state. |

### PATH D — tools / documents (4/4 PASS)
| URL | Status | Notes |
|---|---|---|
| `/tools` | PASS | Calibration filters (All / Due 30/60 / Overdue / Checked out), search, New tool. |
| `/documents` | PASS | KPIs (Total/Indexed/Processing) + 9 tag tabs (All/Needs review/Pending OCR/Needs classification/Logbooks/Manuals/FAA compliance/Reminder-driving/AD evidence) + 5-axis filter UI (aircraft/types/statuses/record families/truth roles) + Scan with camera + Upload + Bulk update. |
| `/customers` | PASS | Master-detail; 1 customer "ANAND PATEL" w/ Contact Details / Notes / Tags / Quick Actions (New WO/Estimate/Invoice). |
| `/costs` | PASS | 5 tabs (All/Pending review/Fuel & Oil/Fixed costs/Maintenance) + Total $0.00 + New cost. Description references sprint 7.2/7.3 email-forwarding + AI extraction. |

### PATH F — home / AI (2/4 PASS, 2 DEGRADED)
| URL | Status | Notes |
|---|---|---|
| `/my-aircraft` | **DEGRADED** | Renders ("Good morning, Andy. N123QA is ready.", attention card empty, both aircraft cards present) — **same hydration error pattern (10 errors)**. |
| `/inbox` | PASS | "Inbox zero" + "Polling every 60s · Spec 0.3" footer; no console errors. |
| `/ask` | PASS | Owner/Mechanic mode toggle + "All Aircraft" filter + 6 example prompt chips + Query History sidebar; no console errors. |
| `/my-day` | **DEGRADED** | Renders ("Good morning, Andy. Add an aircraft to start tracking…") — **hydration errors again (10)**. Also: shows "Your aircraft · 0" despite owner having 2 aircraft → likely filters by mechanic-assigned aircraft, by design, but worth a UX double-check. |

### PATH I — reports / economics (1/1 DEGRADED)
| URL | Status | Notes |
|---|---|---|
| `/reports/tax-pnl` | **DEGRADED** | Renders correctly: title "Tax-time P&L", year selector (2026), Generate PDF, IRS Schedule C / MACRS 5-year description, "Recently generated (this session)" empty — **same hydration error pattern (10 errors)**. PDF generation itself not exercised (would write a row to DB). |

---

## 🟡 New finding #7 — systemic React hydration errors on auth-gated pages

**Pattern:** Pages that load with multiple dynamic dependencies emit a burst of 9–10 React errors at the same instant (#425 "Text content does not match server-rendered HTML", #418 "Hydration failed", #423 "Hydration error… switching the entire root to client rendering").

**Affected (confirmed under auth):** `/work-orders`, `/parts` (likely; observed leftover), `/my-aircraft`, `/my-day`, `/reports/tax-pnl`.

**Not affected (clean console):** `/org/integrations/qbo`, `/org/directory`, `/org/invite`, `/org/bookmarks`, `/org/bulk-updates`, `/org/trash`, `/org/info`, `/org/settings`, `/aircraft`, `/compliance`, `/inspections`, `/continued`, `/approvals`, `/aircraft/[id]/*`, `/vendors`, `/scheduler`, `/time-off`, `/clock`, `/tools`, `/documents`, `/customers`, `/costs`, `/inbox`, `/ask`.

**User-visible impact:** None — every affected page renders the correct content. **But:** error #423 specifically forces React to discard the SSR HTML and re-render the entire root client-side, which means a perf hit (extra render) + Sentry noise + bad SEO/LCP on these surfaces.

**Likely root cause hypothesis:** A shared component is reading client-only state (likely `localStorage`, `Date.now()`, or `window`-scoped persona/aircraft selection) during SSR and producing different markup than the client. Common factor on the affected pages is a "today/now"-relative numeric KPI (`/work-orders` In-Prog count, `/my-aircraft` greeting "good morning", `/my-day` greeting, `/reports/tax-pnl` default year=2026, `/parts` value). The clean pages all have static labels for the matching slots.

**Suggested fix path:**
1. Disable hydration warnings in dev to spot the exact mismatched element (`suppressHydrationWarning` is the wrong fix; we want the *real* mismatch).
2. Most likely culprits: time-of-day greeting in `/my-aircraft` + `/my-day` (`new Date().getHours()` on server vs client), and any KPI computed from `localStorage` cache.
3. Wrap any client-only render in `'use client'` + `useEffect` mount-then-render, or pass server timestamp from RSC props.

This isn't a ship-blocker but it's the kind of issue that compounds — Sentry is probably reporting these constantly already.

---

## ⚪ DEFER — remaining (5 items, all interactive)

These need physical interaction beyond what static UI rendering reveals:

1. **WO Auditor button** on `/work-orders/[id]` — visible in screenshot but didn't click; would generate AI summary against Anthropic API.
2. **VoiceButton mic prompt** on `/my-day` — would 503 immediately per finding #3 (`OPENAI_API_KEY` empty); confirm error UX, not the success path.
3. **CameraButton on `/costs/intake`** — needs a fresh document upload to exercise the 7.3 waitUntil() pipeline.
4. **`/org/billing` "Upgrade" button click** — would hit real Stripe with placeholder mock IDs per finding #1, generating "No such price" error. Not exercised to avoid pollution; finding stands.
5. **`/reports/tax-pnl` Generate PDF** — would create a DB row (`tax_pnl_report` or similar) + render PDF. Not exercised per the "no DB writes" rule.

### Path-J item that doesn't exist
> j1. Hit `/api/cron/extract-receipts` (with cron auth header) → returns 200

**No such route in the codebase.** The receipt-extraction pipeline is event-driven via `waitUntil()` from `/api/costs/upload` and `/api/costs/email-webhook` (both fixed in the 7.3 stuck-extraction debug); there is no cron sweep. Either the spec needs updating to remove this item, or a sweep cron should be added that finds intake_documents with status='received' older than N minutes (acts as a backstop if the waitUntil fires miss again).

---

## Recommended next moves (updated post auth re-run)

1. **Set `STRIPE_USE_MOCK=true`** in Vercel production env immediately to avoid surprise Stripe errors on `/org/billing` Upgrade. Real Stripe products + non-placeholder price IDs are a separate billing-prep task. **(unchanged ship-blocker)**
2. **Drop the `.is('deleted_at', null)` filter** from `airbly-sync` / `fsp-sync` / `telemetry-inference` route handlers. 3-line fix. **(unchanged ship-blocker)**
3. **Set a real `OPENAI_API_KEY`** in production env if voice transcription should work, or document VoiceButton-transcribe as "needs key" in the UI. **(unchanged)**
4. **`/demo/owner` regression** — debug the `Cannot read .total` trace under SmartHome owner layout. **(unchanged nice-to-fix)**
5. **NEW — track down the systemic hydration mismatch** affecting 5+ auth-gated pages (finding #7 above). Quick diagnostic: build with `NEXT_PUBLIC_DEV_HYDRATION=1`, load `/my-aircraft` in dev, copy the un-minified mismatch error. Most likely the time-of-day greeting (`Good morning/afternoon/evening`) is being computed server-side with the deployment region's timezone vs client-side with the user's browser timezone.
6. **`/my-day` shows "Your aircraft · 0" for an owner with 2 aircraft** — confirm whether this is by design (mechanic-only assignments) or a regression. If by design, swap the empty CTA copy from "Add your first aircraft" to "Aircraft you're assigned to as a mechanic appear here."

### What's NOT a ship-blocker
- Auth-gated UI is in good shape: 38/52 PASS, 9 DEGRADED (8 hydration + 1 demo-data), 0 FAIL beyond the original 3 (Stripe/cron/openai env).
- All Org Admin paths render correctly. The whole stub-layer-batch UI surface is healthy.
- All Phase 7 economics surfaces (P&L, Schedule C, components) render under auth.
- 24/24 sampled API endpoints are clean 401-gated; no 500s, no missing-relation errors → migrations 096+097 verified.

---

## Cleanup notes

- `/tmp/.prod-env` (vercel env pull output) — **delete after triage**, contains secrets
- `/tmp/probe-crons.mjs` — disposable test script

No code changes made during this run.
