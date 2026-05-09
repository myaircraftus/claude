# Phase 8 — Vision RAG: Complete Foundation + Retrieval Report

**Status:** Sprints 8.1 → 8.8 shipped on `main`. Foundation locked.
Real GPU embedding remains gated on `VISION_GPU_HOST` + creds; the
stub pipeline exercises every interface end-to-end so retrieval, the
review surfaces, and telemetry are all observable today.

**Date:** 2026-05-08
**Branch:** main
**Commits:** `ffad981`, `8dee67b`, `a2fa4d7`, `3808af5`, `f633b60`,
`b44299a`, `86b1c5c`, `123d5cd`, `c985c6f`, `0d791a9`
**Test count:** 334 passing (was 182 pre-Phase-8; +152 net)
**Sacred boundary:** `lib/ocr` and `lib/rag` untouched throughout —
verified per-sprint via `git diff --stat HEAD <baseline> apps/web/lib/ocr apps/web/lib/rag`.

---

## What shipped

### Foundation (Sprints 8.1–8.4) — already reported in `phase-8-foundation-report.md`

- Migrations 098 (`vision_pages` + `vision_index_jobs`) and
  099 (`vision_embeddings` + HNSW index) applied to production
- `vision-pages` storage bucket created (private)
- ColQwen2 selected as the page-image encoder; Modal selected as
  the runtime GPU host with Colab Pro for the offline backfill
- `lib/vision/registry.ts`, `lib/vision/renderer.ts`,
  `lib/vision/dispatcher.ts`, `lib/vision/index-query.ts`,
  `lib/vision/workers/factory.ts` (with stub worker) all in place
- `/api/vision/render` and `/api/vision/dispatch` API routes
- `/admin/vision` operational dashboard
- Decisions appended to `docs/new implementation/context.md` §11

### Sprint 8.5 — Hybrid retriever + MaxSim (`86b1c5c`)

- `lib/vision/maxsim.ts` — pure cosine + MaxSim math (zero-vector
  safe, dim-mismatch throws). 17 tests.
- `lib/vision/retriever.ts` — `hybridRetrieve(supabase, orgId, query, opts)`.
  Reads existing text-RAG via `retrieveChunks` (read-only), runs
  vision ANN + MaxSim re-rank, unions by (doc, page), produces
  combined score = α·text + (1-α)·vision. α from
  `VISION_TEXT_WEIGHT` (default 0.6). Modes: hybrid | text | vision.
  Sacred /lib/rag is mocked in tests — never invoked.
- `/api/vision/search` POST endpoint (rate-limited 30/min).
- 24 tests covering retriever orchestration.

### Sprint 8.6 — OpenAI Vision fallback (`123d5cd`)

- `lib/ai/openai-vision.ts` — multimodal wrapper +
  `logVisionActivity()` mirrors anthropic.ts:289 ai_activity_log shape.
- `lib/vision/openai-fallback.ts` — `openAiVisionAnswer()`. Caps at
  5 page images per call, 800-token output cap. Keyword-based
  confidence parser (HIGH/MEDIUM/LOW → 0.9/0.7/0.4) and citation
  parser ("PAGES: 0, 2, 5" → [0, 2, 5]). Stub mode kicks in when
  `OPENAI_API_KEY` unset OR `VISION_FALLBACK_MODE='stub'`.
- `/api/vision/answer` POST endpoint. Triggers fallback on
  combined-score < `VISION_FALLBACK_THRESHOLD` (default 0.3) or
  `force_fallback=true`. Rate-limited 10/min.
- 32 tests.

### Sprint 8.7 — Human review queue + feedback (`c985c6f`)

- Migration `100_vision_review_queue.sql` written (NOT applied).
  Two tables:
  - `vision_review_queue` — page-level review rows with
    `reason ∈ {low_confidence, failed_index, user_flag}` and
    state machine `pending → reviewed_ok | reviewed_problem | dismissed`
    (dismissed un-dismisses back to pending).
  - `vision_feedback` — append-only thumbs (-1 / 0 / +1) keyed on
    (user × query × page). Re-thumbing replaces, not duplicates.
- `lib/vision/review-queue.ts` — schemas, state-machine guard,
  CRUD (list/get/add/markReviewed), auto-enqueue helpers
  (`enqueueLowConfidence`, `enqueueFailedIndex`), feedback
  (`submitFeedback`, `getFeedbackAggregate`).
- `/api/vision/review` (GET, list) and `/api/vision/review/[id]` (PATCH,
  mark) — both owner/admin only. `/api/vision/feedback` (POST) — any
  org member, with cross-org page-lookup defense.
- `/admin/vision/review` UI — three tabs (pending / reviewed /
  dismissed), click-through detail modal with mark-OK / mark-problem /
  dismiss + reviewer notes.
- Auto-enqueue wired into:
  - `/api/vision/answer` (low_confidence before fallback fires)
  - `lib/vision/dispatcher.ts` (failed_index when > 50% of a job's
    pages fail)
  Both are best-effort with try/catch + console.warn — never block
  the answer or dispatcher's terminal transition.
- 50 tests.

### Sprint 8.8 — Confidence calibration + telemetry (`0d791a9`)

- Migration `101_vision_retrieval_log.sql` written (NOT applied).
  Append-only retrieval log with raw + calibrated confidence,
  latency, fallback signals. RLS: org admins read; service-role
  writes.
- `lib/vision/confidence.ts` — pure
  `calibrateConfidence(rawScore, signals)`:
  - reviewer verdict: `reviewed_ok` +0.20, `reviewed_problem` −0.30,
    `dismissed` −0.05
  - feedback aggregate: > +2 → +0.10, +1..+2 → +0.05,
    −1..−2 → −0.05, < −2 → −0.15
  - fallback cite-back (fallback cited the top retrieval page) → +0.05
  - cumulative result clamped to [0, 1]
- `lib/vision/telemetry.ts` — `logRetrieval` (best-effort, never
  throws), `resolveCalibrationSignals` (reads review queue + feedback
  for the top page × query), `calibrateForLogging` (one-call helper),
  plus `getTelemetrySummary` + `getLowConfidenceQueries` for the
  admin page.
- `/api/vision/search` and `/api/vision/answer` now log telemetry
  on success and on failure (status='error' row). Fire-and-forget.
- `/admin/vision/telemetry` — 7-day window. Volume, fallback rate,
  p50/p95 latency, avg raw vs calibrated confidence, top 20
  low-confidence queries. Graceful banner when migration 101 is
  not yet applied.
- 29 tests.

---

## Migrations status

| Migration | Status | Notes |
|---|---|---|
| 098_vision_pages_and_jobs.sql | **APPLIED** | `b44299a` |
| 099_vision_embeddings.sql | **APPLIED** | `b44299a` (HNSW idx confirmed) |
| 100_vision_review_queue.sql | **NOT APPLIED** | Andy applies via `apps/web/scripts/apply-100.ts` or psql |
| 101_vision_retrieval_log.sql | **NOT APPLIED** | Andy applies via `apps/web/scripts/apply-101.ts` or psql. Telemetry page renders a banner if missing. |

`vision-pages` storage bucket: created (private).

---

## Decisions captured

- **ColQwen2 over ColPali** — newer, ~2.2 GB, better doc recall.
- **Modal as runtime GPU host** — managed serverless GPU, no infra.
- **Colab Pro for backfill** — 351 documents → one-shot batch
  embedding without burning Modal credit.
- **HNSW (m=16, ef_construction=100)** on `vision_embeddings.summary_vector` — strong
  recall for our scale, written in migration 099.
- **MaxSim re-rank** stored as JSONB patch matrix instead of
  multivec extension — keeps the foundation portable across Postgres
  installs.
- **Sacred boundary on /lib/ocr + /lib/rag** — read-only across all
  eight sprints. Tests mock the boundary explicitly.
- **Stub-mode end-to-end** — every layer (worker, fallback, telemetry)
  has a deterministic stub fallback so the foundation is testable
  without GPU spend or OpenAI credit.

---

## Open decisions / next steps

These do NOT block ship — they are explicitly the things Andy will
decide before the real GPU run:

1. **HF token + Colab Pro signup** — needed to actually pull the
   ColQwen2 weights for the first backfill.
2. **VISION_GPU_HOST + creds** — Modal endpoint URL + signing key.
   Stub worker is the default until these are set.
3. **Apply migrations 100 + 101** — review queue + telemetry tables.
   The UI surfaces have graceful fallbacks until applied.
4. **Run real GPU embedding batch on the existing 351 documents** —
   Colab notebook in `docs/new implementation/colab-backfill.ipynb`
   (to be authored before the run).
5. **Calibrate the fallback threshold** — `VISION_FALLBACK_THRESHOLD`
   default of 0.3 is a guess. After 1–2 weeks of telemetry the
   `/admin/vision/telemetry` page will tell us where to set it.
6. **Confidence rule weights** — the calibrator's deltas (+0.20 for
   reviewer-OK, etc.) are first-pass values. Sprint 9 will tune
   these against retrieval log + reviewer-disagreement rate.

---

## File map (everything new in Phase 8)

```
apps/web/lib/vision/
  ├─ types.ts                  (8.1) state machine types
  ├─ registry.ts               (8.1) vision_pages + vision_index_jobs CRUD
  ├─ renderer.ts               (8.2) PDF → image rendering
  ├─ dispatcher.ts             (8.3, 8.7) job dispatcher + auto-enqueue
  ├─ workers/
  │   ├─ types.ts              (8.3)
  │   ├─ stub.ts               (8.3)
  │   └─ factory.ts            (8.3) + factory.test.ts
  ├─ index-query.ts            (8.4) embedding insert + ANN query
  ├─ storage.ts                (8.4) signed URL helper
  ├─ maxsim.ts                 (8.5) cosine + MaxSim math
  ├─ retriever.ts              (8.5) hybrid orchestrator
  ├─ openai-fallback.ts        (8.6) GPT-4o fallback
  ├─ review-queue.ts           (8.7) queue + feedback service
  ├─ confidence.ts             (8.8) pure calibrator
  ├─ telemetry.ts              (8.8) retrieval log writes + admin reads
  └─ *.test.ts                 (one per module — 152 tests total)

apps/web/lib/ai/
  └─ openai-vision.ts          (8.6) GPT-4o multimodal wrapper

apps/web/app/api/vision/
  ├─ render/route.ts           (8.2)
  ├─ dispatch/route.ts         (8.3)
  ├─ search/route.ts           (8.5, 8.8)
  ├─ answer/route.ts           (8.6, 8.7, 8.8)
  ├─ review/route.ts           (8.7) GET list
  ├─ review/[id]/route.ts      (8.7) PATCH mark
  └─ feedback/route.ts         (8.7) POST thumbs

apps/web/app/(app)/admin/vision/
  ├─ page.tsx                  (8.4) operational dashboard
  ├─ vision-admin-dashboard.tsx (8.4, 8.7, 8.8)
  ├─ review/                   (8.7) review queue UI
  └─ telemetry/                (8.8) telemetry UI

supabase/migrations/
  ├─ 098_vision_pages_and_jobs.sql       (8.1, applied)
  ├─ 099_vision_embeddings.sql           (8.1, applied)
  ├─ 100_vision_review_queue.sql         (8.7, NOT applied)
  └─ 101_vision_retrieval_log.sql        (8.8, NOT applied)

apps/web/scripts/
  ├─ apply-098-099.ts          (foundation, used)
  └─ create-vision-bucket.ts   (foundation, used)

docs/
  ├─ phase-8-foundation-report.md       (commit f633b60)
  ├─ phase-8-vision-rag-alignment.md    (stub doc)
  └─ phase-8-complete-report.md         (this file)
```

---

## Sacred-boundary proof (final)

```
$ git diff --stat ffad981..HEAD apps/web/lib/ocr apps/web/lib/rag
(empty — no changes)
```

The eight sprints touched zero bytes inside `/apps/web/lib/ocr` and
`/apps/web/lib/rag`. The retriever calls `retrieveChunks` from
`/lib/rag/retrieval` exclusively as a read-only consumer. Tests mock
that boundary so the real text-RAG never runs in CI either.

---

## What this unlocks

With Phase 8 foundation locked, two things are now possible without
further code:

1. **Apply migrations 100 + 101**, then `/admin/vision/review` is the
   triage cockpit and `/admin/vision/telemetry` is the dial. Stub mode
   produces real-shaped data on those pages.
2. **Set `VISION_GPU_HOST` + creds and re-render the 351 existing
   documents**. The dispatcher + workers + storage + index-query path
   all work today with the stub embeddings — swapping in the real
   worker is a one-line change in `lib/vision/workers/factory.ts`.

Phase 8 closes here. Phase 9 will tune the calibrator against the
retrieval log once we have ≥ 1 week of real telemetry.
