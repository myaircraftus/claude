# Phase 15.5 — Pre-Phase-16 Cleanup Report

**Date:** 2026-05-09
**Branch:** `main` (in sync with `origin/main`)
**Test suite:** 🟢 **583 / 583** across 38 files (up from 575 baseline; 8 new costs PATCH tests added).

## Headline

All 8 cleanup tasks complete. **Phase 16 Sprint 16.2 can resume cleanly**:
- support_tickets schema collision resolved (migrations 109 + 115 live).
- F1 + F3 + F5 + F6 + F7 closed.
- F2 confirmed real but deferred to v2 (recommendation: dedicated route-guard sprint).
- Production state freshened (vision cleanup recovered 117 stalled
  embeddings, reset 566 to pending).
- Sacred boundary verified untouched.

## Task outcomes

### Task 0 — F2 verification ✅ (commit `711c186`)

Re-tested under `andy@horf.us` (post-migration 114, now `is_platform_admin = true`):
- `/scheduler`, `/work-orders`, `/clock` all render fully under owner persona.
- Same behavior pre- and post-platform-admin elevation.
- **Cause is missing route guards, not admin override.** `grep` for
  `persona === 'owner' || isModuleHidden || hiddenModules` across these
  pages returns 0 hits. Persona system is enforced at sidebar nav +
  Phase 13.2 upload modal only.

Output: `docs/phase-15-f2-verification.md`.

### Task 1 — support_tickets schema collision ✅ (commit `9bf101b`)

Migrations applied to production:
- `115_drop_legacy_support_tickets.sql` — drops the pre-existing
  table from commit `9cc7e10` (April Codex snapshot, 0 rows, 11 text
  cols, no FK incoming, no view dependencies).
- `109_ops_spine.sql` — re-applied cleanly post-115. Result:
  - 5 tables (support_tickets 24 cols, error_events 19, alert_events
    13, feedback_items 12, churn_signals 10)
  - `ops_inbox` VIEW (UNION ALL across all 5)
  - RLS enabled on every table; 13 policies total; 13 enum types
  - `ticket_number` auto-assignment trigger (TKT-YYYYMMDD-NNNN)
  - `updated_at` touch trigger

Code shims (Sprint 16.2 will fully rewrite):
- `app/api/support/route.ts` — POST translates legacy
  `{type, severity, description}` → new schema `{category, severity:'P2', body}`.
- `app/api/admin/support/route.ts` — GET aliases new columns back to
  legacy SupportTable shape; PATCH maps legacy status values → new enum.
- `(app)/admin/support/page.tsx` — same alias shim for SSR fetch.
- `(app)/admin/page.tsx` — open-tickets count filter updated to new
  enum values.

### Task 2 — F2 deferred to v2 backlog ✅ (commit `91a4cb2`)

Neither CASE A (build view-as) nor CASE B (misdiagnosis) exactly fits.
F2 IS real but for the wrong reason than originally reported. View-as
alone fixes nothing because the guards it would bypass don't exist.

Output: `docs/v2-backlog.md` with full scope (1-sprint estimate) and
unfreeze triggers. Phase 15 QA report's F2 section updated to ⏸ DEFERRED.

### Task 3 — F5 + F6 + F7 fixes ✅ (commit `d8a4433`)

- **F5** /manuals upload modal — `<SlaBanner tier={effectiveTier} />`
  mounted at top of body, matches Phase 13.2 modal. Tier resolved via
  `getOrgTier()` in page.tsx and threaded through to UploadManualModal.
- **F6** /approvals — page now reads `getCurrentPersona()` and passes
  into ApprovalsView. Owner sees: "Approvals — Quoted work waiting
  for your approval ..." (no "+ New approval" button). Shop sees
  the original "Customer Approvals — Send quoted work ..." copy +
  the create button.
- **F7** aircraft detail Upload — `uploadHref` was pointing at the
  legacy `/documents/upload?aircraft=ID` form. Now points at
  `/documents?aircraft=ID` so the user lands on the docs listing
  pre-filtered to that aircraft, where the Phase 13.2
  PersonaAwareUploadButton (with SLA banner + persona-scoped category
  list) is at the top.

### Task 4 — /api/costs/[id] PATCH zod refactor ✅ (commit `042926d`)

Closed security-audit §5.4 row that explicitly skipped this route.

- **New helper** `lib/validation/common.ts → parsePatchBody(req, schema)`
  returns the validated body PLUS `Set<string>` of keys the caller
  explicitly sent. PATCH routes can now distinguish three states:
  omitted (leave column), null (write NULL), real value (write that).
- **Route refactored** with `z.object().strict()`, every field
  optional + nullable where appropriate. `bucket` validates against
  `z.enum(COST_BUCKETS)`. `amount` finite 0..1e8 then rounded to 2
  decimals. `cost_date` regex-validated.
- **8 vitest cases** verify empty body no-op, single-field update,
  explicit null, omitted-field passthrough, invalid type → 400,
  invalid enum → 400, amount rounding, role gate. All green.
- **20/253** mutating routes now zod-validated (was 19). Pattern
  established for the remaining ~233.

### Task 5 — Stalled vision docs cleanup ✅ (commit `cc9492d`)

Probed and applied via one-shot scripts (deleted after success).

Pre-cleanup state:
- 928 vision_pages stuck in `embedding` status; 683 of those >1h old.
- Subdivision: 117 already had a `vision_embeddings` row (status got
  stuck but the embedding completed); 566 had no embedding row.

Cleanup actions:
- 117 stalled-but-embedded → `status='indexed'` (recovered pages that
  retrieval was missing).
- 566 stalled-no-embedding → `status='pending'`, `vision_index_id`
  cleared (queue will re-pick).

Skipped per the brief (not applicable in production):
- "Stale running jobs → reset to queued": 0 such rows.
- "Failed jobs >24h → mark cancelled": status enum is
  `queued|running|completed|failed` (CHECK constraint); `cancelled`
  isn't valid + 0 such rows anyway.

Post-state (also captured in `phase-9-deployment-report.md`):
```
indexed   11,724  (+117)
pending    3,742  (+566)
embedding    245  (legitimately in-progress, all <1h old)
failed       802  (unchanged)
```

Bonus finding: `worker_heartbeat` table is empty in production —
heartbeat writes apparently aren't landing. Out of scope here; flagged
for follow-up.

### Task 6 — Trial banner hidden for platform admins ✅ (commit `b5c6a1c`)

`AppLayout.tsx` BillingBanner gate widened: was
`(persona === 'owner' || 'mechanic')`, now also requires
`isPlatformAdmin === false` (strict equality). `isPlatformAdmin`
state widened to `boolean | null` so the banner doesn't flash before
`/api/me` resolves on every page nav.

### Task 7 — Test suite + sacred boundary verification ✅

- `vitest`: **583 passed (38 files)** — up from 575 baseline
  (+8 from new costs PATCH tests, no regressions).
- `tsc --noEmit`: 7 TS errors, all pre-existing on `origin/main`
  (telemetry-inference, vision-dispatch-sweep, trash/route,
  cards/generators). None from Phase 15.5.
- Sacred boundary: `git diff origin/main...HEAD -- apps/web/lib/ocr
  apps/web/lib/rag apps/web/lib/embeddings` produces zero output.

## Commits this phase

| SHA | Description |
|---|---|
| `711c186` | docs(qa): F2 verification (Task 0) |
| `9bf101b` | chore(ops): support_tickets schema collision + 109+115 (Task 1) |
| `91a4cb2` | docs(qa): F2 deferred to v2 backlog (Task 2) |
| `d8a4433` | fix(qa): F5 + F6 + F7 backlog cleanup (Task 3) |
| `042926d` | fix(security): /api/costs/[id] PATCH zod gap (Task 4) |
| `cc9492d` | chore(vision): stalled pages + jobs cleanup (Task 5) |
| `b5c6a1c` | fix(ui): hide trial banner for platform admins (Task 6) |

Plus: this report + final context.md updates (next commit).

## Phase 15 backlog status after cleanup

| ID | Title | Status |
|---|---|---|
| F1 | /admin/* unreachable for platform admin | ✅ resolved (mig 114 + 7ffc761) |
| F2 | persona-strict guards bypassed | ⏸ deferred — v2-backlog.md |
| F3 | persona switcher missing Shop tab | ✅ fixed (dc212fa) |
| F4 | /my-day owner-flavored copy | 🟡 not in scope (P1) |
| F5 | /manuals upload modal missing SLA banner | ✅ fixed (d8a4433) |
| F6 | /approvals shop-perspective for Owner | ✅ fixed (d8a4433) |
| F7 | aircraft detail Upload uses legacy route | ✅ fixed (d8a4433) |
| F8 | /customers PII not redacted | 🟡 not in scope (P2) |
| F9 | N+1 fetch on /ask | 🟡 not in scope (P2) |
| F10–F12 | tab title / costs subtitle / banner stack | ✅ fixed (40425c5) |
| F13–F15 | aircraft cards Hobbs, 404 redirect, footer | 🟡 not in scope (P3) |

## Ready for Phase 16 resume from Sprint 16.2: ✅

Sprint 16.2 starts with:
- Customer support form at `/support` (marketing site)
- In-app help widget on every persona page
- `/api/public/support/submit` endpoint
- `/api/webhooks/support-email` mock
- `apps/web/lib/support/tickets.ts` ticket service
- Customer-side ticket detail page `/support/tickets/[ticket_number]`

The new `support_tickets` schema is live and the 4 legacy routes have
working shims. Sprint 16.2's full rewrite of those routes will
naturally remove the shims.

## What's NOT done (carry-overs)

- **F4** /my-day mechanic-flavored copy refactor (P1) — bigger scope.
- **F8** /customers PII redaction (P2) — Phase 16 polish.
- **F9** /ask N+1 fetch dedup (P2) — perf sprint candidate.
- **F13–F15** P3 cosmetics — opportunistic.
- **worker_heartbeat empty in production** — discovered during Task 5
  probe. Heartbeat writes aren't landing; vision worker health surface
  has no data to display. Phase 16.6 (system health monitoring) will
  rebuild this anyway, but flagging here for visibility.
- **`(app)/admin/page.tsx` line 247** still queries `feedback` table
  with `status='open'` — Phase 16 will migrate that to the new
  `feedback_items` schema.
- **F2 (route guards)** — recommended next standalone sprint per
  v2-backlog.md.
