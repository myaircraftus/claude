# Phase 16 Resume — Context for the Next Executor

**Read this file before re-entering Phase 16.** It tells you exactly which
sprints are done, which are pending, what's blocking, and what NOT to redo.

> **2026-05-09 update — Phase 15.5 cleanup landed.** Migrations 109 + 115
> are LIVE in production. Schema collision RESOLVED. Test suite at 583/583.
> Phase 16 Sprint 16.2 can resume cleanly. F2 (persona-strict bypass) is
> deferred to v2 — see `docs/v2-backlog.md`. Full ledger in
> `docs/phase-15.5-cleanup-report.md`.

## TL;DR for the resume executor

1. Sprint 16.1 (ops spine + inbox view) is **CODE COMMITTED** at `95930a9`
   AND **MIGRATIONS 109 + 115 APPLIED** (commit `9bf101b`, Phase 15.5
   Task 1). Production has the full Phase 16 spine: 5 tables +
   `ops_inbox` view + RLS + 13 enum types.
2. Sprints 16.2 – 16.12 have **not started**.
3. F1+F3+F5+F6+F7 fixed; F2 deferred (v2-backlog.md).
4. Test suite green at HEAD: **583/583**.
5. The 4 routes that previously referenced the legacy `support_tickets`
   schema have been **shimmed** to read/write the new schema while
   preserving the legacy callers' shapes. Sprint 16.2 will rewrite all
   four; the shims are temporary scaffolding.

## Sprints completed

- **16.1** — `feat(ops): sprint 16.1 — unified ops spine + inbox view`
  (`95930a9`, 2026-05-09)
  - `supabase/migrations/109_ops_spine.sql` (542 lines, complete)
  - `apps/web/lib/ops/spine.ts` (257 lines, complete + typecheck-clean)
  - **APPLIED to production via `apply-109.ts` (Phase 15.5 commit
    `9bf101b`).** 5 tables, ops_inbox view, 13 RLS policies, 13 enum
    types live. ticket_number trigger active.

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
| 109 (ops_spine) | ✅ on disk (`95930a9`) | ✅ APPLIED 2026-05-09 (`9bf101b`) |
| 115 (drop legacy support_tickets) | ✅ on disk (`9bf101b`) | ✅ APPLIED 2026-05-09 (`9bf101b`) |
| 110 (ticket_replies + email_log) | ❌ not authored — Sprint 16.3 | — |
| 111 (cost_snapshots) | ❌ not authored — Sprint 16.6 | — |
| 112 (ops_assistant_conversations) | ❌ not authored — Sprint 16.8 | — |
| 113 (ops_event_prompts) | ❌ not authored — Sprint 16.11 | — |

## ✅ Schema collision RESOLVED (was blocking)

The pre-existing `support_tickets` table from commit `9cc7e10` has been
dropped via migration 115, and migration 109 reapplied cleanly. The 4
files that referenced the legacy schema are shimmed:

- `apps/web/app/api/support/route.ts` — POST translates legacy
  `{type, severity, description}` → new `{category, severity:'P2', body}`.
- `apps/web/app/api/admin/support/route.ts` — GET aliases new columns
  back to the legacy SupportTable shape; PATCH maps legacy status →
  new enum.
- `apps/web/app/(app)/admin/support/page.tsx` — same alias shim for SSR.
- `apps/web/app/(app)/admin/page.tsx` — open-tickets count filter
  updated to new enum values.

Sprint 16.2 will rewrite all four with the proper new ticket service.

## What the resume executor must do FIRST

1. Read this file.
2. Read [phase-15.5-cleanup-report.md](./phase-15.5-cleanup-report.md)
   for the full state snapshot.
3. Confirm test suite is at 583/583 + production state matches the
   Phase 15.5 final report.
4. Start Sprint 16.2 from the original Phase 16 brief.

## What the executor must NOT do

- ❌ Do NOT re-author Sprint 16.1 — code is committed and complete; spine
  is live in production.
- ❌ Do NOT re-apply migration 109 or 115 — already applied.
- ❌ Do NOT touch F1 (admin layout) or F3 (persona switcher) — already fixed.
- ❌ Do NOT touch F5/F6/F7 — fixed in Phase 15.5 Task 3.
- ❌ Do NOT build "view-as mode" thinking it fixes F2 — verification
  proved the persona guards don't exist; view-as alone doesn't help.
  Defer per `docs/v2-backlog.md`.
- ❌ Do NOT "fix" the 7 pre-existing TS errors on `origin/main` unless
  Sprint 16.x naturally touches those files (telemetry-inference,
  vision-dispatch-sweep, trash, cards/generators) — they're unrelated.

## F2 status

⏸ DEFERRED to v2 (Phase 15.5 Task 2, commit `91a4cb2`).

F2 verification (Task 0) found the persona-strict-bypass IS real, but
the cause is missing route guards — not admin override. View-as alone
fixes nothing. The proper fix is a `requirePersona()` server-component
helper + 5-route gate + admin view-as cookie, scoped at ~1 sprint.
Captured in `docs/v2-backlog.md`. Phase 16 doesn't depend on it.

## Phase 15.5 cleanup commits (for reference)

| SHA | What |
|---|---|
| `711c186` | F2 verification doc (Task 0) |
| `9bf101b` | Schema collision resolved + 109+115 applied + 4 route shims (Task 1) |
| `91a4cb2` | F2 deferred + v2-backlog.md (Task 2) |
| `d8a4433` | F5 + F6 + F7 fixes (Task 3) |
| `042926d` | /api/costs/[id] PATCH zod refactor + parsePatchBody helper (Task 4) |
| `cc9492d` | Vision stalled pages cleanup — 117 recovered as indexed, 566 reset to pending (Task 5) |
| `b5c6a1c` | Trial banner gated on `isPlatformAdmin === false` (Task 6) |

## Test invariants for Phase 16 resume

- Suite stays at ≥ 575 tests; new sprints add tests, none get removed.
- Sacred `/lib/ocr`, `/lib/rag`, `/lib/embeddings` — read-only; verify
  zero diff at the end of each sprint.
- AI ops assistant (Sprint 16.8) is read-only — never mutates, never
  sends, never executes side effects.
- Mock email/SMS/Slack only; real provider wiring deferred to a future
  phase.
