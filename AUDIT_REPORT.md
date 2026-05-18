# myaircraft.us — Enterprise Audit Report
Generated: 2026-05-18
Auditor: Claude Code (claude-opus-4-7)
Branch: `audit/enterprise-clean`

## Baselines
- TypeScript errors before: 76
- TypeScript errors after: _TBD_
- Recall page@20 (aircraft-scoped) before: 31%
- Recall doc@20 (aircraft-scoped) before: 62%
- Recall page@20 (aircraft-scoped) after: _TBD_
- Source files audited: 2,003 `.ts`/`.tsx` under `apps/web`
- Commits on audit branch: _TBD_

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
_Pending._

## Phase 4 — Database Findings
_Pending._

## Phase 5 — Code Quality
_Pending._

## Phase 6 — Security
_Pending._

## Phase 7 — Performance
_Pending._

## Phase 8 — RAG Pipeline Verification
_Pending._

## Phase 9 — Accessibility
_Pending._

## Known Remaining Issues (not fixed, reason)
_Pending._

## Recommended Next Steps
_Pending._
