# Phase 8 Vision RAG — Alignment Document (Stub)

> **⚠ Original alignment doc lost.** Per the brief that drove this build (overnight 2026-05-08), the canonical alignment document was uploaded to a Cowork session and never transferred to the repo. Searches under `/Users/andy/Library/Application Support/Claude/local-agent-mode-sessions/**/uploads/` returned nothing matching `vision`, `alignment`, or `aircraft_records_vision`. The brief itself supplied schemas, function signatures, file paths, and explicit fallback rules in enough detail that the foundation built without it.
>
> **Foundation is on disk and verified.** See:
> - Sprint 8.1 — registry tables: commit `ffad981`
> - Sprint 8.2 — page rendering: commit `8dee67b`
> - Sprint 8.3 — GPU worker scaffold: commit `a2fa4d7`
> - Sprint 8.4 — vector index storage: commit `3808af5`
> - Foundation report: `/docs/phase-8-foundation-report.md`
> - Spec stub (8.1–8.8 outline): line 2183 of `/docs/new implementation/Claude_Code_Implementation_Spec.md`
>
> **If the original alignment doc surfaces later**, replace the rest of this file with its content. Until then, the contracts below capture what was actually built.

---

## Architectural decisions captured during the build

These are the calls the alignment doc was supposed to settle. They're recorded in `docs/new implementation/context.md` §11 (decisions log) and reproduced here for convenience.

### 1. Model: **ColQwen2** (over ColPali)

- Newer (Sept 2024 vs Aug 2024), better recall on document images per ColPali authors' own benchmarks.
- Smaller weights (~2.2 GB vs 5.5 GB) → faster Modal cold-start.
- API-shape-compatible: both produce 128-dim per-token multi-vectors.
- Stub constant: `STUB_MODEL_NAME = 'colqwen2-stub'` in `apps/web/lib/vision/workers/modal-stub.ts`.
- Reversible: change one constant + the real worker's HF model id.

### 2. GPU Host: **Modal for runtime, Colab Pro for backfill**

- **Modal** — production live indexing of new uploads. Pay-per-second, cold-start ~10s on T4, scales to zero idle. ~$0.0004 per page on T4. Selected by `VISION_GPU_HOST=modal` once `MODAL_API_KEY` is set.
- **Colab Pro** ($10/mo) — one-shot backfill notebook for the existing 351 docs / 234k embeddings subset that needs vision indexing. Tunneled FastAPI endpoint via ngrok; cheaper for a single batch than Modal. Selected by `VISION_GPU_HOST=colab` + `COLAB_NGROK_URL=<tunnel>`.
- Stub mode (`VISION_GPU_HOST=stub` or unset) is the dev / CI default. Deterministic fake embeddings keep retrieval testable without GPU spend.

### 3. Storage: **pgvector summary + JSONB patches**

- `summary_vector vector(128)` with HNSW index for ANN first-pass.
- `patch_vectors jsonb { patches: number[][] }` for late-interaction MaxSim re-rank in app code.
- `patch_count int` denormalized for memory planning.
- Trade-off vs a "real" multi-vector pgvector extension (multivec / ParadeDB): we keep ColPali/ColQwen2 expressivity at the cost of in-app re-rank CPU. Migration to a flat-table multivec layout is well-defined when needed.

---

## Sacred boundary

The existing OCR/text-RAG pipeline (`/apps/web/lib/ocr/`, `/apps/web/lib/rag/`) is **read-only** during all of Phase 8. The vision pipeline:

- Reads the `documents` storage bucket (download only) to fetch source PDFs.
- Reads the `documents` table (`select` only) to look up the file path for a given doc.
- Never writes to either.

Verified by `git diff <pre-Phase-8-commit>..HEAD apps/web/lib/ocr apps/web/lib/rag` returning empty.

---

## Open follow-ups (alignment doc gaps the build couldn't resolve)

1. **Confidence threshold for low-confidence → vision fallback.** The brief suggested `0.3` (`combined < 0.3 → invoke openAiVisionAnswer`). Real-world threshold likely needs telemetry-driven tuning (Sprint 8.8).
2. **Top-k for OpenAI Vision payload.** Brief said "top 1-5 pages only sent to OpenAI Vision (cost control)". Implemented as a configurable cap; default 5.
3. **Late-interaction MaxSim weights.** Combined score = `0.6 * text + 0.4 * vision` per the brief. Configurable via `VISION_TEXT_WEIGHT` env var; defaults to those ratios.
4. **Human review queue triggers.** Brief said "low confidence + failed indexing". Auto-enqueue is wired in Sprint 8.7.
5. **Cost ceiling per query.** Not specified. Currently bounded by per-route rate limits (10/min/IP for the answer route).

If/when the original alignment doc surfaces, this file should be reviewed against it and the discrepancies surfaced as a decision log entry.
