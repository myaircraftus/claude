# MyAircraft — RAG / Document-Intelligence System Overview

**Audience:** the development team and AI coding assistants.
**Scope:** the "Ask Logbook AI" / document-intelligence system — how an uploaded
PDF is processed, how a question is answered, and every change made on
2026-05-18.
**App:** Next.js 14 (App Router), `apps/web`. Postgres + pgvector (Supabase).
Deployed on Vercel (auto-deploy on push to `main`). Live at myaircraft.us.

---

# PART A — What was built (2026-05-18 program)

A pipeline audit produced a hardening program. Everything below is **shipped,
deployed and verified live** unless explicitly marked deferred.

## P0 — Security fix (cross-org data leak)
`/api/query` runs on the service Supabase client (Row-Level Security bypassed)
and took `aircraft_id` straight from the request body. The BM25 index and
PageIndex tree are keyed by `aircraft_id` alone, and the chunk-hydration query
had no `organization_id` filter — so an authenticated user could pass another
org's `aircraft_id` and pull that org's document chunks into their answer.
**Fix:** `/api/query` now verifies a body-supplied `aircraft_id` belongs to the
caller's org (403 otherwise); the BM25/tree hydration query is additionally
filtered by `organization_id` (defense-in-depth).

## Wave 1 — RAG hardening (8 improvements)
- **1.2 Cross-encoder reranker** — `lib/rag/rerank.ts`. After the hybrid
  retrieval merge, a Cohere Rerank (`rerank-v3.5`) cross-encoder pass re-orders
  candidates by true query relevance — the single biggest precision lever.
  Best-effort: with no `COHERE_API_KEY` it is a transparent no-op.
- **1.3 Org-scoped reference BM25 index** — aircraft-less reference docs
  (manuals, ADs/SBs, parts catalogs) had no keyword index at all. New
  `buildReferenceBm25Index(orgId)` / `searchReferenceBm25(orgId)` build and
  query an org-wide index so part/AD numbers in manuals are keyword-searchable.
- **1.4 Doc-type filter is a soft signal** — a topic-inferred doc-type filter
  is now a 0.5× score demotion, not a hard gate, so an inferred type can never
  exclude a genuinely relevant chunk (fixed a "no records found" false-empty bug).
- **1.6 Persona "Iron Wall" parity** — the legacy `/api/upload` route now
  enforces the persona × doc-type upload-permission matrix, matching
  `/api/upload/complete`.
- **1.7 Vision RAG integrated into Ask** — see Vision RAG below. Sub-steps:
  1.7a a real pgvector cosine-ANN RPC for the vision index; 1.7b a Modal
  `/embed-query` client; 1.7c vision wired into `/api/query` as a 4th retriever.
- **1.8 Accuracy eval harness** — `scripts/rag-eval.mjs` runs DB-verified
  questions through `/api/ask` and scores them.
- Plus earlier RAG work in the same program: **HyDE** (Hypothetical Document
  Embeddings), **aggregation multi-step retrieval** (count/list/sum/first/last),
  and **All-Aircraft per-aircraft fan-out**.

## Wave 2 — Contextual Retrieval *(Anthropic's technique)*
Every chunk in the canonical retrieval layer was a "naked" ~100-token OCR
fragment with no idea what document/aircraft/date it belonged to, so it
retrieved poorly. Wave 2 adds a **context blurb** to every chunk:
- New column `canonical_document_chunks.context_text` — a short deterministic
  identifier line (aircraft / document / section / page) + a 1-2 sentence LLM
  summary (`gpt-4o-mini`) + any AD/part/date identifiers.
- The vector embedding is regenerated over `context_text || chunk_text`; the
  BM25 `tsvector` also covers `context_text` ("Contextual BM25").
- `chunk_text` itself is never modified — it stays the verbatim cited source.
- All **11,111** canonical chunks were backfilled (`scripts/wave2-contextualize.mjs`).
  Cost: $2.26. Ingestion (`lib/rag/contextual.ts`) does this for every new
  upload going forward.
- **Measured result** (`scripts/wave2-eval.mjs`, 20 DB-verified questions,
  retrieval recall): aircraft-scoped page-recall@20 **8% → 31%** (~4×),
  document-recall **15% → 62%**; org-wide **5% → 10%** / **25% → 40%**.

## Logbook layer — Phase 1 + 2
The `logbook_entries` table is the owner-facing maintenance logbook.
- **Phase 1** — added a `historical` status. A logbook entry transcribed by OCR
  from the owner's already-completed paper logbook is the owner's historical
  record — read-only, **visible to the owner immediately**, NOT part of the
  mechanic draft→sign workflow. The `logbook_select` RLS policy lets the owner
  see `historical` entries. 391 existing transcribed entries were made visible.
- **Phase 2** — promoted the full backlog: **2,323 approved `ocr_extracted_events`
  → `logbook_entries`** as `historical`, owner-visible, each with full lineage
  (`source_id`, document + page). Owner logbook went **391 → 2,325 entries**. A
  DB trigger (`promote_approved_event_to_logbook`) now auto-creates the entry
  whenever an OCR event is approved — the pipeline never falls behind.

## Wave 3B — Intelligence layer bridged
The compliance/intelligence layer (aircraft status, pre-buy / AD / timeline
reports, missing-records detection, predictors — 12 code readers) reads the
`maintenance_events` table, which was **empty**. Every report computed from
nothing, and missing-records detection fired false "No Annual Records" findings
for every aircraft.
- Backfilled **2,323 `maintenance_events`** from the approved OCR events; the
  same trigger now feeds **both** `logbook_entries` (owner) and
  `maintenance_events` (intelligence).
- Fixed **8 intelligence files** with latent wrong column names (`entry_date`
  vs `event_date`, `aircraft_total_time` vs `airframe_tt`, etc.) that the empty
  table had hidden and that would have crashed once it had data.

## Verify & measure
Re-ran the retrieval eval (zero regression), DB-integrity sweep (all intact),
and loaded the end-to-end harness `scripts/rag-eval.mjs` with 23 real
DB-verified cases — run it with a session cookie for the true app-level
accuracy %.

## OCR-quality pilot
`scripts/ocr-pilot.mjs` — 40 random scanned logbook pages: **GPT-4o vision
re-transcription beats the current Google Document AI OCR on 37/40 pages**,
mean improvement 7.3/10. Full-corpus re-transcription would be ~$102. This
proved the next lever; see Part E for the deferred build.

## NOT done — deferred (see Part E)
- **Wave 3C — Applicability engine** — was *not* built; it is safety-critical
  and deferred to a future planned session.
- **Vision-OCR in the ingestion pipeline** — planned and documented
  (`docs/go-live-plan.md`), deferred to go-live.
- **Dormant feature modules** (inspections / meter readings / expiration
  tracking) — deferred.

---

# PART B — How a PDF is processed (ingestion pipeline)

Entry point: `lib/ingestion/server.ts` → `ingestDocumentInline(documentId)`,
run as a background job after upload. Stages are tracked on the document via
`markDocumentProcessingStage`.

**Step 1 — Upload.** `/api/upload` or `/api/upload/complete`. The persona ×
doc-type "Iron Wall" permission check runs (`personaCanUpload`). The file is
stored in the private `documents` storage bucket; a `documents` row is created.

**Step 2 — Native-text probe.** Is this a digital PDF with real embedded text
(not a scan)? If yes, that text is used directly and OCR is skipped.

**Step 3 — OCR (scanned documents).** Google **Document AI** extracts text.
If Document AI fails, **AWS Textract** is the fallback. *Document AI is strong
on printed text and weak on handwriting — this is the known quality gap; see
the deferred vision-OCR work in Part E.*

**Step 4 — Persist OCR artifacts.** `persistOcrArtifacts` writes one
`document_pages` row per page (`page_number`, `ocr_raw_text`, `ocr_confidence`,
`page_classification`, and `page_image_path` for mobile-scan uploads). OCR
page-jobs / entry-segments are recorded (`ocr_page_jobs`, `ocr_entry_segments`).

**Step 5 — Field / event extraction.** A parser service extracts structured
maintenance events into `ocr_extracted_events` (`event_date`, `event_type`,
`work_description`, `tach_time`, `airframe_tt`, `ad_references`, `part_numbers`,
`mechanic_name`, page lineage, …). They start at `review_status = 'pending'`.

**Step 6 — Chunking.** Page text is split into `document_chunks`
(~100 tokens each).

**Step 7 — Embedding.** Each chunk is embedded with OpenAI
`text-embedding-3-large` (1536-dim) → `document_embeddings`.

**Step 8 — Canonical layer.** A curated/deduplicated subset of chunks is
written to `canonical_document_chunks` + `canonical_document_embeddings` — this
is the layer the live vector search actually queries. (Text-native docs:
`insertCanonicalChunksFromTextNative`; OCR docs: `insertCanonicalChunksFromOcrSegments`,
gated on OCR confidence ≥ ~0.86 or human review.)

**Step 9 — Contextual retrieval (Wave 2).** `contextualizeCanonicalDocument`
generates the `context_text` blurb for each canonical chunk and re-embeds
`context_text || chunk_text`. Best-effort: if it fails the doc keeps raw
chunks + embeddings.

**Step 10 — Keyword + tree indexes.** A BM25 keyword index (per-aircraft, and
the org reference index for aircraft-less docs) and the PageIndex hierarchical
tree (`page_tree_nodes`) are built.

**Step 11 — Vision RAG dispatch** *(async, gated by `VISION_AUTO_DISPATCH`)*.
Each page is rendered to a PNG image in the `vision-pages` bucket and embedded
by a Modal-hosted **ColQwen2** model → `vision_pages` + `vision_embeddings`.
This makes visual content (diagrams, handwriting, arrows) retrievable even when
its OCR text is poor.

**Step 12 — Event approval → logbook + intelligence.** When an
`ocr_extracted_events` row becomes `review_status = 'approved'` (human review
or the canonicalize path), the DB trigger `promote_approved_event_to_logbook`
fires and creates, idempotently:
- a `logbook_entries` row — `status = 'historical'`, `owner_visible = true`,
  full source lineage (the owner-facing logbook); and
- a `maintenance_events` row — `truth_state = 'canonical'` (the data the
  intelligence/reports layer reads).

**End state:** the document is searchable (text + vision), the owner's logbook
is populated, and the intelligence layer has data.

---

# PART C — How a query / question is answered

Two layers: `/api/ask` (the conversational agent) calls `/api/query` (the RAG
engine).

## C.1 — `/api/ask` (AI Command Center)
1. Auth, organization resolution, rate limit (15/min/IP).
2. Resolve **persona** (`owner` or `shop`) — this picks the agent's tools.
3. A **GPT-4o tool-calling agent** runs (max 3 rounds). Owner persona gets the
   `search_documents` tool; shop persona also gets `create_logbook_entry`,
   `search_parts`, `search_logbook`, `generate_checklist`.
4. **Scope.** If a specific aircraft is selected, the question runs against it.
   If "All Aircraft" is selected, `classifyAskQuestion` decides: `org_wide`
   (one pass) or `per_aircraft` (fan-out — one agent pass per aircraft, run in
   parallel, results merged with globally-renumbered `[N]` citations).
5. The `search_documents` tool calls `/api/query` internally.

## C.2 — `/api/query` (the RAG engine)
1. Auth, org context, monthly query-quota check.
2. **P0 security** — verify a body `aircraft_id` belongs to the caller's org.
3. **Structured query parse** (`parseStructuredQuery`) — extracts a cleaned
   query plus any explicit signals: `doc:` type tokens, AD/SB numbers, part
   numbers, ATA chapters, the aircraft tail, date ranges.
4. **Doc-type pre-filter** — an explicit type filter, or a topic-inferred one.
   Applied as a **soft 0.5× demotion**, never a hard exclusion (Wave 1.4).
5. **Aggregation detection** — count / list / sum / first / last questions take
   a wider retrieval set and a structured event-extraction pass.
6. **HyDE** — `gpt-4o-mini` writes the hypothetical logbook entry that would
   answer the question. The **vector search uses the HyDE embedding** (it sits
   closer to real logbook text in embedding space than a natural-language
   question); BM25 + tree keep the real query words. Falls back to the real
   query embedding on any failure.
7. **Hybrid retrieval** (`hybridRetrieve`) — **four retrievers run concurrently:**
   - **Vector** — `search_canonical_documents` RPC: cosine ANN over the
     `canonical_document_embeddings` (now the Wave 2 *contextual* embeddings),
     org-scoped, hybrid vector 0.7 + keyword 0.3. Plus keyword / phrase / raw /
     "latest-annual" fallbacks for robustness.
   - **BM25** — the per-aircraft index + the org reference index (Wave 1.3),
     now indexing the contextual text too.
   - **PageIndex tree** — hierarchical section-tree match (`page_tree_nodes`).
   - **Vision** (Wave 1.7c) — `embedVisionQuery` calls the Modal ColQwen2
     query encoder; a vision-only ANN + late-interaction MaxSim re-rank finds
     matching page images; those pages map back to text chunks. Best-effort,
     8-second timeout — never stalls the text answer.
8. **Merge + weighted blend** — dedupe by `chunk_id`; score =
   `vector·0.45 + bm25·0.35 + tree·0.20 + vision·0.25(bonus)`, then the
   doc-type soft demotion.
9. **Cross-encoder rerank** (Wave 1.2) — Cohere `rerank-v3.5` re-orders a wide
   candidate pool by true relevance to the actual question; keeps the top N.
10. **Answer generation** (`generateAnswer`) — GPT-4o writes the answer grounded
    ONLY in the retrieved chunks, emitting inline `[N]` citation markers.
    Aggregation questions answer from the deduplicated structured event list.
11. **Citation anchoring** (`enrichAnswerCitationsWithAnchors`) — see C.4.
12. **Confidence** — `high` / `medium` / `low` / `insufficient_evidence`.
    Confidence is **capped at `low`** if no citation actually resolved — an
    ungrounded answer can never claim high confidence.

## C.3 — How poor text / OCR quality is handled
- **Garbled OCR is the known weak point** — handwritten scanned logbooks.
  Google Document AI produces messy text on those pages.
- **It is mitigated, not yet fixed**, in three ways today:
  1. **Vision RAG** — because page *images* are embedded (ColQwen2), a page can
     still be *found* even when its OCR text is gibberish.
  2. **Contextual retrieval** (Wave 2) — the prepended identifier line +
     summary make even a garbled chunk findable by aircraft / AD / part number.
  3. **Honest confidence** — when the evidence is weak the system returns
     `low` / `insufficient_evidence` and says what is missing, rather than
     fabricating an answer.
- **The real fix is slotted for go-live** — GPT-4o vision re-transcription of
  garbled pages (Part E).

## C.4 — Citations returned
Every answer carries a `citations[]` array. Each citation includes:
`document_title`, `document_id`, `page_number` (+ `page_number_end`),
`chunk_id`, `section_title`, `quoted_snippet` / `quoted_text`,
`text_anchor_start` / `text_anchor_end`, `bounding_regions`, `is_exact_anchor`,
`relevance_score`, `match_strategy`. The answer text contains inline `[N]`
markers; the UI renders each `[N]` as a clickable link that opens the cited
page of the source PDF in a side panel with the exact source span highlighted.
The response also returns `confidence`, `follow_up_questions`, `warning_flags`.

---

# PART D — Key data-model reference

| Table | Role |
|---|---|
| `documents` | Uploaded files + metadata |
| `document_pages` | Per-page OCR text + image path + confidence |
| `ocr_extracted_events` | Structured maintenance events extracted from OCR (source of truth for the two layers below) |
| `document_chunks` / `document_embeddings` | Raw chunk text + embeddings (keyword-fallback layer) |
| `canonical_document_chunks` / `canonical_document_embeddings` | The curated layer the live vector search uses; carries `context_text` (Wave 2) |
| `page_tree_nodes` | PageIndex hierarchical section tree |
| `vision_pages` / `vision_embeddings` | Page images + ColQwen2 visual embeddings |
| `logbook_entries` | Owner-facing logbook — `historical` (OCR-transcribed) + mechanic-authored entries |
| `maintenance_events` | The intelligence/reports layer's event store |
| `compliance_items` / `aircraft_ad_applicability` | Compliance + AD tracking |
| `queries` / `citations` | Stored Q&A history + resolved citations |

**Two pipelines, one source of truth:** `ocr_extracted_events` is the single
source; on approval it is projected into `logbook_entries` (owner) and
`maintenance_events` (intelligence).

**Models used:** OpenAI `text-embedding-3-large` (embeddings, 1536-dim),
`gpt-4o` (answers, the Ask agent), `gpt-4o-mini` (HyDE, contextual blurbs,
classification), Cohere `rerank-v3.5` (reranker), ColQwen2 on Modal GPU
(vision page embeddings).

---

# PART E — Deferred work (not built — planned)

See `docs/go-live-plan.md` for the detailed build plan.

1. **Vision-OCR in the ingestion pipeline** *(priority — pre-go-live)*.
   Google Document AI stays as the cheap first pass on every upload; for the
   pages it gets garbled, **GPT-4o vision re-transcribes only those pages**
   (proven by the pilot: 37/40 wins). It does NOT replace Document AI and does
   NOT run on every page. To be built and tested with the first real uploads.

2. **Dormant feature modules** — `inspections`, `meter_readings`,
   `document_expirations`, `mechanic_certificates`: tables + UI scaffolding
   exist, no data/workflow yet. Each is a self-contained feature build.

3. **Wave 3C — Applicability engine** *(safety-critical)*. Refine
   `aircraft_ad_applicability` (the "does this AD/SB apply / is it overdue"
   logic). Liability-bearing — must be conservative, human-gated, and closely
   reviewed. **Not started.**

---

# PART F — Verified results (2026-05-18)

| Metric | Value |
|---|---|
| Canonical chunks contextualized + re-embedded (Wave 2) | 11,111 |
| Retrieval recall@20, aircraft-scoped (page / document) | 8%→31% / 15%→62% |
| Retrieval recall@20, org-wide (page / document) | 5%→10% / 25%→40% |
| Owner-visible historical logbook entries | 391 → 2,325 |
| `maintenance_events` (intelligence layer) | 0 → 2,323 |
| Vision page embeddings | 12,970 |
| OCR pilot — GPT-4o vision vs Document AI | wins 37/40, 7.3/10 |
| Wave 2 contextualization cost | $2.26 |

All changes are committed to `main` and deployed to production.
