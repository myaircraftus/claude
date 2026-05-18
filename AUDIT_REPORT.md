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
Phases **0, 1, 4, 8 — done.** Phases **3, 6 — substantially done** (392 routes
surveyed; headers + webhook fixed; a few items noted for follow-up). Phases
**2, 5, 7, 9 — not yet started** — this audit is scoped by the brief as a
multi-session effort; the highest-severity items (admin freeze, the critical
RLS hole, the unsigned webhook, missing security headers) were prioritized and
fixed first.

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
_Pending._

## Phase 3 — API Route Findings

392 `route.ts` files surveyed. The codebase follows a consistent auth pattern
(`createServerSupabase().auth.getUser()` + a membership lookup, or
`createServiceSupabase()` with an `organization_id` filter derived from an
authenticated membership). Genuine deviations:

| Route | Issue | Action | Status |
|---|---|---|---|
| `webhooks/[provider]` | **No signature/secret validation.** A forged POST could overwrite `aircraft.total_time_hours` (safety-relevant — drives inspection/AD timing) for any org that has the integration connected. | Added fail-closed shared-secret check (`INTEGRATION_WEBHOOK_SECRET`, constant-time compare) | ✅ Fixed |
| `aircraft/[id]/tracking/{live,recent,refresh,flights,provider-config}` (5 routes) | No in-code auth or org-membership check — they key off `params.id` and rely solely on RLS via `createServerSupabase`. `provider-config` PATCH has no feature-flag gate either. The tracking tables DO have RLS enabled (1 policy each), so this is missing defense-in-depth rather than a confirmed open leak — but in-code org verification should be added and the RLS policies confirmed org-scoped. | Documented — not fixed this pass | ⚠️ Noted |
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
_Not started this pass. tsc baseline holds at 76 (no regression). The 76→<30
reduction, `as any` removal, dead-code sweep, and console-log cleanup remain._

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
_Not started this pass. The Phase 4 FK indexes address the database side. The
known server-side N+1 in `documents/review/page.tsx` (a per-item query loop,
up to ~150 sequential queries) is logged here for the frontend/perf pass._

## Phase 8 — RAG Pipeline Verification
_Pending._

## Phase 9 — Accessibility
_Not started this pass._

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

## Recommended Next Steps
1. Complete Phases 2 (UI), 5 (code quality / tsc reduction), 7 (performance),
   9 (accessibility) in a follow-up session.
2. Set `INTEGRATION_WEBHOOK_SECRET` in the Vercel env before the webhook
   integration is used (it now fails closed without it).
3. Review the RLS policies of the `aircraft_*tracking*` tables and add in-code
   org guards to the 5 tracking routes.
4. Add PRIMARY KEYs to the 12 dormant marketplace tables before launch.
5. Drive tsc to 0 and remove `ignoreBuildErrors`.
