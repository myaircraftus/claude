# Phase 16 Recovery — Inventory

**Date:** 2026-05-09
**Branch:** `main` (in sync with `origin/main`)
**Status:** Phase 16 paused mid-Sprint 16.1; F1+F3 fixes pushed; **migration 109 BLOCKED by schema conflict.**

## Test suite

✅ **575 / 575 tests passing** across 37 test files (no regressions from Phase 16 partial work).

Pre-existing TS errors that are NOT from Phase 16:
- `app/api/cron/telemetry-inference/route.ts:48` — implicit any
- `app/api/cron/vision-dispatch-sweep/route.ts:60,62,69` — unknown→string coercion
- `app/api/trash/route.ts:49` — ParserError type mismatch
- `lib/ai/cards/generators.ts:18` — missing `ActionCardCategory`/`ActionCardPriority` exports

These exist on `origin/main` independently of Phase 16; no rollback needed.

## Sprint commits on `main`

| Commit | Sprint | Status |
|---|---|---|
| `95930a9` | **16.1** — unified ops spine + inbox view | ✅ code committed; **migration NOT applied** (blocked) |
| `dc212fa` | Phase 15 F3 — Shop tab in persona switcher | ✅ |
| `7ffc761` | Phase 15 F1 — log redirect reason in admin/layout | ✅ |
| `ecb737e` | Phase 15.8 final QA report | ✅ |

**Sprints 16.2 – 16.12: NOT STARTED.** No commits, no files on disk.

## Migration files vs production schema

| File | On disk | Applied to prod | Conflict? |
|---|---|---|---|
| `109_ops_spine.sql` | ✅ committed (95930a9) | ❌ NOT applied | 🔴 **YES — see "Blocking finding"** |
| `110_ticket_replies.sql` | ❌ not authored | — | — |
| `111_cost_snapshots.sql` | ❌ not authored | — | — |
| `112_ops_assistant_conversations.sql` | ❌ not authored | — | — |
| `113_ops_event_prompts.sql` | ❌ not authored | — | — |

## 🔴 Blocking finding — migration 109 cannot apply

A pre-existing `support_tickets` table is live in production with an
**incompatible schema**. It came in via commit `9cc7e10` ("snapshot of
Codex work + security hardening", April 20 — 428 files of unreleased WIP).

### Production `support_tickets` (existing — 0 rows)

11 text columns, no enums, no triggers, 4 plain indexes:
```
id              uuid       NOT NULL
organization_id uuid       NOT NULL
user_id         uuid       NULL
type            text       NOT NULL    ← generic, not category enum
severity        text       NOT NULL    ← strings like 'medium', not P0|P1|P2|P3
status          text       NOT NULL    ← 'open', not new|ai_triaging|...
subject         text       NULL
description     text       NULL        ← migration 109 calls this 'body'
notes           text       NULL
created_at      timestamptz NOT NULL
updated_at      timestamptz NOT NULL
```

### Migration 109's `support_tickets` (drafted Sprint 16.1)

~25 columns, 4 enum types (`support_ticket_source`, `support_ticket_category`,
`ops_severity`, `support_ticket_status`), 2 triggers (auto-assign `ticket_number`
TKT-YYYYMMDD-NNNN; touch `updated_at`), 4 partial indexes, 5 RLS policies.

### Code already references the OLD shape

Four files use the pre-existing column names and would break under 109:

| File | Reads | Writes |
|---|---|---|
| `apps/web/app/api/support/route.ts` | `type, severity, status, subject, description` | inserts `severity:'medium'`, `status:'open'`, `description` |
| `apps/web/app/api/admin/support/route.ts` | `support_tickets.*` | — |
| `apps/web/app/(app)/admin/support/page.tsx` | `id, type, severity, status, subject, description, created_at, organization_id, organizations(name), user_id, user_profiles(full_name, email)` | — |
| `apps/web/app/(app)/admin/page.tsx:251` | `support_tickets` count | — |

### Other Phase 16 tables status

| Table from migration 109 | Exists in production? |
|---|---|
| `support_tickets` | ⚠️ exists with **wrong** schema |
| `error_events` | ❌ missing |
| `alert_events` | ❌ missing |
| `feedback_items` | ❌ missing |
| `churn_signals` | ❌ missing |
| `ops_inbox` view | ❌ missing |

Phase 16 enum types (`ops_severity` etc.): ❌ none present.

## F1 + F3 status

✅ **F1 fixed in `7ffc761`** — admin/layout.tsx now logs the redirect reason
(no profile / lookup error / not platform admin) instead of silently
falling through. `andy@horf.us` is correctly NOT a platform admin per a
production CHECK constraint locking `is_platform_admin=true` to
`info@myaircraft.us`. Schema, query, and constraint are all correct and
consistent.

✅ **F3 fixed in `dc212fa`** — persona switcher now shows Owner / Mechanic
/ Shop in both collapsed (icon) and expanded (label) views. Admin tab
appears as 4th column when `isPlatformAdmin` is true. Bonus fix:
`switchPersona("shop")` now navigates to `/workflow` (the correct
`PERSONA_CONFIG.shop.homeRoute`) instead of `/dashboard`.

⏸ **F2 still pending** — design call: should `is_platform_admin = true`
override the active persona's strict-UI guards, or should the persona
switcher win even when an admin is using the system? Phase 15 owner +
mechanic walkthroughs found admin reaches every persona-only route while
the switcher is set to Owner. Andy decides before any further fix here.

## What was applied in Task 3

**Nothing.** The apply attempt for migration 109 errored on
`relation "support_tickets" already exists`. The transaction rolled back
cleanly (BEGIN/COMMIT wrapper). Diagnostic scripts (`apply-109.ts`,
`inspect-109.ts`) were created in `apps/web/scripts/`, run, and then
deleted per T3.5 — they are not committed.

## Resume prerequisites

Phase 16 cannot resume from Sprint 16.2 until ONE of these paths is taken
to reconcile the `support_tickets` conflict:

1. **Drop + recreate** (clean slate, 0 rows to lose):
   - `DROP TABLE support_tickets CASCADE` in production
   - Re-apply migration 109 unchanged
   - Update 4 referencing files to use the new schema
     (will happen in Sprint 16.2 anyway — those routes get rewritten)
   - **Smallest spec drift; biggest production risk if any consumer
     relies on the old schema externally (e.g. dashboard, cron).**

2. **Rewrite migration 109** to be additive:
   - Use `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE … ADD COLUMN IF NOT EXISTS`
   - Add a `MIGRATION` step that copies `description → body`, `type →
     category` (mapped), `severity` ('medium' → 'P2', etc.)
   - Drop columns the new schema doesn't need (or leave them as legacy nullable)
   - **Most surgical; requires careful column-by-column reconciliation.**

3. **Rename existing → use a new table name**:
   - Migration 109 renames the existing `support_tickets` to
     `legacy_support_tickets`, then creates the new spine table
   - Old routes still work against the legacy table
   - Sprint 16.2 explicitly switches them over to the new table
   - **Cleanest separation but leaves cruft.**

Recommended: **Option 1 (drop + recreate)** since the table has 0 rows
and only 4 files reference it. Sprint 16.2 was already going to rewrite
all four routes (the brief replaces them with a richer ticket service).

## Open follow-ups

- 🔴 P0: reconcile `support_tickets` schema conflict before any further
  Phase 16 work (this file's blocking finding).
- ⏸ F2 design call (Phase 15 carry-over).
- 🟡 P3: pre-existing TS errors on `origin/main` (4 files) — not from
  Phase 16, fix opportunistically.
