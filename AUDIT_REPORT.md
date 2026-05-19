# myaircraft.us — Enterprise Audit Report
Generated: 2026-05-18
Auditor: Claude Code (claude-opus-4-7)
Branch: `audit/enterprise-clean`

## Baselines
- TypeScript errors before: 76
- TypeScript errors after: 76 (no regression — Phase 5 tsc-reduction not yet done)
- Recall page@20 (aircraft-scoped) before: 31% / doc@20 62%
- Recall after: unchanged — no retrieval-path code was modified (migrations only
  add indexes + enable RLS on dormant tables; neither alters query results)
- Source files: 2,003 `.ts`/`.tsx` under `apps/web`
- Branch: `audit/enterprise-clean` (NOT pushed — awaiting review per the brief)

## Coverage of this pass
Phases **0, 1, 4, 8 — done.** Phases **2, 3, 6, 7 — substantially done**
(392 API routes + 192 UI routes surveyed; freeze, RLS hole, webhook, headers,
N+1, broken nav-link all fixed; dead buttons catalogued). Phases **5, 9 —
surveyed** (findings catalogued; systemic type/log debt documented, not
mass-fixed per rule 4). A full state-by-state UI audit of every screen and the
`Persona` tsc-debt cleanup remain for a follow-up.

## 🚨 CRITICAL FINDINGS (security/data)

### 🚨 C-1 — CROSS-TENANT DATA EXPOSURE: 13 TABLES HAD RLS DISABLED WITH FULL PUBLIC GRANTS — FIXED

**13 `public` tables had Row Level Security DISABLED while granting full
SELECT / INSERT / UPDATE / DELETE / TRUNCATE to BOTH the `anon` AND
`authenticated` Postgres roles.** The `anon` key ships in the browser bundle
(`NEXT_PUBLIC_SUPABASE_ANON_KEY`), so it is effectively public. This meant
**any visitor — not even logged in — could read, modify, delete, or TRUNCATE
every row of these tables across every organization** by hitting the Supabase
REST API directly.

Affected tables (12 of 13 carry `organization_id` — tenant data):
`atlas_order_events`, `atlas_order_records`, `atlas_part_offers`,
`atlas_part_searches`, `chat_payments`, `digital_signatures`,
`legacy_migration_rows`, `part_orders`, `part_request_events`,
`part_requests`, `part_searches`, `parts_catalog`, `vendor_results`.

Most alarming: `digital_signatures` (e-signature records) and `chat_payments`
(payment records) — sensitive, tenant-scoped, world-readable AND world-writable.
Most tables are currently low/zero-row, so likely no data was exfiltrated yet,
but the exposure was live.

**FIX (migration `20260518130000_enable_rls_on_unprotected_tables.sql`,
applied):** enabled RLS on all 13 tables (fail-closed — with no policy, RLS
denies all `anon`/`authenticated` access; the service-role client used by API
routes bypasses RLS and is unaffected, matching the existing pattern of
`app_settings` / `ingestion_failures` / `contact_submissions`). Also revoked
`TRUNCATE` from `anon`/`authenticated` on all 13 — RLS does not gate `TRUNCATE`,
so that grant was a standalone destructive hole.

**Follow-up noted:** if any of these features uses direct client-side Supabase
reads (rather than going through a service-role API route), it will now get
zero rows and needs a proper org-scoped RLS policy added. They appear to be
dormant/API-driven marketplace features, so deny-all is the safe default.

## Phase 1 — Admin Freeze Bug — FIXED

**Symptom:** opening the OCR document review queue (`/documents/review`) froze
the entire app — navigation, buttons, tabs all locked until a full refresh.

**Root cause:** infinite render loop in the per-card component `QueueItemCard`
(`app/(app)/documents/review/review-client.tsx`).
- `fieldResults` (`reasoning.field_results ?? {}`) and `fieldCandidates`
  (`item.fieldCandidates ?? []`) allocated a *fresh* object/array every render
  whenever the item was un-arbitrated or had no enriched candidates (common —
  the server only enriches items that have a page job).
- Those feed the `keywordSuggestions` `useMemo`, whose deps therefore changed
  by reference every render → the memo recomputed → returned a new array.
- The `useEffect` on line ~590 depends on `keywordSuggestions` and calls
  `setSelectedKeywords(keywordSuggestions.slice(...))` — a fresh array, so the
  state always changed → re-render → memo recomputes → effect re-fires → loop.
- Every queue card looped, pegging the main thread.

**Fix:** wrapped `fieldResults` and `fieldCandidates` in `useMemo` keyed on
their stable prop sources (`job.arbitration_reasoning`, `item.fieldCandidates`)
so the empty defaults are referentially pinned. `keywordSuggestions` is now
genuinely memoized; the effect runs once per item instead of every render.

**Verification:** render-cycle traced — after the fix, a re-render caused by
`setSelectedKeywords` leaves all `keywordSuggestions` deps reference-stable, so
the memo returns the same array and the effect does not re-fire. `tsc` clean.

## Phase 2 — UI Fixes

192 routes / ~250 live screen+component files surveyed for broken navigation
and dead buttons (demo/marketing components excluded).

**Broken navigation — FIXED:**
- `components/documents/gdrive-import-section.tsx:109` — the "Manage" link
  pointed at `/settings/integrations`, which does not exist (404). The
  integrations screen is `/integrations`. Corrected.

**Dead buttons — documented for the product owner** (each is a styled action
control with no `onClick`/handler; wiring them needs the intended behavior, so
they are catalogued rather than guessed — they should be wired, or `disabled`
with a "coming soon" affordance, or removed):
- `components/redesign/SettingsPage.tsx:1238` — "+ Add Customer"
- `components/redesign/SettingsPage.tsx:1308` — "Edit" (customer detail)
- `components/redesign/SettingsPage.tsx:1351` — "Manage Plan" (billing card)
- `app/(app)/work-orders/[id]/work-order-detail-client.tsx:1480-1482` —
  "Reserve" / "Install" / "Attach 8130" on each part line
- `app/(app)/work-orders/[id]/work-order-detail-client.tsx:1203` — camera /
  add-photo icon button in the inspection-items table
- `app/(app)/aircraft/due-list/due-list-client.tsx:452,461` — two
  "Attach File" buttons (Part Removed / Part Installed panels)
- `components/redesign/MarketplacePage.tsx:1140` — `href="#"` "Join waitlist"
  (a Phase-3 roadmap stub — likely intentional)

Also noted: `components/settings/ApiSettingsPage.tsx` has `href="#"` links but
is **dead code** — imported by no route.

A full state-by-state audit (loading/error/success on every interactive
element) of all ~25 screens was not completed this pass.

## Phase 3 — API Route Findings

392 `route.ts` files surveyed. The codebase follows a consistent auth pattern
(`createServerSupabase().auth.getUser()` + a membership lookup, or
`createServiceSupabase()` with an `organization_id` filter derived from an
authenticated membership). Genuine deviations:

| Route | Issue | Action | Status |
|---|---|---|---|
| `webhooks/[provider]` | **No signature/secret validation.** A forged POST could overwrite `aircraft.total_time_hours` (safety-relevant — drives inspection/AD timing) for any org that has the integration connected. | Added fail-closed shared-secret check (`INTEGRATION_WEBHOOK_SECRET`, constant-time compare) | ✅ Fixed |
| `aircraft/[id]/tracking/{live,recent,refresh,flights,provider-config}` (5 routes) | No in-code auth or org-membership check — they key off `params.id` and rely solely on RLS via `createServerSupabase`. **Verified:** the 3 tracking tables' RLS policies are correctly org-scoped (`organization_id`/`aircraft_id IN (caller's memberships via auth.uid())`, `cmd=ALL` with `qual` also gating INSERT) — so this is **not an active cross-tenant leak**; RLS protects it. It is, however, a defense-in-depth gap and inconsistent with the rest of the API (every other route checks auth in code). | Verified RLS-safe; in-code org guards recommended as hardening | ⚠️ Noted (downgraded) |
| `documents/route.ts` GET, `aircraft/[id]/tracking/provider-config`, `parts/library/apply-markup` | No try/catch — an unhandled throw (`reconcileOrganizationStaleDocuments`, `await req.json()`) escapes as a raw 500 | Documented — low severity | ⚠️ Noted |

Webhook/cron/OAuth-callback routes that are unauthenticated by design were
verified to validate a signature/secret (Stripe, Intuit) — except the
`[provider]` webhook above, now fixed.

## Phase 4 — Database Findings

| Finding | Detail | Action | Status |
|---|---|---|---|
| RLS disabled on 13 tables | see 🚨 C-1 | migration `..130000` enables RLS + revokes TRUNCATE | ✅ Fixed |
| ~330 FK columns lack a covering index | perf risk on joins | migration `..140000` indexes the 14 columns on hot tables (5k–224k rows: RAG embeddings, OCR pipeline, review queue, vision) | ✅ Fixed (hot set) |
| ~315 remaining unindexed FK columns | small/dormant tables | Deliberately left — index write-cost not justified at current row counts; revisit per-table as volume grows | ⚠️ Noted |
| 12 tables with no PRIMARY KEY | the dormant marketplace/atlas set (`part_orders`, `chat_payments`, `digital_signatures`, `parts_catalog`, etc.) | Not fixed — dormant features, mostly empty; needs an `id` column + PK added before they go live | ⚠️ Noted |
| Orphaned data check | `document_chunks`, `document_pages`, `canonical_document_chunks` with no parent doc | **0 orphans** — clean | ✅ Pass |
| RLS-on / 0-policy tables | `app_settings`, `ingestion_failures`, `contact_submissions`, `signup_attempts`, `claude_review_requests`, `aircraft_registry_*` | Intentional — service-role-only, fail-closed | ✅ Pass |
| `text` columns that should be enums | `status` / `type` / `event_type` etc. across many tables | Not converted — enum migration on live data is risky and the `event_type` fuzziness is a known data-cleanliness item; noted for a dedicated normalization pass | ⚠️ Noted |

## Phase 5 — Code Quality

Surveyed; counts captured. Systemic items are documented rather than mass-fixed
(rule 4 — no speculative refactors):

| Item | Count | Assessment |
|---|---|---|
| TypeScript errors | 76 | **Dominant cluster (~24): a half-finished `Persona` type migration.** `Persona` is canonically `'owner' \| 'shop' \| 'admin'` (`types/index.ts`), but `lib/documents/persona-scope.ts` and `lib/billing/gate.ts` each **redefine it more narrowly** (`'owner' \| 'shop'`), a separate `SignInPersona` type exists, and stale `'mechanic'` literals linger (runtime folds `mechanic→shop`). Consolidating to one `Persona` type + fixing call sites is a focused refactor touching billing/login/integrations gating — **not a safe audit mechanical fix**; recommended as a dedicated reviewed task. |
| `as any` casts | 564 | Systemic type debt — not fixable in an audit pass. Recommend chipping away file-by-file. |
| `console.*` calls (non-test) | 320 | Many are legitimate error-handler logs; a structured logger is the right long-term fix. |
| Empty `catch {}` blocks | 12 | Mostly deliberate best-effort patterns; each should be reviewed. |
| `@ts-ignore` / `@ts-expect-error` | 4 | Small — review individually. |
| `TODO` / `FIXME` / `HACK` | 57 | Triage in a dedicated pass. |
| Broken test files | `PersonaSwitcher.test.tsx`, `AdminFooterLink.test.tsx` | Reference `@testing-library/react` / jest-dom which are **not installed** — those tests cannot run. Install the deps or give tests a separate tsconfig. |

The 76→<30 tsc target is **not safely reachable without the `Persona`
consolidation**, which is deliberately deferred.

## Phase 6 — Security

| Check | Result | Status |
|---|---|---|
| Security headers | **Two `next.config` files existed** — Next.js loads `.mjs` first, and the `.mjs` had only `X-Content-Type-Options` + `X-Frame-Options` (and only on `/api/*`). The full CSP / HSTS / Referrer-Policy / Permissions-Policy set lived in `next.config.ts` — **never loaded, dead code.** Merged the full set into `next.config.mjs` (CSP, HSTS, X-Frame DENY, Referrer-Policy, Permissions-Policy on every route; SAMEORIGIN override kept for the PDF-preview iframe). Deleted the dead `next.config.ts`. | ✅ Fixed |
| Unsigned webhook | `webhooks/[provider]` — see Phase 3 | ✅ Fixed |
| SQL injection | Greps for `${}` interpolation into `.from()`/`.rpc()` found only `Buffer.from()` Basic-auth headers and an error string — **no SQL string interpolation.** The Supabase query builder (parameterized) is used throughout. | ✅ Pass |
| Hardcoded secrets | Grep for `sk-`/`secret_`/inline passwords found only `process.env.*` references — no committed secrets. | ✅ Pass |
| File-upload MIME/size validation | Not audited this pass | ⚠️ Deferred |
| Auth-token revocation behavior | Not audited this pass | ⚠️ Deferred |

## Phase 8 — RAG Pipeline Verification

| Check | Result |
|---|---|
| `bm25-index.ts` canonical-layer pagination | ✅ Pass — `.range()`-by-`id` paging; the exact-multiple-of-1000 edge case terminates correctly (next page returns 0 rows → break); concurrent inserts during paging are caught by the fingerprint recheck-retry guard. |
| `structured-events.ts` SQL count path | ✅ Pass — verified live: N714VH "annual" count ≈ 50 matches the DB; the deterministic count path returns SQL-backed figures. |
| Ingestion always writes OCR confidence | ✅ Pass — **0 of 16,724** `document_pages` rows have a NULL `ocr_confidence`. The future Vision-OCR trigger is not blocked. |
| Citation persistence | ✅ Pass — **573 citations across 369 queries** in the last 2h (the `citations.chunk_id` FK was already dropped in prior work, so inserts succeed). |
| `/api/query` P0 aircraft-scope validation | ✅ Pass — a body `aircraft_id` is verified against the caller's org; a tail-resolved `aircraftId` is org-scoped by construction in `parseStructuredQuery`. |

## Phase 7 — Performance

| Finding | Action | Status |
|---|---|---|
| **N+1 in `documents/review/page.tsx`** — the OCR review queue ran a per-item `Promise.all` of 2–4 candidate/conflict queries inside a `for` loop over up to 50 items → up to ~200 sequential DB round-trips on every page load. | Rewrote as 4 batched `.in(...)` queries grouped in-memory. `page_id`/`segment_id` are indexed, so the batched lookups stay fast. | ✅ Fixed |
| Database FK indexes | 14 hot-table indexes added (Phase 4) | ✅ Fixed |
| Frontend `React.memo`/`useMemo`, `useEffect` deps, `next/dynamic` code-splitting, `SELECT *` audit | Not done this pass | ⚠️ Deferred |

## Phase 8 — RAG Pipeline Verification
_Pending._

## Phase 9 — Accessibility

| Check | Result |
|---|---|
| `<img>` without `alt` | ✅ Pass — the 3 grep hits were false positives (multi-line JSX); all have `alt` (one `alt=""` is correct for a decorative thumbnail). |
| Icon-only `<button>` aria-labels, color contrast, focus rings, inline form errors | ⚠️ Not audited this pass |

## Known Remaining Issues (not fixed, reason)
- **`aircraft/[id]/tracking/*` (5 routes)** — no in-code org/auth check; rely on
  RLS only. Needs in-code membership verification + confirmation the tracking
  tables' RLS policies are org-scoped. Not fixed: needs the policy review.
- **3 routes with no try/catch** (`documents` GET, `tracking/provider-config`,
  `parts/library/apply-markup`) — low severity; unhandled throw → raw 500.
- **12 dormant tables with no PRIMARY KEY** — fix before those features ship.
- **~315 unindexed FK columns on small tables** — deliberately deferred.
- **tsc at 76 errors** — `next.config` still sets `ignoreBuildErrors: true`;
  cannot be removed until the count reaches 0 (Phase 5).
- **`event_type` free-text** (117 distinct values) — a data-normalization
  project; the RAG count path already compensates with fuzzy matching.
- **Server-side N+1 in `documents/review/page.tsx`** — per-item query loop.

## Continuation pass — Blocks A–F (PROMPT_Phase2_Fixes_Continuation.md)

**Block A — Quick wins (done):**
- A-1: The prompt's 6-broken-link table was **stale** — `AppLayout.tsx`'s nav
  was already correct (`/squawks`, `/logbook-entries`, `/aircraft/intelligence`,
  `/invoices` all valid). Cross-checked *every* nav href against the route
  tree: only 2 were genuinely broken — admin `/admin/faraim` and `/admin/tour`.
  Both removed (no such routes; the features already exist as the FaraimButton
  and the launchTour() button).
- A-2: "Manage Plan" wired to `/api/billing/portal`; 8 genuine feature-stub
  buttons disabled with "Coming soon"; marketplace `href="#"` → mailto.
- A-3: Parts-inventory Analytics replaced hardcoded demo figures with a
  real-`inventory_parts`-count-driven honest zero-state.
- A-4: Settings → Security: proper "Coming soon" panel (MFA/session/IP/SSO).

**Block B — Defense in depth (done):**
- B-1: auth + RLS-scoped org guard added to all 5 `aircraft/[id]/tracking/*`
  routes.
- B-2: try/catch added — `provider-config` (GET+PATCH), `documents` GET
  (best-effort reconcile wrapped), `apply-markup` (JSON-body guard).

**Block C — Database (done):**
- C-1: PRIMARY KEY added to 12 dormant tables. The prompt's `ADD COLUMN IF NOT
  EXISTS id … PRIMARY KEY` would have **no-op'd** — all 12 already have an
  `id uuid` column; the correct migration is `ADD PRIMARY KEY (id)` on the
  existing column. Verified 0 NULL ids first. Migration `..150000` applied.

**Block D — TypeScript / code quality:**
- D-2 (done): test files were in the *production* tsconfig — excluded them
  (`tsc --noEmit` gates shipped code; vitest handles tests). **tsc 76 → 64.**
- D-1 (NOT done — deliberately): the prompt frames this as 3 mergeable
  `Persona` definitions. Reality: **6+ semantically-distinct types** sharing
  the name — auth role (`owner|shop|admin`), an integration-audience filter in
  `IntegrationsPage` (`owner|mechanic|both`), `SignInPersona` (`owner|mechanic`),
  the billing `Sku` (`owner|mechanic|bundle`), plus per-component locals. The
  `mechanic`↔`shop` vocabulary drift spans auth/billing/signup/integration —
  different *concepts*, not one type. Blind consolidation risks silently
  breaking billing and access gating. This needs product disambiguation
  ("is the shop persona `shop` or `mechanic`? is integration-audience the same
  axis as auth-persona?") and should be a dedicated, reviewed refactor — not a
  mechanical audit pass. `ignoreBuildErrors` stays until then.
- D-3 (reviewed): 12 empty `catch {}` blocks — on review, ~10 are legitimate
  best-effort (error-body JSON parse, URL parse, optional title fetch). Added
  a `console.error` to the one that genuinely warranted visibility (the
  review-page candidate-batch load). The rest are intentional.

**Blocks E (performance) / F (accessibility) — not done this pass.**
E: `SELECT *` audit, `React.memo` on list cards, `next/dynamic` for heavy
tabs. F: icon-button `aria-label`s, focus-ring audit. Both are grep-driven and
suitable for a follow-up; documented here, not started.

## Recommended Next Steps
1. Complete Phases 2 (UI), 5 (code quality / tsc reduction), 7 (performance),
   9 (accessibility) in a follow-up session.
2. Set `INTEGRATION_WEBHOOK_SECRET` in the Vercel env before the webhook
   integration is used (it now fails closed without it).
3. Review the RLS policies of the `aircraft_*tracking*` tables and add in-code
   org guards to the 5 tracking routes.
4. Add PRIMARY KEYs to the 12 dormant marketplace tables before launch.
5. Drive tsc to 0 and remove `ignoreBuildErrors`.
