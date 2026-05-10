# Phase 16 Resume — Context for the Next Executor

**Read this file before re-entering Phase 16.** It tells you exactly which
sprints are done, which are pending, what's blocking, and what NOT to redo.

## TL;DR for the resume executor

1. Sprint 16.1 (ops spine + inbox view) is **CODE COMMITTED** at `95930a9`
   but **MIGRATION 109 IS NOT APPLIED** — there's a schema conflict that
   blocks apply.
2. Sprints 16.2 – 16.12 have **not started**.
3. F1+F3 are fixed and live; F2 still pending Andy's design call.
4. Test suite green at HEAD: 575/575.
5. **Before doing any Sprint 16.2 work, reconcile the `support_tickets`
   conflict** (see "Blocking finding" below).

## Sprints completed

- **16.1** — `feat(ops): sprint 16.1 — unified ops spine + inbox view`
  (`95930a9`, 2026-05-09)
  - `supabase/migrations/109_ops_spine.sql` (542 lines, complete)
  - `apps/web/lib/ops/spine.ts` (257 lines, complete + typecheck-clean)
  - **Migration 109 was NOT applied to production** — see blocking finding.

## Sprints pending

| # | Title | Files expected (per original brief) |
|---|---|---|
| 16.2 | Customer support form + email + ticket service | `/support` page, `/api/public/support/submit`, in-app help drawer, `/api/webhooks/support-email`, `/api/support/tickets/[token]`, `apps/web/lib/support/tickets.ts`, ticket detail customer page |
| 16.3 | AI tier-0/1 triage | migration 110 (ticket_replies + email_log), `apps/web/lib/support/ai-triage.ts`, auto-resolve patterns, escalation path |
| 16.4 | Admin support inbox | `/admin/support/inbox`, `/admin/support/all`, `/admin/support/[ticket_number]`, real-time count badge, P0 banner |
| 16.5 | Error aggregation + admin view | `apps/web/lib/observability/error-capture.ts`, `withErrorCapture` wrapper, `/api/observability/error`, stack-hash grouping, `/admin/observability/errors` |
| 16.6 | System health + cost tracking | migration 111 (cost_snapshots), `/admin/health`, `apps/web/lib/ops/cost-tracker.ts`, `/api/cron/health-alerts`, vercel.json schedule */5 |
| 16.7 | `/admin/command-center` unified dashboard | hero counts, "needs you now", "recent" feed, system health card, customer signals card, cost burn card; admin homeRoute override |
| 16.8 | AI ops assistant | migration 112 (ops_assistant_conversations), `apps/web/lib/ops/assistant.ts`, tool-using Sonnet agent (read-only), 30 q/min admin rate limit |
| 16.9 | Feedback widget + NPS + churn signals | floating widget, NPS modal, CSAT after ticket resolution, `/api/cron/churn-signals`, `/admin/customer-signals` |
| 16.10 | Public `/status` + KB | marketing `/status` page, sub-system green/yellow/red, 90d uptime, `/support/help` KB from resolved tickets, `apps/web/lib/ops/status-check.ts` |
| 16.11 | "Generate Claude Code prompt" | migration 113 (ops_event_prompts), `apps/web/lib/ops/prompt-generator.ts`, modal with Copy/Open buttons, audit trail |
| 16.12 | Final report + lock into context.md | Section 13, hard rule 10, `/docs/phase-16-command-center-report.md` |

## Migrations status

| Migration | File | Applied? |
|---|---|---|
| 109 | ✅ on disk (committed `95930a9`) | ❌ **BLOCKED** — see below |
| 110 | ❌ not authored | — |
| 111 | ❌ not authored | — |
| 112 | ❌ not authored | — |
| 113 | ❌ not authored | — |

## 🔴 Blocking finding before resume

**Migration 109 cannot apply** — a pre-existing `support_tickets` table
in production (created in commit `9cc7e10` "snapshot of Codex work") has
an incompatible schema (text columns, no enums, 0 rows). 4 files in the
codebase reference the old shape:

- `apps/web/app/api/support/route.ts`
- `apps/web/app/api/admin/support/route.ts`
- `apps/web/app/(app)/admin/support/page.tsx`
- `apps/web/app/(app)/admin/page.tsx:251`

Full details + three reconciliation options in
[phase-16-recovery-inventory.md](./phase-16-recovery-inventory.md).
Recommended: drop+recreate (Option 1) since 0 rows live in the table and
Sprint 16.2 was already going to rewrite all 4 routes.

## What the resume executor must do FIRST

1. Read this file. (You are doing that now.)
2. Read [phase-16-recovery-inventory.md](./phase-16-recovery-inventory.md).
3. Decide on the reconciliation path for `support_tickets` (Andy decides
   if the executor doesn't have authority).
4. Either:
   a. Replace `supabase/migrations/109_ops_spine.sql` with a reconciled
      version (commit a fix-up to Sprint 16.1), then apply it via a fresh
      `apps/web/scripts/apply-109.ts`, then delete the script. OR
   b. Keep 109 unchanged but DROP the existing table first as a one-shot,
      then apply 109 cleanly.
5. Update the 4 referencing files (most easily as part of Sprint 16.2,
   which rewrites those routes anyway).
6. Run tests (575/575 baseline) and confirm green.
7. THEN start Sprint 16.2 from the original Phase 16 brief.

## What the executor must NOT do

- ❌ Do NOT re-author Sprint 16.1 — code is committed and complete.
- ❌ Do NOT touch F1 (admin layout) or F3 (persona switcher) — already fixed.
- ❌ Do NOT make a decision on F2 (persona-strict bypass) — Andy's call.
- ❌ Do NOT apply 109 unchanged — it errors on the existing table.
- ❌ Do NOT "fix" the 4 pre-existing TS errors on `origin/main` unless
  Sprint 16.x naturally touches that file — they're unrelated to Phase 16.

## F2 design status

Still pending. F2 is the Phase 15 finding that platform admin reaches
mechanic-only routes (and admin → /dashboard instead of /my-aircraft)
when persona switcher is set to Owner. Two options Andy can pick:

- **A (defensive):** persona-strict guards run BEFORE is_platform_admin
  short-circuit; admin still sees persona-strict UI when switcher is active.
- **B (documented bypass):** banner "Platform admin — persona checks
  bypassed" + audit log.

Phase 16 doesn't depend on F2 — admin command center is its own surface
gated only on platform admin. Resume can proceed without resolving F2.

## Test invariants for Phase 16 resume

- Suite stays at ≥ 575 tests; new sprints add tests, none get removed.
- Sacred `/lib/ocr`, `/lib/rag`, `/lib/embeddings` — read-only; verify
  zero diff at the end of each sprint.
- AI ops assistant (Sprint 16.8) is read-only — never mutates, never
  sends, never executes side effects.
- Mock email/SMS/Slack only; real provider wiring deferred to a future
  phase.
