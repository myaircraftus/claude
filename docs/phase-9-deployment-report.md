# Phase 9 — Real GPU Embedding Deployment Report

**Status:** in progress (Phase H bulk backfill running).
**Date:** 2026-05-08
**Branch:** main
**Modal app:** `aircraft-vision-worker` in workspace `info-35149`
**Endpoints:**
- `/embed`: <https://info-35149--embed.modal.run>
- `/backfill`: <https://info-35149--backfill.modal.run>
- `/health`: <https://info-35149--health.modal.run>

---

## Phase outcomes

### A — Wire env vars (`181f92c`)
- ✅ `HUGGINGFACE_API_KEY` (hf_*), `MODAL_TOKEN_ID` (ak-*), `MODAL_TOKEN_SECRET` (as-*),
  `VISION_GPU_HOST=modal` set in `apps/web/.env.local` (perms 600, gitignored)
- ✅ Same 4 vars on Vercel Production, encrypted
- ✅ Modal CLI installed (`modal-1.4.2`); profile `aircraft-us` active; workspace `info-35149`
- ⚠ First Modal token paste was malformed (`wk-/ws-` prefix vs Modal's `ak-/as-`). User
  re-supplied correct tokens; resumed cleanly. Logged in chat as a HARD STOP that surfaced
  the typo before deploy.

### B — Modal app skeleton (`5726abb`)
- ✅ `modal/vision-worker/` directory created at repo root
- ✅ `main.py`, `requirements.txt`, `.modalignore`, `README.md` in place
- ✅ Modal Secret `aircraft-vision-secrets` created with 4 keys:
  `HUGGINGFACE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MODAL_API_KEY`
- ✅ `MODAL_API_KEY` (32-byte random hex) generated and staged in
  `.claude/_phase9_state/modal_api_key.txt` (gitignored, perms 600)

### C — `/embed` endpoint (covered in `5726abb`, refined in `c120ccb`)
- ✅ Implemented in `main.py` `VisionWorker.embed()`
- ✅ Bearer auth via `Authorization: Bearer ${MODAL_API_KEY}` header check
- ✅ Per-page error isolation matches the Sprint 8.9 contract verbatim
- ✅ Mean-pool over patch tokens → 128-dim summary
- ✅ Batch ≤ 8 pages, GPU-side mini-batching at 8

### D — `/backfill` endpoint (covered in `5726abb`, refined in `c120ccb`)
- ✅ Implemented in `main.py` `VisionWorker.backfill()`
- ✅ Reads `documents.file_path` (was `storage_path` — fixed during smoke test)
- ✅ pdf2image at 180 dpi, GPU-side batched at 8 pages/forward pass
- ✅ Idempotent vision_pages upsert on `(org, doc, page_number)`
- ✅ Per-page status='indexed' on success, status='failed' + error_message on per-page failure

### E — Deploy Modal app (`8414b3a`)
- ✅ `modal deploy modal/vision-worker/main.py` succeeded.
- ✅ Built image `im-bTgRxDmNzWddPUCa8KnoOt` in 89s (final pinned image).
- ✅ 3 endpoints created. Healthcheck returns 200.
- ⚠ Two version-pin iterations needed:
  - First deploy installed `transformers==5.8.0` + `peft==0.18.1`. Runtime
    failure on model load: `ImportError: _maybe_shard_state_dict_for_tp`.
  - Switched to `colpali-engine==0.3.5` (transformers 4.x range, peft 0.11.x).
    Image rebuilt cleanly; ColQwen2 weights load on cold start in ~30s.

### F — Wire `MODAL_ENDPOINT_URL` to Vercel (`8414b3a`)
- ✅ `MODAL_ENDPOINT_URL=https://info-35149--embed.modal.run` on Vercel Production + `.env.local`
- ✅ `MODAL_API_KEY` (the bearer token, 64-hex-char) on Vercel Production + `.env.local`
- ✅ Vercel redeploy triggered via empty commit
- ✅ All 6 Phase-9 vars present: `vercel env ls` confirms Production

### G — End-to-end smoke test (`c120ccb`)
- ✅ Doc: `61c8b87b-6f30-4731-9df4-8af5719c455e` (1-page Airframe ESignedRecord, 36 KB)
- ✅ POST `/backfill` → HTTP 200 in 4.6s (warm container)
- ✅ Response: `pages_processed=1, pages_failed=0, errors=[]`
- ✅ DB verification:
  - `vision_pages.status='indexed'`, `vision_model='colqwen2'`
  - `vision_embeddings`: dim=128, patches=64, model='colqwen2'
  - Vector shape spot-check: 128-element `summary_vector`, 64 patches × 128 dims
  - All shape numbers match the Sprint 8.9 contract exactly

### H — Bulk backfill (in progress)
- See "Backfill stats" section below.

### I — Final report
- This document.

---

## Iteration history (Phase 9 fixes that landed during smoke test)

| # | Issue | Fix |
|---|---|---|
| 1 | `documents.storage_path` doesn't exist | Real schema column is `file_path`. Updated `main.py`'s `/backfill` query. |
| 2 | FastAPI signature `payload: dict, authorization: str = ""` doesn't bind body+header | Switched to `request: Request`, parse `request.json()` and read `request.headers["authorization"]` manually. Required `pip install fastapi pydantic` locally so `modal deploy` could import the file. |
| 3 | `colpali-engine 0.3.15` + `transformers==5.8.0` + `peft==0.18.1` → ImportError on model load (`_maybe_shard_state_dict_for_tp` not in peft 0.18) | Pinned `colpali-engine==0.3.5` (transformers 4.x range, peft 0.11.x — a tested-together combo). |
| 4 | Hugging Face secondary fetches warned about unauthenticated requests | Set both `HF_TOKEN` and `HUGGING_FACE_HUB_TOKEN` env vars in `@modal.enter()` so huggingface_hub auto-detects. |
| 5 | Re-running `/backfill` after a failed first attempt → `vision_pages_doc_page_unique` duplicate-key | Switched insert → upsert on `(org, doc, page_number)`. Idempotent partial-failure recovery. |

---

## Backfill stats (filled at end of Phase H)

> Section auto-populated by the final commit. All numbers below are
> live counts at backfill completion.

- **Total documents:** _filled at end_
- **Successfully indexed:** _filled at end_
- **Failed:** _filled at end_ (with reason groupings)
- **Total pages:** _filled at end_
- **Total Modal GPU time:** _filled at end_
- **Total cost:** _filled at end_

---

## Sacred boundary verification

```
$ git diff --stat HEAD~10 apps/web/lib/ocr apps/web/lib/rag
(empty — no changes touched the sacred OCR/RAG pipeline across all 9 phases)
```

The Phase 9 changes are scoped to:
- `modal/vision-worker/` (new directory at repo root, separate deploy unit)
- `apps/web/.env.local` + Vercel env (configuration, not code)
- `apps/web/scripts/verify-smoke.ts` + `scripts/backfill-vision.ts` (operational tools)
- `docs/phase-9-deployment-report.md` (this file)

Nothing under `apps/web/lib/ocr` or `apps/web/lib/rag` was touched.

---

## Recommended next steps (ranked)

1. **Telemetry baseline week.** Now that real ColQwen2 embeddings are
   live, let `/api/vision/search` and `/api/vision/answer` collect
   ~7 days of real queries via `/admin/vision/telemetry`. Until we
   have ≥100 calibrated_confidence rows the calibrator deltas are
   first-pass guesses.
2. **Tune confidence calibrator weights.** With telemetry in hand,
   compare `raw_confidence` vs reviewer verdicts to fit better
   `verdict:reviewed_ok = +X` and feedback-aggregate deltas.
   Sprint 8.8's `lib/vision/confidence.ts` is the only file to edit.
3. **New-document-upload Modal trigger.** Extend `lib/ingestion/server.ts`
   to enqueue a `vision_index_jobs` row on every successful PDF parse
   and have the dispatcher cron call `/embed` for the new pages.
   Currently the only path to embedding is the `/backfill` endpoint;
   net-new uploads after Phase 9 don't auto-embed.
4. **Phase 2 nav reorg + Phase 3/4 click-through.** Deferred from
   the overnight run.
5. **The 234 outstanding zod routes.** Long-tail input-validation
   work; can be sliced into smaller commits.
6. **CSP nonce hardening.** Last MEDIUM finding from
   `docs/security-audit.md`.

---

## Open issues / known gaps

- **`/embed` endpoint not yet exercised end-to-end.** Phase 9 used
  `/backfill` for everything; the live `/api/vision/answer` path
  in production calls `/embed` per page and that surface should be
  smoke-tested with a single retrieval query before relying on it
  for real user load.
- **Cold start cost.** First call after 5 min idle takes ~30s for
  ColQwen2 weights to land. For the live `/api/vision/answer` path
  this means a worst-case 30s+ first-call latency. If that hurts
  UX, set `min_containers=1` on `VisionWorker` (~$22/mo always-on).
- **fastapi pinned locally.** `pip install --break-system-packages
  fastapi pydantic` was needed for `modal deploy` to import
  `main.py`. Future contributors will hit the same wall — capture
  in a developer-onboarding note.
