# Phase 11 — Hybrid Colab/Modal Architecture Report

**Status:** 🟢 **Code shipped.** Migration 102 + Phase 11 smoke test
deferred to Andy's first run after applying the migration. The hybrid
dispatch path is live in code; activating it on the live system is
two commands away (apply migration, start Colab worker).

**Date:** 2026-05-09
**Branch:** main
**Commits:** `d63df5d` (11.1) → `63513ad` (11.2) → `2922e9a` (11.3) → `83043c8` (11.4) → `7b28d18` (11.5) → `1e8a71a` (11.6) → this report (11.7)

## TL;DR

The vision dispatch pipeline now defaults to a queue-based model
(`VISION_DISPATCH_MODE=queue`):

- New jobs get inserted into `vision_index_jobs` and return immediately.
- Colab Pro queue worker (free under $10/mo subscription) polls every
  15s, claims one job atomically, processes pages on L4 GPU.
- Modal fallback sweep cron runs every 5 min — catches jobs that the
  Colab worker missed (offline) or got stuck on (kernel died mid-job).

**Cost: ~$11-16/mo** (down from estimated $30-50/mo for Modal-only at
typical operational volume).

**Backward compat:** `VISION_DISPATCH_MODE=direct` flips back to the
Sprint 8.3 inline-embed behavior. Used by the fallback cron to force
specific jobs onto Modal, and reserved as ops-emergency switch.

## Sprint outcomes

### Sprint 11.1 — Worker heartbeat (`d63df5d`)
- ✅ Migration `102_worker_heartbeat.sql` (NOT applied — Andy applies via tsx-pg)
- ✅ `lib/vision/heartbeat.ts` service (5 helpers; schema-validated upsert; service-role-only writes; org-admin reads)
- ✅ 28 tests covering schema validation + idempotent upsert + cutoff filtering + status updates
- One row per `worker_id` (UNIQUE), upserted; staleness detection at 60s

### Sprint 11.2 — Dispatcher queue mode (`63513ad`)
- ✅ `lib/vision/dispatch-mode.ts` — env reader with case-insensitive parse, fail-safe to 'queue'
- ✅ `dispatcher.ts` refactored: `DispatchOptions.mode` overrides env; QUEUE mode never calls the worker; DIRECT mode logs a console.warn
- ✅ `DispatchResult.status` extended with `'queued'` for queue-mode return
- ✅ 6 dispatch-mode + 5 new queue-mode dispatcher tests; existing 16 tests updated to pass `{ mode: 'direct' }` explicitly
- ✅ 23/23 dispatcher tests + 6/6 mode tests green

### Sprint 11.3 — Colab queue worker notebook (`2922e9a`)
- ✅ `apps/web/scripts/colab/vision-queue-worker.ipynb` (no secrets — `userdata.get(...)` only)
  - 6 cells: setup, secrets/Supabase, ColQwen2 load, helpers (claim_job/complete_job/fail_job/heartbeat/process_job_pages), poll loop with daemon heartbeat thread, post-stop verify
  - `claim_job()` is race-safe via two-step optimistic UPDATE WHERE status='queued'
  - PDFs downloaded + rasterized once per source_document_id (groups job pages by parent doc)
- ✅ `docs/runbooks/colab-queue-worker.md` — start/stop, limits, costs, failure modes

### Sprint 11.4 — Modal fallback sweep cron (`83043c8`)
- ✅ `/api/cron/vision-fallback-sweep` — every 5 min via vercel.json
  - stuck-queued (>10 min) → mark gpu_host=modal, dispatch DIRECT
  - stuck-running (>20 min) → roll embedding pages back to pending, reset job to queued+modal, dispatch DIRECT
  - cap: 10 dispatches per tick
  - auth: vercel-cron UA OR Bearer CRON_SECRET (existing pattern)
- ✅ 8 tests (auth, empty case, queued dispatch, running rollback, cap, error isolation)
- ✅ `/admin/vision/workers` — live heartbeat + stuck-job dashboard, auto-refresh every 30s
- ✅ Linked from `/admin/vision` header

### Sprint 11.5 — Wire env vars + flip default (`7b28d18`)
- ✅ `VISION_DISPATCH_MODE=queue` set on `.env.local` (perms 600) + Vercel Production
- ✅ Empty commit triggers Vercel redeploy
- ✅ `docs/runbooks/vision-architecture.md` — operator runbook

### Sprint 11.6 — End-to-end smoke (`1e8a71a`)
- ✅ `apps/web/scripts/smoke-phase11.ts` ships ready-to-run
- 🟡 **Live smoke deferred** until Andy applies migration 102.
  Per HARD STOP rule #4 (migrations not applied during this session),
  the smoke's preflight correctly fails with:
  ```
  PREFLIGHT FAIL: vision_worker_heartbeat table not found.
  Apply migration 102 first: cd apps/web && npx tsx scripts/apply-102.ts
  ```
- Smokes A (Colab happy path) and B (Modal fallback) are documented
  in the script; both are idempotent and clean up after themselves.

### Sprint 11.7 — Final report + architecture (this commit)
- ✅ `docs/architecture/vision-rag-hybrid-workers.md` — full architecture reference (ASCII flow diagram, components, cost model, performance characteristics, operator decisions, failure modes)
- ✅ This file

## Migrations status

| Migration | Status | Notes |
|---|---|---|
| 098 / 099 / 100 / 101 (Phases 8/9) | 🟢 **APPLIED** | Production |
| **102_worker_heartbeat.sql** | 🟡 **NOT APPLIED** | Andy applies via `apps/web/scripts/apply-102.ts` (which Andy authors following the apply-098-099 / apply-100 pattern) |

## New env vars

| Name | Where | Value |
|---|---|---|
| `VISION_DISPATCH_MODE` | apps/web/.env.local + Vercel Production | `queue` |

## Activation steps for Andy

To go live with the hybrid path:

1. **Apply migration 102:**
   ```bash
   cd apps/web
   # Author scripts/apply-102.ts following apply-098-099 / apply-100 pattern
   npx tsx scripts/apply-102.ts
   ```
2. **Start the Colab queue worker:**
   - Open `apps/web/scripts/colab/vision-queue-worker.ipynb` in Colab Pro
   - Verify Colab Secrets exist (HF_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
   - Connect L4 runtime → run cells 1-5 → leave open
3. **Smoke A (Colab happy path):**
   ```bash
   cd apps/web
   npx tsx scripts/smoke-phase11.ts colab
   ```
4. **Smoke B (Modal fallback):**
   ```bash
   # Stop the Colab worker first
   npx tsx scripts/smoke-phase11.ts modal
   ```
5. **Verify production:**
   - Visit https://www.myaircraft.us/admin/vision/workers
   - Should show alive Colab worker with heartbeat ticking

## Sacred boundary verification

```
$ git diff --stat HEAD~7 apps/web/lib/ocr apps/web/lib/rag
(empty — no changes touched the sacred OCR/RAG pipeline across all
of Phase 11)
```

## Open follow-ups

- **Calibrator tuning** — still needs ≥1 week of telemetry from
  `/api/vision/search` and `/api/vision/answer` before tuning the
  weights in `lib/vision/confidence.ts`.
- **The 32 stalled docs from Phase 10** — Phase 10.5 is in progress
  in parallel (live Colab kernel still indexing as of this writing,
  9724 indexed / 0 failed). Will be finalized by the existing backfill
  notebook OR by spinning up the new queue worker (Phase 11.3) which
  will pick up any vision_index_jobs in 'queued' state.
- **Webhook from doc upload to dispatch** — currently new doc uploads
  do NOT auto-create a vision_index_jobs row. Add this in a future
  sprint; in queue mode it'll be a one-line addition to
  `lib/ingestion/server.ts`.
- **Multi-org worker affinity** — currently any worker can claim any
  job. If a particular org's workload becomes a problem, add an
  `org_filter` column to `vision_worker_heartbeat` and have
  `claim_job()` honor it. Not needed yet at our scale.
- **`apply-102.ts` script** — not authored in this session per the
  HARD STOP rule on migrations. Andy adds it when applying 102.

## Related docs

- `/docs/architecture/vision-rag-hybrid-workers.md` — architecture reference
- `/docs/runbooks/colab-queue-worker.md` — operator runbook for the Colab worker
- `/docs/runbooks/vision-architecture.md` — high-level operator runbook
- `/docs/phase-9-deployment-report.md` — Modal worker baseline (still active for fallback)
