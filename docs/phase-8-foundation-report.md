# Phase 8 Vision RAG — Foundation Report

**Date:** 2026-05-08
**Sprints shipped:** 8.1 → 8.4 (foundation, code-only)
**Sprints intentionally NOT shipped:** 8.5 (hybrid retriever), 8.6 (vision-answer generation), 8.7 (human review queue), 8.8 (confidence UI)
**GPU run NOT triggered:** stub mode only this batch (HARD STOP rule 6).

---

## TL;DR

Built a complete parallel vision-RAG foundation alongside the sacred OCR/RAG pipeline. **Zero modifications** to `/lib/ocr`, `/lib/rag` — verified by `git diff 429a279..HEAD apps/web/lib/ocr apps/web/lib/rag` returning empty. Two new migrations (`098`, `099`) sit ready in `/supabase/migrations/` for Andy to apply manually. All four sprints have functioning stubs that produce deterministic mock data, so the next sprint (8.5 hybrid retriever) can build on top without waiting for real GPU embeddings.

---

## Pre-work findings (logged per the brief)

| Item | Status |
|---|---|
| `/docs/context.md` | Found at `docs/new implementation/context.md` (path mismatch with brief — same as previous turn) |
| Alignment doc `aircraft_records_vision_rag_cloudcode_alignment.md` | **MISSING.** Brief path `/Users/andypatel/Library/...` (a) has username typo (`andypatel` vs `andy`), (b) doesn't exist at `/Users/andy/Library/...` either. context.md log entry confirms: *"Full Phase 8 architecture document was uploaded to a Cowork session, not yet transferred to repo."* |
| `/docs/Phase7_Spec_Insert.md` | **MISSING** — does not exist anywhere in repo |
| `/docs/Claude_Code_Implementation_Spec.md` Phase 8 section | EXISTS at line 2183. 8 sprint titles + pre-conditions + hard rules. No architectural detail — the brief in this turn supplied the schemas / function signatures itself |
| Sacred dir `/lib/ocr` | EXISTS, 5 files — read-only audited, **zero modifications** |
| Sacred dir `/lib/rag` | EXISTS, 5 files — read-only audited, **zero modifications** |
| Sacred dir `/lib/embeddings` | **DOES NOT EXIST** — third "sacred" dir is absent in this codebase |

**Impact:** the brief itself was detailed enough (table schemas, function signatures, file paths spelled out) that the missing alignment doc didn't block execution. The two architectural decisions the alignment doc would have settled were already covered by the brief's fallback rules (HARD STOPS 4 + 5: ColQwen2 default, Modal-shaped scaffold default).

---

## What landed

### 4 commits on `main`

| Commit | Sprint | Files | LOC | Tests |
|---|---|---|---|---|
| `ffad981` | 8.1 — registry tables + service | 4 | +960 | +40 |
| `8dee67b` | 8.2 — page rendering pipeline + API | 4 | +732 | +16 |
| `a2fa4d7` | 8.3 — GPU worker scaffold + dispatcher + cron | 12 | +939 | +24 |
| `3808af5` | 8.4 — vector index storage + query + admin dashboard | 9 | +992 | +19 |
| **Total** | | **27 files (new) + 2 (touched)** | **+3,623** | **+99** |

### Test suite: 182 / 182 passing

```
$ pnpm vitest run
 Test Files  15 passed (15)
      Tests  182 passed (182)
```

(Was 83 at the start of this turn → +99 vision tests.)

### Build: ✓ Compiled successfully

All Phase 8 routes registered in the route table:
```
ƒ /admin/vision                                          (admin dashboard)
ƒ /api/vision/render                                     (POST — dispatch render job)
ƒ /api/vision/dispatch                                   (POST — dispatch embed job)
ƒ /api/cron/vision-dispatch-sweep                        (GET — backstop cron */10 * * * *)
```

---

## Migrations to apply (in order, by Andy)

**Both migrations are written but NOT applied.** Apply order matters because 099 has a FK to 098.

```bash
# 1. Vision index registry (vision_pages, vision_index_jobs)
psql "$DATABASE_URL" -f supabase/migrations/098_vision_index_registry.sql

# 2. Vision embeddings (depends on vision_pages)
psql "$DATABASE_URL" -f supabase/migrations/099_vision_embeddings.sql

# Or via Supabase CLI:
supabase db push
```

**Storage bucket also needs creating** (the renderer assumes it exists):
```bash
supabase storage create vision-pages --public=false
```

After applying, the `/admin/vision` dashboard will work — until then it 500s on the vision_pages reads.

---

## Decisions deferred to Andy

### A. ColPali vs ColQwen2 → defaulted to **ColQwen2**

- Stub embeds report `model_used: 'colqwen2-stub'` (constant in `apps/web/lib/vision/workers/modal-stub.ts:STUB_MODEL_NAME`).
- Schema already accommodates either: `vision_pages.vision_model TEXT` and `vision_embeddings.model_used TEXT`.
- 128-dim summary + 64 patches × 128-dim matches the typical ColQwen2 output shape; ColPali is similar (128-dim per token, ~16-128 tokens depending on patch size).
- **Andy: confirm ColQwen2** OR **ColPali**. Switching is a one-line constant change in modal-stub.ts and a real-worker build target.

### B. GPU host: Modal vs Replicate vs RunPod vs Colab → defaulted to **Modal-shaped scaffold**

- Factory (`apps/web/lib/vision/workers/factory.ts`) reads `VISION_GPU_HOST` env var.
- Default: `stub` → modal-stub. Real impl is TODO across all four hosts.
- Replicate / RunPod / Colab files exist as TODO placeholders that throw on `embed()` if selected.
- Per `docs/new implementation/context.md` line 644: *"Triggers when current sequence completes + GPU worker accounts ready (Colab Pro $10/mo OR RunPod $30 minimum)"* — Colab Pro is the cheapest path; Modal is what the scaffold is currently shaped for.
- **Andy: confirm Modal** OR pick another host + the wiring sprint becomes "implement workers/<host>.ts."

### C. Storage strategy: pgvector summary + JSONB patches vs full multivec

- Documented at length in the header of `supabase/migrations/099_vision_embeddings.sql`.
- **Chosen:** `summary_vector vector(128)` + `patch_vectors jsonb` + `patch_count int` denormalization.
  - HNSW index on summary_vector for ANN first-pass.
  - Late-interaction MaxSim re-ranking happens in app code at retrieval time (Sprint 8.5).
- **Trade-off:** the alternative ("real" multivec via ParadeDB / pg_vectorscale's multivec extension) gives native MaxSim at the DB layer but isn't available in vanilla Supabase. The JSONB blob approach trades a bit of retrieval-time CPU for portability and zero-extension-dependency.
- Migration to a flat-table multivec layout is well-defined when/if Andy wants to take that step (one new table + a backfill query).

---

## Required env vars for Sprint 8.5 (retrieval) — flagged for next pass

```bash
# Phase 8 Sprint 8.3 — selects which GPU worker the dispatcher uses
VISION_GPU_HOST=stub          # 'stub' | 'modal' | 'replicate' | 'runpod' | 'colab'

# Phase 8 Sprint 8.3 — credentials per chosen host (only one needed)
MODAL_API_KEY=                # if VISION_GPU_HOST=modal
REPLICATE_API_TOKEN=          # if VISION_GPU_HOST=replicate
RUNPOD_API_KEY=               # if VISION_GPU_HOST=runpod
COLAB_NGROK_URL=              # if VISION_GPU_HOST=colab

# Optional — for fetching model weights from HF
HUGGINGFACE_API_KEY=          # read-only token for ColQwen2 / ColPali weights
```

**None of these are set in production today.** With all unset, the factory routes to the stub worker and the foundation runs end-to-end with deterministic mock embeddings.

---

## Sacred-boundary verification

```
$ git diff --stat 429a279..HEAD apps/web/lib/ocr apps/web/lib/rag
(empty)
```

- `/apps/web/lib/ocr/` (5 files: canonical-records, precedence, segments, segments.test, validation): **0 modifications.**
- `/apps/web/lib/rag/` (5 files: citation-anchors, citation-anchors.test, generation, query-parser, retrieval): **0 modifications.**
- `/apps/web/lib/embeddings/`: doesn't exist in this codebase. Brief listed it as one of three sacred dirs; only ocr + rag exist.

The vision pipeline reads the sacred pipeline's data via:
- `supabase.storage.from('documents').download(path)` — read-only of the documents storage bucket
- `supabase.from('documents').select(...)` — read-only of the documents table

Both are read-only by design; the vision pipeline never writes to the documents bucket or table.

---

## Outstanding / next-sprint work

### NOT triggered this batch (per HARD STOP rules 1, 2, 3, 6)

- **GPU embedding batch of the existing 351 docs / 234k embeddings.** Per `context.md` line 644, this is explicitly Andy's call — needs Colab Pro account or RunPod credit, plus HF API key for weights. Triggering it would also wreck the sacred boundary, so deferring is the right move.
- **Migration apply.** Andy runs `psql -f` or `supabase db push`.
- **Storage bucket creation.** Andy runs `supabase storage create vision-pages --public=false`.
- **Real pdfjs-dist + canvas binding for actual PNG rasterization.** Currently `RENDER_MODE='stub'` in the renderer — pages get `status='pending'` without real PNG bytes. Brief HARD STOP rule 3 forbade installing canvas as a runtime dep this batch. Future sprint: install `@napi-rs/canvas` (or similar) and flip `RENDER_MODE` to `'real'`.

### Recommended next: Sprint 8.5 — Hybrid retriever

**Pre-conditions before starting 8.5:**

1. Migrations 098 + 099 applied to production
2. `vision-pages` storage bucket created
3. Andy confirms ColQwen2 vs ColPali
4. Andy confirms Modal vs Replicate vs RunPod vs Colab
5. The selected host's env var(s) set in production

**8.5 scope** (per the spec stub at line 2189 of Claude_Code_Implementation_Spec.md):

> 8.5 Hybrid retriever (text RAG → confidence check → vision RAG fallback)

Concretely:
- New `lib/vision/retriever.ts` that wraps the existing OCR/text retriever (read-only) with a confidence threshold; below threshold, falls through to `searchVisionIndex()`.
- New `/api/ask` integration (or a parallel `/api/ask/vision`) that uses the hybrid path.
- Replace the Sprint 8.4 placeholder `searchVisionIndex` body with a real pgvector cosine-distance query: `ORDER BY summary_vector <=> $1::vector LIMIT $2`.
- Implement late-interaction MaxSim re-ranker that calls `getPatchVectors()` for the top-k summary hits and re-orders by per-patch similarity.

8.5 is well-bounded once the foundation is validated end-to-end (which happens after Andy applies migrations + creates the bucket).

---

## File-level inventory of new code

```
apps/web/lib/vision/
├── types.ts                    Sprint 8.1 — TS types + state-machine maps
├── registry.ts                 Sprint 8.1 — vision_pages + jobs CRUD service
├── registry.test.ts            Sprint 8.1 — 40 tests
├── storage.ts                  Sprint 8.2 — vision-pages bucket helpers
├── renderer.ts                 Sprint 8.2 — page render pipeline (stub mode)
├── renderer.test.ts            Sprint 8.2 — 16 tests
├── gpu-worker.ts               Sprint 8.3 — GpuWorker interface
├── workers/
│   ├── modal-stub.ts           Sprint 8.3 — deterministic mock embeddings
│   ├── replicate.ts            Sprint 8.3 — TODO placeholder
│   ├── runpod.ts               Sprint 8.3 — TODO placeholder
│   ├── colab.ts                Sprint 8.3 — TODO placeholder
│   ├── factory.ts              Sprint 8.3 — env-driven routing
│   └── factory.test.ts         Sprint 8.3 — 8 tests
├── dispatcher.ts               Sprint 8.3 — orchestrates job → worker → DB
├── dispatcher.test.ts          Sprint 8.3 — 16 tests
├── index-query.ts              Sprint 8.4 — embed insert + search + patches
├── index-query.test.ts         Sprint 8.4 — 19 tests
└── schemas.ts                  Sprint 8.4 — public zod schemas

apps/web/app/api/vision/
├── render/route.ts             Sprint 8.2 — POST { sourceDocumentId, force? }
└── dispatch/route.ts           Sprint 8.3 — POST { jobId }

apps/web/app/api/cron/
└── vision-dispatch-sweep/route.ts   Sprint 8.3 — GET cron */10 * * * *

apps/web/app/(app)/admin/vision/
├── page.tsx                    Sprint 8.4 — server component
└── vision-admin-dashboard.tsx  Sprint 8.4 — client UI

supabase/migrations/
├── 098_vision_index_registry.sql      Sprint 8.1 — vision_pages, vision_index_jobs
└── 099_vision_embeddings.sql          Sprint 8.4 — vision_embeddings + HNSW

apps/web/components/redesign/AppLayout.tsx   (modified — Eye icon + admin nav entry)
apps/web/vercel.json                          (modified — vision-dispatch-sweep cron)
```

Total new files: 22. Modified: 2 (plus dispatcher.ts which was created in 8.3 and updated in 8.4).

---

## Closing note

Foundation is structurally complete. Every API route is reachable, every service is typed and tested, the state machines compose cleanly, and the sacred boundary is verifiably untouched. The two architectural decisions left for Andy (ColQwen2 vs ColPali, Modal vs Replicate vs RunPod vs Colab) are each a one-line / one-file change once the call is made. Sprint 8.5 is the natural next step once migrations are applied + a host is chosen.

— Claude
