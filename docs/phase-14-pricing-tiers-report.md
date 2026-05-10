# Phase 14 — Pricing Tier Infrastructure Report

**Status:** 🟢 **All 8 sprints shipped.** Migrations 105–108 written but
NOT applied (HARD STOP rule 2 — Andy applies via tsx-pg). Stripe stays in
mock mode per HARD STOP rule 3. Human review billing OFF per HARD STOP
rule 4.

**Date:** 2026-05-09
**Branch:** main
**Commits:** `21a7801` (14.1) → `2f6c606` (14.2) → `5dbd318` (14.3) →
`9732cde` (14.4) → `3ded1e2` (14.5) → `89e1562` (14.6) → `2e1f12b` (14.7) →
this report (14.8)

## TL;DR

Phase 14 turns the pricing strategy into reality through three layers:

1. **Code config (`apps/web/lib/billing/pricing-config.ts`)** — single
   TypeScript file owns the entire pricing model. 42 unit tests lock the
   volume math + helper behavior. Every other surface in the codebase
   reads from this file.
2. **Database (migrations 105–108)** — per-org tier, per-aircraft
   override, audit trail, `scheduled_for` on jobs, handwriting detection
   metadata, document_review_requests workflow table.
3. **Customer surfaces** — tier-aware SLA banner in the upload modal,
   Expert A&P review estimate banner with cost preview, public pricing
   page (3 tier cards + volume table + FAQ), updated /terms, new
   /security page, admin batch panel + per-org tier management.

Master kill-switch (`organizations.tier_billing_disabled`, default true)
keeps every org on Beta even if their nominal tier flips. Human-review
kill-switch (`HUMAN_REVIEW_BILLING_ENABLED` env, default false) keeps the
review workflow in v1 mode (record choice, don't charge).

Strategy is locked into `/docs/new implementation/context.md` Section 12.

## Pricing strategy (verbatim from locked source)

**Tiers:**
- **Beta** — free, current state, real-time
- **Standard** — batch processing, 24-hour SLA
- **Pro** — real-time processing, 5-15 minute SLA

**Volume pricing (per aircraft per month):**

| Aircraft | Standard | Pro (= Standard + $50) |
|---|---:|---:|
| 1–5  | $99  | $149 |
| 6–15 | $79  | $129 |
| 16+  | $59  | $109 |

**Human Review (designed, NOT billed in v1):**
- Standard QA Review — $50/hr — general accuracy + typo correction
- Expert A&P Verification — $150/hr — A&P/IA reviews handwritten content
- Triggered when handwriting > 30% of doc; user accepts/declines/skips
- v1: workflow records the choice. v2: `HUMAN_REVIEW_BILLING_ENABLED=true`
  flips Stripe wiring on.

**Soft cap on Pro:** documents >200 pages always batch regardless of tier.

## Sprint outcomes

### Sprint 14.1 — Pricing config source of truth (`21a7801`)

- ✅ `apps/web/lib/billing/pricing-config.ts`
  - `TIER_DEFINITIONS` (3 tiers with slug/name/sla/billable/slaCopy/processingMode/priceTiers)
  - `HUMAN_REVIEW_RATES` (standardQa $50/hr + expertAp $150/hr)
  - `PROCESSING_RULES` (largeDocPageThreshold=200, handwritingThreshold=0.3, batchCronTime='0 2 * * *', proSlaMinutes=15, standardSlaHours=24, handwrittenPagesPerHour=30)
  - `humanReviewBillingEnabled()` — env-driven kill switch
  - `calculateMonthlyPrice(tier, aircraftCount)` — volume bracket math
  - `pricePerAircraftAtFleetSize` — bracket rate lookup
  - `getProcessingMode` / `getEffectiveTier` / `getSlaCopy`
  - `estimateReviewCost(reviewType, hours)` — Math.ceil rounding
  - `estimateReviewHoursFromPages(pageCount)` — 30 pages/hr heuristic
  - `effectiveProcessingMode(tier, pageCount)` — large-doc rule trumps tier
  - `estimatedReadyAt(mode, uploadedAt)` — for "Expected ready" UI
- ✅ `pricing-config.test.ts` — 42 tests covering all locked math + boundaries

### Sprint 14.2 — Mig 105 + tier-service (`2f6c606`)

- ✅ `supabase/migrations/105_billing_tiers.sql` (NOT applied)
  - `organizations.tier` TEXT NOT NULL DEFAULT 'beta' CHECK
  - `organizations.tier_effective_from` TIMESTAMPTZ DEFAULT NOW()
  - `organizations.tier_billing_disabled` BOOLEAN DEFAULT TRUE
  - `aircraft.tier_override` TEXT (nullable; null = use org's tier)
  - `tier_history` audit table (id, org_id, from_tier, to_tier, changed_by, changed_at, reason)
  - RLS: org members SELECT tier_history; platform admins UPDATE tier columns
  - Indexes: organizations(tier) WHERE tier<>'beta'; aircraft(tier_override) WHERE NOT NULL
- ✅ `apps/web/lib/billing/tier-service.ts`
  - `getOrgTierState` / `getOrgTier` (post-killswitch) / `getAircraftTier`
    (override > org tier; killswitch still wins)
  - `countOrgAircraft` for the pricing display
  - `changeOrgTier` — atomic UPDATE + tier_history INSERT, throws on error
  - `setAircraftTierOverride` — null clears
  - `listOrgsByTier` — admin query with batched aircraft counts
  - `getTierHistory` — newest-first, capped at 50
- ✅ `tier-service.test.ts` — 16 tests covering kill-switch interplay,
  changeOrgTier atomicity, listOrgsByTier batching, fail-safe defaults
- ✅ `apply-105.ts` — verifies columns + CHECKs + indexes + tier distribution

### Sprint 14.3 — Tier-aware dispatch (`5dbd318`)

- ✅ `supabase/migrations/106_vision_jobs_scheduled_for.sql` (NOT applied)
  - `vision_index_jobs.scheduled_for` TIMESTAMPTZ NOT NULL DEFAULT NOW()
  - Partial index `(scheduled_for) WHERE status='queued'`
  - Backfill: existing rows get scheduled_for=created_at
- ✅ `apps/web/lib/vision/dispatch-scheduler.ts`
  - `computeScheduledFor(tier, pageCount, now)` — Pro/Beta + small=NOW;
    Standard=next 02:00 UTC; >200 pages always batch
  - `isReadyToClaim` / `explainScheduling`
  - 18 tests covering boundary cases (200/201 pages, 01:59/02:00/02:01 UTC)
- ✅ `apps/web/lib/vision/auto-dispatch.ts`
  - Optional `aircraftId` on AutoDispatchInput; resolves effective tier
    via tier-service (aircraft override > org tier; killswitch wins)
  - Sets `vision_index_jobs.scheduled_for` per the scheduler
  - Tier lookup errors fail-safe to beta
- ✅ `apps/web/lib/ingestion/server.ts` passes `document.aircraft_id`
- ✅ `vision-fallback-sweep` cron — gated on `scheduled_for <= NOW()`
- ✅ `/api/cron/vision-batch-trigger` — heartbeat at 02:00 UTC daily;
  reads ready/pending/running counts; logs telemetry. Added to vercel.json.
- ✅ Colab notebook Cell 4: `claim_job` filters `scheduled_for <= now()`;
  `complete_job/fail_job` no longer reference non-existent `metadata` column

### Sprint 14.4 — Upload UX + handwriting (`9732cde`)

- ✅ `supabase/migrations/107_handwriting_pct.sql` (NOT applied)
  - `documents.handwriting_pct` NUMERIC, CHECK 0..1
  - `documents.suggests_review` BOOLEAN DEFAULT FALSE
  - Partial index on `(organization_id) WHERE suggests_review = TRUE`
- ✅ `supabase/migrations/108_document_review_requests.sql` (NOT applied)
  - Workflow table with review_type/status/cost_cents/assigned_reviewer
  - RLS: org members SELECT/INSERT; UPDATE limited to admin or assigned reviewer
- ✅ `apps/web/lib/vision/handwriting-detector.ts`
  - `detectHandwriting` — samples up to 5 pages, signs URLs, calls Claude
    Sonnet 4.5, parses integer 0-100, fails closed on errors
  - `parseHandwritingPercent` — tolerates "30", "30%", "Approximately 30"
  - 7 parser tests
- ✅ `components/billing/SlaBanner.tsx` — reads tier, renders locked SLA
  copy from TIER_DEFINITIONS. Three accent colors.
- ✅ `components/billing/ReviewEstimateBanner.tsx` — renders only when
  `suggests_review=true`. Shows Expert A&P / Standard QA / Skip with cost
  estimates. POSTs to `/api/documents/review-requests`.
- ✅ `/api/documents/review-requests` POST — auth via session, verifies
  org membership, inserts via service role. Returns `chargedNow=false`
  in v1 (env-gated).
- ✅ Wired SlaBanner into `PersonaAwareUploadModal` (top of form);
  `effectiveTier` prop pass-through on the trigger button; documents
  page loads `getOrgTier` server-side and passes through.

### Sprint 14.5 — Admin panels (`3ded1e2`)

- ✅ `/admin/billing/batch` — queue dashboard
  - Total jobs / queued pages / next batch window / last completed
  - Status × worker host breakdown table
  - Modal cost estimate ($0.0015/page)
  - Run-Now buttons per tier (POSTs to `/api/admin/billing/batch/run-now`)
- ✅ `/admin/billing/orgs` — per-org tier management
  - Lists every org with monthly price calculated via `calculateMonthlyPrice`
  - Filter buttons per tier; active monthly revenue total
  - Inline tier-change buttons + billing-disabled toggle
- ✅ API routes (all is_platform_admin gated):
  - GET /api/admin/billing/queue-stats
  - POST /api/admin/billing/batch/run-now
  - GET /api/admin/billing/orgs
  - POST /api/admin/billing/orgs/change-tier
- ✅ 5 admin route auth tests (orgs route 401/403/200 + filter cases)
- ✅ Two new admin nav entries: "Billing — Batch", "Billing — Orgs"

### Sprint 14.6 — Public pricing/terms/security (`89e1562`)

- ✅ `components/marketing/PricingPagePhase14.tsx` — server component
  reading directly from pricing-config. Hero + three tier columns +
  volume pricing table + feature comparison + add-ons + 5-question FAQ.
  No hardcoded prices anywhere — all derived.
- ✅ `app/pricing/page.tsx` — replaces legacy persona-based PricingPage
  with PricingPagePhase14. JSON-LD Product schema rebuilt from
  TIER_DEFINITIONS (Beta + 3 Standard brackets + 3 Pro brackets).
- ✅ `app/security/page.tsx` (NEW) — honest disclosure: SOC 2 in progress
  (not yet certified), encryption (TLS + AES-256), multi-tenant isolation
  via RLS, where data lives, "customer data NEVER trains models".
  Vulnerability reporting at security@myaircraft.us.
- ✅ `components/marketing/vite/TermsPage.tsx` — Section 4 rewritten
  with per-aircraft tier language pulling from TIER_DEFINITIONS. Two new
  sections: 4a "Processing Tiers — SLA Promises" (slaCopy verbatim);
  4b "Human Review (Available v2)" (workflow + rates + v1 disclaimer).
- ✅ Footer Legal column: real /security link (was greyed-out placeholder).

### Sprint 14.7 — Locked into context.md + runbook (`2e1f12b`)

- ✅ `/docs/new implementation/context.md`:
  - Section 4 (Hard rules) — adds rule #9: "Pricing config is the single
    source of truth. Never hardcode prices anywhere."
  - Section 11 (Decisions made) — 2026-05-09 row capturing the strategy
  - Section 12 (NEW) — verbatim "Pricing Strategy (LOCKED)" with full
    tier table, volume math, human review workflow, SLA copy, soft cap,
    Beta→v1→v2→v3 plan, source-of-truth references, kill-switch locations,
    and the hard rule.
- ✅ `/docs/runbooks/pricing-launch-v1.md` (NEW) — operational checklist:
  1. Wire real Stripe Products + Prices (with the table mapping
     volume brackets to Stripe Price IDs)
  2. Set tier on each existing org via /admin/billing/orgs
  3. Flip tier_billing_disabled per org as they upgrade
  4. Test one real charge end-to-end
  5. Marketing announcement
  6. Beta user migration — grandfather or 30-day notice (Andy decides)
  Plus operational levers, rollback procedure.

### Sprint 14.8 — Final report (this commit)

## Migrations status

| Migration | Status | Notes |
|---|---|---|
| 105_billing_tiers.sql | 🟡 NOT APPLIED | org+aircraft tier columns + tier_history |
| 106_vision_jobs_scheduled_for.sql | 🟡 NOT APPLIED | tier-aware dispatch ready-time |
| 107_handwriting_pct.sql | 🟡 NOT APPLIED | documents.handwriting_pct + suggests_review |
| 108_document_review_requests.sql | 🟡 NOT APPLIED | review workflow table |

**Apply order (none have circular deps but apply in this order for clean logs):**

```bash
cd apps/web
npx tsx scripts/apply-105.ts
npx tsx scripts/apply-106.ts
npx tsx scripts/apply-107.ts
npx tsx scripts/apply-108.ts
```

Delete each apply-*.ts script after success per the one-shot convention.

## Stripe status

🟡 **Mock mode.** No real Products/Prices created in this phase per
HARD STOP rule 3. Existing per-persona Stripe wiring at
`apps/web/lib/billing/products.ts` (Owner/Mechanic/Bundle SKUs from
Phase 6) stays untouched.

v1 launch runbook lives at `/docs/runbooks/pricing-launch-v1.md`. Step 1
covers Stripe Products + Prices wiring with the volume-bracket → Price-ID
mapping table.

## Marketing pages — live URLs

- https://www.myaircraft.us/pricing — Phase 14 per-aircraft tier model
- https://www.myaircraft.us/terms — updated SLA + Processing Tiers + Human Review sections
- https://www.myaircraft.us/privacy — unchanged this phase
- https://www.myaircraft.us/security — NEW

## Admin pages — live routes

- https://www.myaircraft.us/admin/billing/batch — queue dashboard + run-now
- https://www.myaircraft.us/admin/billing/orgs — per-org tier management

## Test suite

| File | Tests | Notes |
|---|---:|---|
| `lib/billing/pricing-config.test.ts` | 42 | Volume math + helpers + env kill-switch |
| `lib/billing/tier-service.test.ts` | 16 | Kill-switch interplay + atomic changeOrgTier + listOrgsByTier batching |
| `lib/vision/dispatch-scheduler.test.ts` | 18 | Tier × pageCount matrix + UTC boundaries |
| `lib/vision/handwriting-detector.test.ts` | 7 | Parser tolerance |
| `app/api/admin/billing/orgs/route.test.ts` | 5 | 401/403/200 + ?tier filter |
| **Total Phase 14** | **88** | All green |

Wider lib/billing + lib/vision suite (Phase 14 + earlier phases): **422 / 422 green** at the end of Sprint 14.4.

## Sacred boundary verification

```
$ git diff --stat HEAD~7 apps/web/lib/ocr apps/web/lib/rag
(empty — no changes touched the sacred OCR/RAG pipeline across Phase 14)
```

## Phase 14 file map (what each sprint added)

| Sprint | Path | Description |
|---|---|---|
| 14.1 | `apps/web/lib/billing/pricing-config.ts` | Source of truth — TIER_DEFINITIONS, HUMAN_REVIEW_RATES, PROCESSING_RULES, helpers |
| 14.1 | `apps/web/lib/billing/pricing-config.test.ts` | 42 tests |
| 14.2 | `supabase/migrations/105_billing_tiers.sql` | Org+aircraft tier columns + tier_history |
| 14.2 | `apps/web/lib/billing/tier-service.ts` | DB read/write helpers |
| 14.2 | `apps/web/lib/billing/tier-service.test.ts` | 16 tests |
| 14.2 | `apps/web/scripts/apply-105.ts` | Migration runner |
| 14.3 | `supabase/migrations/106_vision_jobs_scheduled_for.sql` | scheduled_for column |
| 14.3 | `apps/web/lib/vision/dispatch-scheduler.ts` | Tier-aware scheduling math |
| 14.3 | `apps/web/lib/vision/dispatch-scheduler.test.ts` | 18 tests |
| 14.3 | `apps/web/app/api/cron/vision-batch-trigger/route.ts` | 02:00 UTC heartbeat |
| 14.3 | `apps/web/scripts/apply-106.ts` | Migration runner |
| 14.4 | `supabase/migrations/107_handwriting_pct.sql` | documents.handwriting_pct |
| 14.4 | `supabase/migrations/108_document_review_requests.sql` | Review workflow table |
| 14.4 | `apps/web/lib/vision/handwriting-detector.ts` | Claude Vision pre-flight |
| 14.4 | `apps/web/lib/vision/handwriting-detector.test.ts` | 7 tests |
| 14.4 | `apps/web/components/billing/SlaBanner.tsx` | Tier-aware SLA banner |
| 14.4 | `apps/web/components/billing/ReviewEstimateBanner.tsx` | Review estimate UI |
| 14.4 | `apps/web/app/api/documents/review-requests/route.ts` | POST endpoint |
| 14.4 | `apps/web/scripts/apply-107.ts` + `apply-108.ts` | Migration runners |
| 14.5 | `apps/web/app/(app)/admin/billing/batch/` | Queue dashboard |
| 14.5 | `apps/web/app/(app)/admin/billing/orgs/` | Per-org tier mgmt |
| 14.5 | `apps/web/app/api/admin/billing/queue-stats/route.ts` | Stats |
| 14.5 | `apps/web/app/api/admin/billing/batch/run-now/route.ts` | Force-bump |
| 14.5 | `apps/web/app/api/admin/billing/orgs/route.ts` + tests | Org list |
| 14.5 | `apps/web/app/api/admin/billing/orgs/change-tier/route.ts` | Tier change |
| 14.6 | `apps/web/components/marketing/PricingPagePhase14.tsx` | Public pricing page |
| 14.6 | `apps/web/app/security/page.tsx` | Security page |
| 14.7 | `docs/new implementation/context.md` | Section 12 LOCKED |
| 14.7 | `docs/runbooks/pricing-launch-v1.md` | Operational checklist |
| 14.8 | `docs/phase-14-pricing-tiers-report.md` | This file |

## Open follow-ups

- **Apply migrations 105–108** — Andy applies via tsx-pg in order
- **Real Stripe wiring** — runbook step 1 covers the mapping; mocks stay until v1 launch
- **Per-doc expedite** ($5 button on Standard tier docs) — UI not built; logged for follow-up
- **Volume tier UI on signup vs admin override** — currently admins manually set tier
  via `/admin/billing/orgs`; signup flow doesn't ask for tier
- **Status page (/status)** — referenced in /terms but not yet built
- **SOC 2 actually achieved** — currently disclosed as "in progress" on /security
- **Webhook handler extension** — `/api/webhooks/stripe` currently only knows
  the per-persona Owner/Mechanic/Bundle SKUs; needs extension for the new
  per-aircraft Standard/Pro Price IDs (runbook step 1)

## Commit table

| Sprint | Commit | Description |
|---|---|---|
| 14.1 | `21a7801` | pricing config source of truth (42 tests) |
| 14.2 | `2f6c606` | mig 105 + tier service (16 tests) |
| 14.3 | `5dbd318` | mig 106 + tier-aware dispatch (87 tests cumulative) |
| 14.4 | `9732cde` | migs 107+108 + SLA UX + handwriting (422 tests cumulative) |
| 14.5 | `3ded1e2` | admin batch + orgs panels (11 admin tests) |
| 14.6 | `89e1562` | public pricing/terms/security |
| 14.7 | `2e1f12b` | locked into context.md + launch runbook |
| 14.8 | this | final report |
