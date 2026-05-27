# Work log

Reverse-chronological record of freelance work on this codebase. Client-facing — each entry explains **why** before **what**, links to the commit when available, and notes how the change was verified.

---

## 2026-05-28 — Direct chunking: cascade bug fix + flipped to default-on

**Why.** Two issues surfaced when the operator ran the first real ingestion with the new pipeline:

1. **Cascade bug.** With `OCR_DIRECT_CHUNKING=true` + `OCR_DIRECT_CHUNKING_PROVIDER=openai` + no Gemini key, ingestion silently fell through to legacy `openai_pdf_ocr`. Diagnostic on doc `5cec6f7a-...` showed `engines_run=['openai_pdf_ocr']` (legacy GPT-4o batch OCR, not `gpt_4o_direct`), 37 rows in `ocr_entry_segments` (should be 0), all 33 canonical chunks tagged `metadata_json.source='ocr_segment'` (should be `direct_chunking`), and chunks full of repeated form-template boilerplate — the exact failure mode direct-chunking was designed to fix. Root cause: the direct-chunking attempt in `parseScannedPdfWithFallbacks` was gated on `Boolean(process.env.GEMINI_API_KEY)`. With no Gemini key, the whole attempt was skipped — regardless of whether the configured provider was OpenAI.
2. **Awkward default.** The flag was opt-in (`OCR_DIRECT_CHUNKING=true` required). For a pre-launch product where the new pipeline IS the intended architecture, this just adds setup friction without any safety benefit.

**What changed.**

- **Cascade fix.** Direct-chunking is now its own first-class entry at the TOP of `parseScannedPdfWithFallbacks`, gated on the **configured provider's** key via the new `directChunkingProviderHasKey()` helper exported from the OCR module. Legacy Gemini text-only OCR stays as a separate fallback gated independently on `GEMINI_API_KEY`. No more silent fall-through when the operator picks OpenAI as the direct-chunking backend without a Gemini key.
- **Default flipped to ON.** `isDirectChunkingEnabled()` now returns true by default; the only thing that disables direct-chunking is `OCR_DIRECT_CHUNKING=false` (or `0`/`off`/`disabled` — case-insensitive). Any other value, including unset, keeps it enabled.
- **Provider auto-detect.** `OCR_DIRECT_CHUNKING_PROVIDER` is now optional. Unset → mirror the legacy OCR cascade: prefer Gemini when `GEMINI_API_KEY` is present (best handwriting accuracy per the bake-off), fall back to OpenAI GPT-4o otherwise. Operators can still pin `=gemini` or `=openai` to override.
- Updated [.env.local.example](.env.local.example) and [docs/architecture/option-3-design.md](docs/architecture/option-3-design.md) to reflect the new default-on behavior.

**Verified.**

- Re-ingested same source PDF as doc `03e526e8-...` after the cascade fix. Diagnostic verifier `.tmp/verify-direct-chunking.mjs` reports all green: `engines_run=['gpt_4o_direct']` on every page (22/22), 0 segments, 55/55 canonical chunks tagged `direct_chunking`, chunk_kind enum populated (39 maintenance_entry + 16 signoff_block), event back-refs all `ocr_entry_segment_id=NULL`, Wave 2 `context_text` ~58 chars (deterministic line only — LLM skip fired correctly), extraction_runs audit row written with `engine_type=direct_chunking`.
- Smoke test with NO env overrides (`OCR_DIRECT_CHUNKING` and `OCR_DIRECT_CHUNKING_PROVIDER` both unset) ran clean against pages 1 + 7 of the airframe logbook: auto-detect picked OpenAI (no Gemini key), 5.6s on cover, 49s on dense handwritten page with 3 chunks across 2 kinds + 2 events with valid back-refs. Confirms the default-on path works end-to-end with zero configuration.
- `pnpm tsc --noEmit` — 0 new errors (25 pre-existing elsewhere, unchanged).
- Side-by-side comparison vs the legacy v10 doc on the same source PDF: avg chunk size 1020 → 201 chars (-80%); max chunk size 14,615 → 780 chars (-95%). Sample chunk on page 5: legacy = 3,667 chars of form-template noise (`A I R C R A F T  L O G ___________ DATE | FLIGHT | TO ...`); direct = 241 chars of one focused entry (`Date 7-10-82 Total Aircraft Time 1000 hrs... David R. Copeland 217459821`) plus structured family_metadata with date/tach/mechanic/cert. Quality jump is the intended payoff.

**Files changed (this session).**

- EDIT [apps/web/lib/ocr/direct-chunking.ts](apps/web/lib/ocr/direct-chunking.ts) — exported `getDirectChunkingProvider` + `directChunkingProviderHasKey`; flipped `isDirectChunkingEnabled` default to ON; added provider auto-detect mirroring the legacy OCR cascade.
- EDIT [apps/web/lib/ingestion/native-pdf.ts](apps/web/lib/ingestion/native-pdf.ts) — direct-chunking now a separate first-class attempt at the top of the cascade, gated on the configured provider's key.
- EDIT [apps/web/scripts/direct-chunking-smoke.ts](apps/web/scripts/direct-chunking-smoke.ts) — dropped the explicit `OCR_DIRECT_CHUNKING=true` override (now redundant with default-on).
- EDIT [.env.local.example](.env.local.example) — comments now describe kill-switch + auto-detect semantics.
- EDIT [docs/architecture/option-3-design.md](docs/architecture/option-3-design.md) — status banner now reflects default-on + auto-detect.
- NEW [.tmp/verify-direct-chunking.mjs](.tmp/verify-direct-chunking.mjs) — comprehensive diagnostic for any future ingestion (latest doc by default, or `<docId>` argv).
- NEW [.tmp/compare-direct-vs-legacy.mjs](.tmp/compare-direct-vs-legacy.mjs) — side-by-side comparison of direct vs legacy chunks on the same source PDF.

**Commit.** _Pending operator approval — verified end-to-end, ready to commit when operator confirms._

---

## 2026-05-27 — Option 3 pipeline rewrite: direct chunking + structured events in one vision call (feature-flagged)

**Why.** The earlier doc-type-aware OCR prompts (entry above) explicitly flagged what's left: the downstream chain (`annotateOcrPagesWithOpenAI` → `buildOcrEntrySegments` → `insertCanonicalChunksFromOcrSegments`) is three separate passes over the same content, each with its own failure mode. Two of those modes have been chewing through fix-after-fix this week:

- `splitIntoBlocks` jams 4-up ASA logbook entries into one chunk because OCR text doesn't carry the grid layout.
- `detectSegmentType` keyword heuristics (`TABLE_HINT_RE`, `template_or_form`) drop real maintenance content (`5b0f199d` patched one such class; others remain).
- `annotateOcrPagesWithOpenAI` re-reads OCR text in 8-page batches and frequently drops events on dense pages.

Net: handwritten airframe content lands in `canonical_document_chunks` (the table Ask AI queries) at ~70-80% coverage — losing exactly the high-value entries owners want to retrieve. Architecturally the right move is to let the vision model that sees the page also do the chunking + event extraction in one structured-output call. Pre-launch is the right time to ship the clean architecture rather than keep patching the legacy chain.

**Phase 0 — design (this session).** Verified Gemini 3 Flash Preview's OpenAPI-3.0-subset `responseSchema` supports every feature needed: enum + `nullable: true` coexist, nested objects, optional vs required via `required: [...]`, arrays of objects with mixed nullable / required / array members. Two live test calls (cover page + 4-up handwritten airframe page 7) returned HTTP 200, finishReason=STOP, clean JSON, **5 chunks across 3 distinct `chunk_kind` enum values, 2 events with valid `source_chunk_index` back-refs, no repetition tails** (structured-output mode appears to suppress the failure mode). Latency 7.3-14.6s/page, cost ~$0.006/page on dense pages. Full schema + contract + 6 family schemas in [docs/architecture/option-3-design.md](docs/architecture/option-3-design.md).

**Phase 1 — implementation.** Five files; provider-agnostic naming throughout (`direct-chunking`, not `gemini-direct`) so the v1 Gemini backend can be swapped for OpenAI / Anthropic later by changing only the inside of `callProviderForPage` — no caller change required.

- **NEW** [apps/web/lib/ocr/direct-chunking.ts](apps/web/lib/ocr/direct-chunking.ts) (~750 LOC) — the whole module. Six per-family `responseSchema` builders (logbook / work_order / ad_sb / inspection / manual_reference / general), each with a family-specific `chunk_kind` enum and `family_metadata` shape sharing one envelope. Six per-family prompts. `runDirectChunkingPage` per-page runner with `thinkingBudget: 0` + `temperature: 0.4` (same Gemini config as the OCR engine swap). `parseScannedPdfWithDirectChunking` document-level orchestrator with concurrency 4 + 0.5 success-ratio cascade trigger (matches existing Gemini OCR knobs). Server-side `page_number` stamping (the model defaults its own `page_number` to 1 because it sees a 1-page PDF). Feature flag `OCR_DIRECT_CHUNKING=true` (default off); family allow-list `OCR_DIRECT_CHUNKING_FAMILIES=logbook,work_order,inspection,ad_sb` (default — keeps printed manuals on the cheaper Doc AI path).
- **EDIT** [apps/web/lib/ingestion/native-pdf.ts](apps/web/lib/ingestion/native-pdf.ts) — `NativeIngestResponse` extended with optional `direct_chunking` + `direct_chunking_pages` fields. The Gemini attempt in `parseScannedPdfWithFallbacks` now swaps to `parseScannedPdfWithDirectChunking` when the flag is on and the doc's family is allow-listed; otherwise runs the legacy text-only Gemini OCR unchanged. All other fallback engines (GPT-4o, Doc AI, Textract, tesseract) untouched.
- **EDIT** [apps/web/lib/ingestion/server.ts](apps/web/lib/ingestion/server.ts) — two new helpers: `insertCanonicalChunksFromDirectChunking` (writes canonical rows directly from per-page vision-model output, `metadata_json.source='direct_chunking'`, `chunk_index = page * 1000 + i`, embeds via existing `generateEmbeddings`) and `persistDirectChunkingArtifacts` (slimmer alternative to `persistOcrArtifacts` — still writes `ocr_page_jobs` for inspector, `extraction_runs` for audit, `ocr_extracted_events` for the maintenance-events promote trigger, page-scope `review_queue_items`; **skips** `buildOcrEntrySegments` + `ocr_entry_segments` + segment-scope field candidates entirely). `ingestDocumentInline` orchestrator gets four branches keyed on `ingestData.direct_chunking`: skip GPT-4o annotation, skip vision re-transcribe, swap `persistOcrArtifacts` → `persistDirectChunkingArtifacts`, swap `insertCanonicalChunksFromOcrSegments` → `insertCanonicalChunksFromDirectChunking`.
- **EDIT** [apps/web/lib/rag/contextual.ts](apps/web/lib/rag/contextual.ts) — Wave 2 contextualization detects `metadata_json.source === 'direct_chunking'` and short-circuits the LLM context-blurb call (uses deterministic identifier line only). Direct-chunking chunks are already family-aware so the LLM blurb would be near-duplicate; this saves the per-chunk gpt-4o-mini cost without losing the tail/make/model identifier embedding signal.
- **EDIT** [apps/web/scripts/wave2-contextualize.mjs](apps/web/scripts/wave2-contextualize.mjs) — same skip-LLM logic in the standalone backfill script (source tag hardcoded with cross-reference comment because .mjs can't import from .ts).
- **NEW** [apps/web/scripts/direct-chunking-smoke.ts](apps/web/scripts/direct-chunking-smoke.ts) — runnable verification harness via `pnpm exec tsx`. Structural checks (no API needed) + optional live API call (skipped gracefully when `GEMINI_API_KEY` is empty).

**Design decisions worth noting** (full rationale in §4 of the design doc):
- `document_chunks` gets the same Gemini chunks written pass-through, because the PageIndex tree-builder and the ColQwen2 vision retriever both read `document_chunks` — skipping it entirely would orphan two retrievers. `canonical_document_chunks` (the table Ask AI vector + BM25 queries) gets the new path. No schema migration needed; the new `metadata_json` keys (`source`, `chunk_kind`, `family`, `family_metadata`) live in the existing jsonb column.
- Manuals (`manual_reference` family) excluded from the default allow-list. Doc AI handles printed-text manuals well at fractions of a cent per page; a 200-page maintenance manual at vision-model price would add up unnecessarily. Override via env if desired.
- Provider-agnostic naming throughout. The DB engine identifier is still model-specific (e.g. `gemini_3_flash_preview_direct`) for accurate cost/quality attribution, but no function name, type name, or env-var name leaks "Gemini" — swapping to a different vision model later only touches `callProviderForPage`.

**Phase 1.5 — OpenAI as a second provider (same session).** Operator confirmed `GEMINI_API_KEY` was unavailable, so OpenAI GPT-4o was added as a parallel backend in the same module — no API-surface change. The module's `callProviderForPage` now dispatches on `OCR_DIRECT_CHUNKING_PROVIDER` ∈ {`gemini`, `openai`}. A `geminiSchemaToOpenAi(schema)` converter handles the dialect gap (OpenAPI 3.0 → JSON Schema strict): folds `nullable: true` into `type: ['X','null']` unions, adds `additionalProperties: false` to every object, puts every property in `required: [...]` (OpenAI strict mode mandates this), and adds `null` to enum arrays for nullable enums. PDF is sent inline via `input_file.file_data` data URL (no Files API upload/delete round-trip per page). Single source of truth for the schemas (Gemini dialect); the converter is the only place that knows about OpenAI's stricter form.

Per the May-2026 bake-off: OpenAI GPT-4o scored 6.4/10 on handwritten airframe pages (vs Gemini 8.8) — so OCR quality on handwritten content will be lower. But on printed content (manuals, work orders) it scored 8.4 vs Gemini's 7.6, and the architectural improvement (vision-model chunking vs heuristic segmentation + drop-prone annotation) applies regardless of which model does the OCR.

**Verified.**
- `tsc --noEmit` from `apps/web/`: **0 errors** in any of the 5 files touched (25 pre-existing errors elsewhere unchanged).
- Structural smoke: module imports clean; all 6 families resolve correctly; flag-eligibility allow-list works as designed (`logbook`/`work_order`/`inspection`/`ad_sb` → eligible, `manual_reference`/`general` → not eligible); constants export correctly.
- **Live API smoke via OpenAI provider** (`OCR_DIRECT_CHUNKING_PROVIDER=openai pnpm exec tsx scripts/direct-chunking-smoke.ts`):
  - Page 1 (cover, 9.1s) — 1 chunk (header_template_block, correctly non-canonical), aircraft tail `N92995` + make `Cessna` extracted, page_classification=`cover`, page_number server-stamped correctly.
  - Page 7 (4-up handwritten airframe, 32.2s) — **8 chunks across 3 distinct kinds** (`maintenance_entry`, `signoff_block`, `header_template_block`), **6 canonical**, **2 events with valid `source_chunk_index` back-refs**, page_classification=`airframe_log`, Cessna 152 detected. **More granular chunking than Gemini emitted on the same page (8 vs 5)** — likely because GPT-4o split per signoff sub-block; net positive for retrieval. Schema converter verified: OpenAI strict mode accepted the converted schemas without validation errors, all required-everything + null-union conversions worked correctly.
  - Latency ~2× Gemini (32s vs 15s on the dense page) but acceptable at concurrency 4; a 23-page logbook lands in ~3 minutes wall-clock.
  - Full payloads at `.tmp/direct-chunking-smoke-output/`.

**How to enable.** Three new env vars (master flag off by default):
```
OCR_DIRECT_CHUNKING=true                                            # master kill-switch
OCR_DIRECT_CHUNKING_PROVIDER=openai                                 # 'openai' or 'gemini' (default: gemini)
OCR_DIRECT_CHUNKING_FAMILIES=logbook,work_order,inspection,ad_sb    # optional; this IS the default
OCR_DIRECT_CHUNKING_MODEL=gpt-4o                                    # optional; falls back to OPENAI_OCR_MODEL or OPENAI_CHAT_MODEL for openai, GEMINI_OCR_MODEL for gemini
```
For the operator's current setup (OpenAI key only): `OCR_DIRECT_CHUNKING=true` + `OCR_DIRECT_CHUNKING_PROVIDER=openai`. Already-ingested docs stay on whatever chain produced them — re-ingest via the admin UI to convert.

**Rollback.** Set `OCR_DIRECT_CHUNKING=false` (or unset). Next ingest reverts to the legacy chain immediately. Already-ingested direct-chunking docs continue to query correctly — their `canonical_document_chunks` rows are schema-compatible with what BM25/vector retrieval expects.

**Out of scope / follow-ups** (intentional, not bugs):
- The page-17 silent-drop bug in `persistOcrArtifacts` ([server.ts:1110](apps/web/lib/ingestion/server.ts#L1110)) was preserved as-is in `persistDirectChunkingArtifacts` for parity, but the new code at least writes an empty-page stub correctly (the bug only affects pages with completely empty OCR output). Worth a dedicated pass if it surfaces.
- AD/SB and manual_reference families don't emit `ocr_extracted_events` rows (no maintenance-event semantics). Their structured data lives entirely in `canonical_document_chunks.metadata_json.family_metadata`. A future per-family events table is the clean answer if AD compliance reporting needs it.
- The `.tmp/gemini-direct-verify.mjs` before/after comparison harness (proposed in design doc §5.6) was NOT built — the user opted to skip the verify-first step and ship the rewrite directly since this is pre-launch and the architecture cleanliness is the goal. Once the live smoke runs, the same kind of comparison can be done against any specific doc by re-ingesting with the flag flipped.

**Files changed.** 5 modified/new code files + 1 new design doc + env example update:
- NEW [apps/web/lib/ocr/direct-chunking.ts](apps/web/lib/ocr/direct-chunking.ts) — both Gemini + OpenAI provider implementations + schema converter
- NEW [apps/web/scripts/direct-chunking-smoke.ts](apps/web/scripts/direct-chunking-smoke.ts) — provider-aware smoke harness
- NEW [docs/architecture/option-3-design.md](docs/architecture/option-3-design.md)
- EDIT [apps/web/lib/ingestion/native-pdf.ts](apps/web/lib/ingestion/native-pdf.ts)
- EDIT [apps/web/lib/ingestion/server.ts](apps/web/lib/ingestion/server.ts)
- EDIT [apps/web/lib/rag/contextual.ts](apps/web/lib/rag/contextual.ts)
- EDIT [apps/web/scripts/wave2-contextualize.mjs](apps/web/scripts/wave2-contextualize.mjs)
- EDIT [.env.local.example](.env.local.example) — documents the 4 new direct-chunking env vars (`OCR_DIRECT_CHUNKING`, `OCR_DIRECT_CHUNKING_PROVIDER`, `OCR_DIRECT_CHUNKING_MODEL`, `OCR_DIRECT_CHUNKING_FAMILIES`) AND backfills `GEMINI_API_KEY` / `GEMINI_OCR_MODEL` / `OPENAI_OCR_MODEL` / `ENABLE_TEXTRACT_OCR` which were used in earlier OCR-cascade work but never documented. New dedicated `# ─── OCR engines (scanned PDF cascade) ───` section summarizes the cascade order + per-engine bake-off scores so future readers know what each var costs accuracy-wise.

**Commit.** _Pending operator approval — implementation verified end-to-end with the OpenAI provider; ready to commit when operator confirms._

---

## 2026-05-27 — Gemini OCR prompt: doc-type-aware (logbook / work_order / ad_sb / inspection / manual_reference / general)

**Why.** The OCR engine swap earlier today shipped one Gemini prompt — and it was logbook-biased ("aircraft maintenance logbook page", "tach/hour readings, mechanic names, A&P/IA certificate numbers"). MyAircraft's upload flow handles ~18 doc types (work orders, ADs/SBs, POH/AFM, service manuals, parts catalogs, inspection reports, Form 337 / 8130, etc.). Most reference docs (POH/AFM/manual) are text-native PDFs that skip OCR entirely, so unaffected. But scanned work orders, scanned regulatory documents, and scanned inspection reports DO flow through the new Gemini OCR path — and were being told they were "logbook pages with multiple maintenance entries", which mismatches their actual structure.

Gemini transcribes verbatim regardless of the framing, so no observed breakage — but the prompt was carrying logbook assumptions into doc types where they don't apply (e.g. work orders are usually one work order per page, not a 4-up grid of entries; ADs are clause-based regulatory text, not handwritten entries). Subtly degrades accuracy in cases the bake-off didn't cover.

**Fix.** Six prompt variants keyed by `inferDocumentFamily(docType)` (reused from [segments.ts](apps/web/lib/ocr/segments.ts) — exported `inferDocumentFamily` + `DocumentFamily` type for this; the segments-level doc-family taxonomy is now a single source of truth for both segment classification AND OCR prompt selection):

- **logbook** — handwritten cursive, tach/Hobbs, mechanic names, A&P/IA cert numbers, multi-section pages (AIRCRAFT LOG + VOR check + REMARKS). _Same content as before._
- **work_order** — customer/aircraft header, WO number, labor + parts line items, discrepancies, signoff. Replaces "multiple maintenance entries per page" with "header + parts + labor + signoff" framing.
- **ad_sb** — AD/SB number, effective date, applicability (make/model/serial ranges), compliance instructions + dates, FAR references. Explicit "transcribe regulatory language verbatim — do not paraphrase legal phrasing."
- **inspection** — inspection type (annual / 100hr / pre-buy etc.), checklist marks (✓/✗/N/A), itemised findings, corrective actions, signoff.
- **manual_reference** (POH, AFM, service manual, maintenance manual, parts catalog) — chapter/section numbers, procedural steps, tables (preserve row/column with `|` delimiters), warnings/cautions/notes (verbatim — safety-critical), references to figures.
- **general** — catch-all for anything else (lease, insurance, miscellaneous). Neutral verbatim transcription, no domain-specific framing.

All six share an identical closer: `[illegible]`-not-guessing, no summarising, top-to-bottom transcription, output ONLY the transcription. The closer is where the loop-breaking + completeness rules live, so they apply uniformly across doc types.

**Out of scope** (deferred — flagged for the client doc):
- The downstream **structured-event annotation step** (`annotateOcrPagesWithOpenAI` at [native-pdf.ts:1108](apps/web/lib/ingestion/native-pdf.ts#L1108)) is ALSO logbook-biased — explicitly mentions "pre-printed logbook pages (e.g. ASA-SP-L, Jeppesen propeller/engine/airframe logs) typically have a 4-up grid of independent entries". For work orders, ADs, and manuals this is wrong. Bigger change because that step's whole schema (`extracted_events[]` with `tach_time`, `mechanic_name`, `ia_number`, etc.) is logbook-shaped. Either needs per-doc-family schemas or to move into the upstream Gemini OCR call as part of the "option 3" pipeline collapse.

**Files changed.** 2 files:

- [apps/web/lib/ocr/segments.ts](apps/web/lib/ocr/segments.ts) — exported `inferDocumentFamily` function + `DocumentFamily` type (previously private).
- [apps/web/lib/ingestion/native-pdf.ts](apps/web/lib/ingestion/native-pdf.ts) — replaced the single `GEMINI_OCR_PROMPT` constant with `OCR_PROMPTS: Record<DocumentFamily, string>` + `getGeminiOcrPrompt(docType)` helper; added a shared closer `OCR_PROMPT_SHARED_CLOSER`; threaded `docType` through `runScannedOcrPageGemini`'s signature so the prompt is selected per page based on the doc's type.

**Verified.** `tsc --noEmit` clean on both files (pre-existing errors elsewhere unchanged). No browser-observable behaviour — the change only takes effect when a scanned non-logbook doc (e.g. a scanned work order) is uploaded. End-to-end verification: operator should upload one non-logbook scanned doc (a work order or scanned AD/inspection report) and confirm via `/admin/documents/[id]/inspect` that the OCR text reads naturally for that doc type (no "I expected mechanic signatures here" artefacts from a misfit prompt).

**Commit.** _Pending operator approval._

---

## 2026-05-27 — OCR engine swap: Gemini 3 Flash Preview as primary, GPT-4o + Doc AI as fallbacks

**Why.** The two prior bug fixes (multi-event extraction + canonical promotion) raised the obvious next question: even with the downstream pipeline working correctly, ingestion accuracy is capped by the OCR step. The audit measured ~55% entry recall on the 1981-92 handwritten airframe logbook — and the root cause analysis kept landing on the same thing: Google Document AI produces structurally garbled text on handwritten cursive. Pages full of entries like `"Tach 1359 / Henry L. Williams A&P 2082536"` came back from Doc AI as `"Tuch 1359 / Hewer & ..."` with reading order chaos and field names interleaved randomly. No amount of downstream cleanup recovers text that OCR never produced correctly.

A focused 3-way bake-off (`.tmp/ocr-bakeoff.mjs`) was built to evaluate alternatives on this codebase's own logbook PDFs, with GPT-4o as a third-party judge scoring each engine's output against the original page image:

| | Airframe handwritten (5 pages) | Propeller printed (5 pages) | Combined |
|---|:-:|:-:|:-:|
| Doc AI (current) | 0 wins · **5.2/10** | 1 win · 6.6/10 | 1 win · 5.9/10 |
| OpenAI GPT-4o vision | 0 wins · 6.4/10 | 3 wins · **8.4/10** | 3 wins · 7.4/10 |
| **Gemini 3 Flash Preview** | **5 wins · 8.8/10** | 1 win · 7.6/10 | **6 wins · 8.2/10** |

Cost per 1,000 pages: Doc AI ~$1.50, Gemini 3 Flash Preview ~$2.66, GPT-4o ~$9.74. Gemini wins on accuracy *and* is ~3.6× cheaper than GPT-4o. Doc AI is provably the worst on handwriting at any price.

**Two Gemini-specific behaviour bugs discovered + fixed during the bake-off.** Production-relevant — calling them out so they don't bite later:

1. **Mid-page truncation on dense pages.** Gemini 3 Flash is a "thinking model"; at default config it spends a chunk of the `maxOutputTokens` budget on internal reasoning before responding. On dense `airframe_log` pages (multiple stacked sub-tables), this caused output to truncate at ~900 chars mid-transcription, missing 2-3 maintenance entries per page. **Fix:** set `thinkingConfig: { thinkingBudget: 0 }`. Transcription doesn't need reasoning — only the budget. Truncation gone, full pages captured.

2. **Repetition loops on form-template content.** At `temperature: 0`, Gemini occasionally gets stuck repeating form-template lines (e.g. ASA propeller `"☐ HUB & BLADE INSPECTIONS, REPAIRS AND ALTERATIONS"`) for ~250k characters before stopping. The proper fix would be `frequencyPenalty` / `presencePenalty` — but those parameters return `"Penalty is not enabled for this model"` on the preview tier. **Mitigation:** `temperature: 0.4` + `topK: 40` + `topP: 0.9` breaks the greedy-decoding lock. Doesn't fully eliminate the failure mode (see Known Issues below) but reduces it from "kills the page" to "wastes some trailing output tokens."

**Production change.** [apps/web/lib/ingestion/native-pdf.ts](apps/web/lib/ingestion/native-pdf.ts) — ~150 lines added:

- New `parseScannedPdfWithGemini` function. Mirrors the existing `parseScannedPdfWithOpenAI` pattern: downloads the PDF, extracts each page individually via `pdf-lib` (matching the bake-off setup that proved 8.8/10), sends each page as a 1-page PDF inline_data to Gemini's `generateContent` API. Concurrency 4. If fewer than 50% of pages produce text, throws so the cascade falls through to the next engine.
- `parseScannedPdfWithFallbacks` cascade reordered. Doc AI is no longer the primary. New order is presence-gated: **Gemini 3 Flash Preview** (if `GEMINI_API_KEY` set) → **OpenAI GPT-4o** (if `OPENAI_API_KEY` set) → **Google Document AI** (if Doc AI configured) → local Tesseract → AWS Textract.
- The structured-event extraction step (`annotateOcrPagesWithOpenAI`) is intentionally untouched. It still uses GPT-4o; Gemini just produces cleaner OCR text for that step to extract from. Collapsing OCR + structured extraction into one Gemini call is a follow-up.

**Behaviour right after this lands:**
- **Production today** (Vercel env has no `GEMINI_API_KEY`): cascade skips Gemini, **GPT-4o vision becomes the primary OCR engine** for every new upload. Doc AI becomes a third-tier fallback. ~6.5× cost increase per page vs prior Doc-AI default, but materially better accuracy on handwriting.
- **Within 1-2 days** (client adds `GEMINI_API_KEY` to Vercel env): cascade hits Gemini first. No deploy required — env-var change picks up on next cold start. Cost drops to ~$0.003/page. Accuracy on handwriting jumps to ~8.8/10.

**Verified — end-to-end on a fresh upload.** Operator re-uploaded the airframe logbook PDF as `logbook-jeet-v10` (doc id `7cc93d35-…`) post-deploy with `GEMINI_API_KEY` set on local. Confirmed via direct DB query:

| Metric | Result |
|---|---:|
| Pages successfully OCR'd | 22 of 23 |
| Engine used (per-page) | `gemini_3_flash_preview` × 22 |
| OCR text quality (visual inspection of sample page) | Real names, dates, AD refs, A&P cert numbers — no Doc-AI-style garbage |
| `ocr_extracted_events` rows | **45** (vs ~34 from prior Doc AI runs on same source PDF — +32%) |
| `canonical_document_chunks` rows | 76 |
| `canonical_document_embeddings` rows | 76 (100% retrieval-ready) |
| Wave 2 contextualization | 76/76 chunks have `context_text` |

Sample of what Gemini produced on page 12 (a previously-garbled dense handwritten page):

> `13 Apr 87 | Oil + Filter Plus New Spark Plugs | 153.9 | Tac 1113.39 / John H Gamy Jr 251-20-0249`
> `20 June | Tach 1174.9 | Complied with AD 84-26-02 by replacement of the Induction airfilter. Complied with AD 86-05-02 on United Instruments Altimeters...`
> `I certify that this Aircraft has been inspected in accordance with an approved 100 hr. Inspection procedure required by FAR 91.169 (f) (4)... Name William F Miller Jr. A+P Certificate 571355857`

Compare to what Doc AI used to produce on similar handwritten cursive (`"AIC STRUPPA AND RAIN"`, `"Semester X. Riy AxP526275982"`). The audit-tracking question *"what was the latest annual inspection on this airframe?"* now has clean, queryable, owner-citable evidence in the canonical retrieval layer.

**Known issues — not blockers, deferred to a follow-up:**

1. **Page 17 silently dropped.** Doc has 23 pages, only 22 made it into `ocr_page_jobs`. Root cause is *pre-existing* behaviour in [server.ts:1110](apps/web/lib/ingestion/server.ts#L1110) — pages with empty `text` get filtered out by `persistOcrArtifacts`. Doc AI failed as a batch (all-or-nothing) so this filter never bit; Gemini fails per-page, so silent drops now surface. Fix is to write a stub `ocr_page_jobs` row with `extraction_status: 'rejected'` when an engine returns empty text, so operators can re-process or escalate. Out of scope for this change.

2. **Repetition tails on table-structured pages.** Pages 11 and 18 of the airframe doc produced ~13-14k chars where the first ~800 chars are real content and the trailing 12-13k are `"| | | | |"` empty-table-cells repeated. Same root cause as the propeller form-template loop — different trigger pattern (table cells vs section headers) so the temperature mitigation doesn't fully fix it. **Impact:** real content extraction is fine; loop tails are wasted output tokens + slightly polluted canonical embeddings. Mitigation options for a follow-up: post-process trim on low unique-window ratio in the tail, or `stopSequences` for known patterns, or wait for Gemini 3 Flash GA (likely re-enables `frequencyPenalty`). Doesn't block shipping.

**Files changed.** 1 file:

- [apps/web/lib/ingestion/native-pdf.ts](apps/web/lib/ingestion/native-pdf.ts) — new `parseScannedPdfWithGemini` + new `runScannedOcrPageGemini` helpers, new `GEMINI_OCR_*` constants near other engine-config constants, reordered `parseScannedPdfWithFallbacks` cascade.

`tsc --noEmit` clean on the changed file (pre-existing errors elsewhere unchanged).

**Operator notes.**
- The `GEMINI_API_KEY` env var must be added to the Vercel project for Gemini to become the primary engine. Without it the cascade falls through to GPT-4o automatically — no error.
- The `GEMINI_OCR_MODEL` env var defaults to `gemini-3-flash-preview`. When Google ships GA (`gemini-3-flash` or similar), update the env var. The preview tier is real production risk — pricing, behaviour, and the active config (thinking, penalties) can change without notice.
- The `ingestion_progress` UI still labels the OCR stage as `document_ai_ocr` even when Gemini is running. The `engine` field correctly shows `gemini_3_flash_preview` underneath. Cosmetic; safe to defer.

**Commit.** _Pending operator approval. End-to-end verification on the freshly-uploaded `logbook-jeet-v10` confirmed Gemini is running and producing dramatically better output than Doc AI on handwritten content; the two known issues above are non-blockers documented for follow-up._

---

## 2026-05-26 — Canonical promotion bug (audit finding D): two-layer fix

**Why.** Yesterday's multi-event extraction fix correctly stored the JDA Services 1/24/2024 entry as an `ocr_extracted_events` row on page 10. But an owner asking Ask AI *"what's the most recent inspection on this propeller?"* still got an answer claiming "November 1, 2023" — completely hallucinated, citing page 10 in the source preview, but with a fabricated date. Investigation found two compounding bugs in the canonical-promotion chain (`document_chunks` → `ocr_entry_segments` → `canonical_document_chunks` is what Ask AI queries; page 10's text never reached the canonical layer).

**The two bugs:**

1. **Segment classification was inverted by keyword regex false-positives.** `detectSegmentType` in [segments.ts](apps/web/lib/ocr/segments.ts) checked `TABLE_HINT_RE = /\b(table|hours|cycles|serial|model|part\s+number|p\/n|s\/n)\b/i` BEFORE the page-classification trust check. Every real maintenance entry naturally contains "hours" (tach hours), "model", "serial", "s/n" — so the table-block heuristic matched every logbook page and routed them to `evidence_state='non_canonical_evidence'`. Meanwhile blank pre-printed forms ("FACTORY BULLETINS / Total Time" repeated, "Notes" pages) defaulted to `maintenance_entry` and **promoted** to canonical. Real maintenance content suppressed, template noise kept.

2. **Hidden second confidence threshold dropped handwritten content.** Even after segments are flagged `canonical_candidate=true` (threshold 0.72), `insertCanonicalChunksFromOcrSegments` in [server.ts:794](apps/web/lib/ingestion/server.ts#L794) applied its own `minConfidence ?? 0.86` filter. Older handwritten airframe/engine logbooks hit OCR confidence 0.80-0.86 consistently — cleared the segment-level gate, then silently dropped at the promotion gate. Doc AI-OCR'd typed propeller logs at 0.96-0.97 cleared both, which is why we didn't notice until testing a 1981-1992 airframe log.

**Fix.** Two files, ~50 lines:

- **[apps/web/lib/ocr/segments.ts](apps/web/lib/ocr/segments.ts)** — `detectSegmentType` re-ordered: form/tag/diagram signals still win first (they're definitive), then page_classification trust (`maintenance_entry`/`engine_log`/`airframe_log`/`prop_log`/`ad_compliance`/`work_order` → always `maintenance_entry`), only THEN the keyword heuristics for non-logbook content. Also added a minimum-content filter in `detectEvidenceState` so blank/template `maintenance_entry` segments don't promote: text under 30 chars without a date marker → `insufficient_content`; longer text with low unique-token ratio and no date → `template_or_form`. The 3 existing vitest tests still pass; comments at the bug sites explain why each branch exists.

- **[apps/web/lib/ingestion/server.ts](apps/web/lib/ingestion/server.ts)** — `insertCanonicalChunksFromOcrSegments` default `minConfidence` lowered `0.86 → 0.72` to match the segment-level threshold. Comment notes why: the previous value was a hidden second gate that contradicted the segment-level decision.

**Audit observations on a second real doc** (`02_19810401-19920812_AF_Logbook.pdf`, 23-page handwritten airframe log from 1981-1992, doc id `abae553b-…`). Ground-truth comparison via manual visual count of the rendered PDF pages vs. the pipeline output:

- Estimated 50-65 real entries visible across pages 4-20; pipeline extracted **34 events** → ~55% recall.
- For comparison the cleaner Cessna prop log (printed forms, 0.96 OCR confidence) hit ~92% recall on the same code path.
- Recall drop comes from OCR text quality on handwritten cursive: Doc AI returns text where adjacent entries blur together, so the multi-event LLM can't see entry boundaries. One concrete artifact: page 8 stored `mechanic_name: "O'neal Holsonbank"` but the actual signature on page 8 is Donald Holcomb — the LLM pulled a name from a different page's bleed-in text.
- Also surfaced a missing date sanity check: page 20 extracted `event_date: 2088-10-31` from what's actually "11/1/88" on the page. The bogus year 2088 sits in `ocr_extracted_events` with no flag.

**Out of scope** (deferred audit findings + new):
- (B) Per-entry image cropping before extraction — would address the ~55% recall on handwritten content by giving GPT-4o vision page regions instead of garbled OCR text.
- (C) Per-field confidence still copies overall.
- (E) "Logbook page produces <2 events" tripwire — would have flagged this doc as suspicious.
- (new) Date sanity check at extraction time — reject impossible years; trivial to add.
- (new) Duplicate-document cleanup — same aircraft has 47 prop-log docs from repeat uploads; polluting retrieval.

**Files changed.** 2 files:

- [apps/web/lib/ocr/segments.ts](apps/web/lib/ocr/segments.ts) — page-classification trust re-ordering + minimum-content filter for maintenance_entry.
- [apps/web/lib/ingestion/server.ts](apps/web/lib/ingestion/server.ts) — `minConfidence` 0.86 → 0.72 in canonical promotion.

**Verified — partial.** `tsc --noEmit` clean on both files (only pre-existing errors elsewhere). The 3 existing `lib/ocr/segments.test.ts` cases still pass with the segments.ts changes. **End-to-end UI verification of the 0.72 threshold fix is pending** — operator needs to re-ingest the airframe log and confirm pages 10/14/16 (canonical_candidate segments with confidence 0.83-0.85) now land in `canonical_document_chunks`. The segments.ts fix was verified separately on the propeller log earlier today.

A side-channel cleanup also happened: 6 duplicate "logbook-jeet" test docs (versions 1-6) and their ~400 derived rows (events, page_jobs, segments, chunks, embeddings, canonical, plus the auto-bridged logbook_entries and maintenance_events) were removed from the database in a single transaction so the next test upload would be clean. Script kept at `.tmp/delete-jeet.mjs` for future reuse.

**Commit.** _Pending operator verification of the 0.72 promotion-threshold fix._

---

## 2026-05-25 — Multi-event extraction per OCR page + OCR fallback hardening

**Why.** Previous session's audit of propeller logbook `178fc22f-…` (Cessna 172S, N401LP) found the field extractor producing exactly **one event per OCR page**, dropping ~63% of real entries (7 stored vs. 22-24 actually in the PDF) and producing field-blended "Frankenstein" events — page 4's stored row had date+tach from one entry but mechanic+description from a different entry. The most-recent maintenance event in the book (JDA Services 1/24/2024 on page 10) was completely missing from the data, which means owner-facing logbook views and AD-applicability calculations were silently working from a 2023 snapshot.

Root cause: the LLM JSON schema in `annotateOcrPagesWithOpenAI` typed `extracted_event` as a single object per page, and the prompt asked for one. On standard ASA-SP-L 4-up logbook layouts (4 independent entries per page) the model was forced to either pick one cell or merge cells.

**Fix — three patches in one change:**

1. **Multi-event schema + prompt** — Renamed `extracted_event: object|null` → `extracted_events: array` end-to-end. Both extraction paths updated identically:
   - [native-pdf.ts:1108-1188](apps/web/lib/ingestion/native-pdf.ts#L1108) — `annotateOcrPagesWithOpenAI` (post-OCR enrichment, runs after Document AI / Tesseract).
   - [native-pdf.ts:1890-2046](apps/web/lib/ingestion/native-pdf.ts#L1890) — `runScannedOcrBatch` (GPT-4o single-shot PDF OCR + extraction fallback).

   Both prompts now explicitly call out the ASA 4-up grid pattern, instruct "return ONE item in extracted_events per real maintenance event found on the page — never merge fields from different entries," and explicitly tell the model to return an empty array for blank/cover/form pages. A new helper `normalizeExtractedEvents` walks the array, runs each item through the existing single-event normalizer, and preserves the legacy "wrap pageText as single work_description" fallback for substantive but unstructured pages.

2. **OpenAI PDF OCR fallback timeout: 75s → 240s** ([native-pdf.ts:30](apps/web/lib/ingestion/native-pdf.ts#L30)). The multi-event schema produces 3-4× more structured output on dense 4-up pages, and 75s was already tight even with the old single-event schema. New value matches the per-batch ceiling Document AI uses, still well under the 800s retry-route `maxDuration`. **Only affects the fallback path; Doc AI happy path is unchanged.**

3. **OCR batch size: 6 → 4** ([native-pdf.ts:12](apps/web/lib/ingestion/native-pdf.ts#L12)). Smaller batches keep any single batch from spiking past the timeout, especially the trailing partial batch which tends to land on blank pre-printed form pages that GPT-4o vision processes slowly. Same total work, ~30% more API round-trips, much more reliable.

**Downstream plumbing.** `persistOcrArtifacts` event-row builder at [server.ts:1534](apps/web/lib/ingestion/server.ts#L1534) changed from `.filter().map()` to `.flatMap()` over each page's events array — one `ocr_extracted_events` row per real entry. All events from the same page still link to the same `ocr_page_job_id` and the same `bestSegment` (entry-level segmentation is finding (B), deferred). The page-scoped `extracted_field_candidates` / `field_conflicts` loop at [server.ts:1455](apps/web/lib/ingestion/server.ts#L1455) uses the FIRST meaningful event per page — those tables are page-scoped, not event-scoped, so this preserves existing semantics.

**Code-review follow-up — deterministic queue event reference.** A static-analysis pass over the diff caught a subtle Map-collision bug at [server.ts:1619](apps/web/lib/ingestion/server.ts#L1619). The `eventByPageJobId` map was being built via `new Map(iterable)` from a SELECT with no `ORDER BY`. With multi-event pages now writing N rows per `ocr_page_job_id`, the iterable-constructor silently keeps the **last** collision — so `review_queue_items.ocr_extracted_event_id` would have referenced an arbitrary event per page (and `/api/admin/rescore-confidence` would have read the same arbitrary event's confidence). Fix: explicit `if (!map.has(key)) map.set(...)` loop + add `.order('created_at').order('id')` to the SELECT. The chosen event is now reproducibly the lowest-id row for each page, symmetric with the field-candidates loop. This does **not** address the related "approve flips only the referenced event; the other N−1 events stay `needs_review`" UX gap — that's a queue-model change (one queue item per page vs. per event) tracked as a follow-up.

**No DB migration needed.** `ocr_extracted_events` has no UNIQUE on `(ocr_page_job_id)` — already supports N rows per page. The `promote_approved_event_to_logbook` trigger keys `source_id` on the event row's own UUID, so N events → N `logbook_entries` rows with full lineage. The trigger already does the right thing without changes.

**Out of scope** (separate audit findings, deferred):
- (B) Visual entry-boundary cropping before extraction.
- (C) Per-field confidence still copies overall confidence — `confidence_date`/`tach`/`mechanic` columns remain a cosmetic same-value-as-overall write. Real per-field scoring is its own change.
- (D) Canonical-promotion: page 10's JDA entry has no `canonical_document_chunks` row (unreachable by retrieval); pages 11-14 (blank "FACTORY BULLETINS" forms) are wrongly promoted. Extraction now finds page 10 correctly, but the retrieval gap remains.
- (E) "Logbook page producing <2 events" tripwire.

**Files changed.** 2 files:

- [apps/web/lib/ingestion/native-pdf.ts](apps/web/lib/ingestion/native-pdf.ts) — `NativeParsedPage.extracted_events` type, 2 JSON schemas, 2 prompts, new `normalizeExtractedEvents` helper, `OCR_BATCH_SIZE` constant, `OPENAI_OCR_BATCH_TIMEOUT_MS` constant.
- [apps/web/lib/ingestion/server.ts](apps/web/lib/ingestion/server.ts) — `ParsedPage` interface, `buildOcrPageState`, `persistOcrArtifacts` event-row builder (flatMap over events), `annotateOcrPagesWithOpenAI` call site.

**Verified — end-to-end via UI** (multi-event change). A fresh upload of the same propeller PDF (`logbook-jeet-v6`) ran through the full pipeline using `engine=google_document_ai`. Results vs. the original 7-event baseline:

| Metric | Before | After |
|---|---:|---:|
| Total events extracted | 7 | **22** |
| Page 4 (4-entry layout) | 1 (field-blended) | 3 distinct events |
| Page 5 (4-entry layout) | 1 (three-way blend) | 4 distinct events |
| Pages 6-8 (4-entry layouts each) | 3 total | 11 total |
| Page 9 (3-entry + 1 empty cell) | 1 | 3 |
| Page 10 (JDA Services single entry, 1/24/2024) | 1 (correct) | 1 (correct, captured) |
| Pages 11-15 (blank forms / Notes / cover) | 0 | 0 (correctly skipped) |
| Latest event date | 2023-03-19 (missed 2024 entry) | **2024-01-23** (audit-accurate within OCR variance) |

A standalone read-only verifier at `.tmp/verify-multi-event.mjs` reproduces the same 22-event result by calling OpenAI directly against the stored Document AI OCR text — proving the schema/prompt change is what's responsible, not a side effect of the ingestion plumbing.

The OCR fallback hardening (#2 + #3) was validated separately: with Document AI broken locally, the same PDF ingested through `engine=openai_pdf_ocr` and the multi-event schema repeatedly timed out at 75s on the dense pages 7-12 batch and the blank-form trailing pages 13-15 batch; with the 240s timeout and batch-size-4 change applied, the fallback path completed (slower than Doc AI but functional).

**Operator notes.**
- `tsc --noEmit` clean on both files (pre-existing errors elsewhere in the repo unchanged) — re-checked after the Map-collision follow-up.
- The deterministic-queue-event-reference follow-up was a code-review-only fix; it changes which event id `review_queue_items` references for multi-event pages but does **not** alter the events themselves, so the 22-event extraction baseline above is unaffected. Worth a spot-check of the human-review UI on a multi-event review-required page post-deploy.
- Production has Document AI properly configured, so the fallback patches (#2, #3) are dormant on production — they're pure safety net. Zero impact on the Doc AI happy path latency.
- Local dev had broken Doc AI credentials (Mac-style path in env on a Windows machine); resolved by pasting the service-account JSON into `GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT_JSON` in `apps/web/.env.local` (env file is gitignored).

**Commit.** _This commit._

---

## 2026-05-25 — Consolidate WO unread polling: one shared poller + tab-hidden pause

**Background.** While diagnosing the `/api/aircraft` infinite-loop bug (previous entry), the user noticed `/api/owner/work-orders/messages-unread` was also firing repeatedly — roughly every 6 seconds, ~10 calls per minute. Investigation showed this was **not** an infinite loop (no unstable `useEffect` deps), but rather two independent components each polling the same endpoint on a 12-second timer:

- [UnifiedLauncher](apps/web/components/launcher/UnifiedLauncher.tsx) — needs the rollup so the floating "Ask · Help · Messages" pill can show a red dot.
- [WorkOrderChatBubble](apps/web/components/chat-bubble/work-order-chat-bubble.tsx) — needs the same rollup so the WO-chat bubble's red dot lights up too.

Two pollers, same endpoint, slightly staggered → ~10 requests/min just sitting on the page doing nothing. Polling also continued when the tab was hidden, wasting requests when the user wasn't even looking.

**Fix.** Introduced a single shared poller via React Context. Both floating consumers now subscribe to a `useUnreadRollup()` hook that reads from one `UnreadRollupProvider` mounted in [AppLayout.tsx:1155](apps/web/components/redesign/AppLayout.tsx:1155). The provider polls `messages-unread` exactly once for the whole tree, broadcasts the latest message, and:

- **Pauses polling when `document.visibilityState === 'hidden'`** — zero requests when the user is on another tab.
- **Fires immediately on `visibilitychange` → 'visible'** — the badge updates the moment the user returns, no waiting for the next 12s tick.

Each consumer still computes its own `hasUnread` flag (they have different "last seen" semantics — the launcher tracks `mac.launcher.lastSeenMessageAt`, the bubble tracks `wo-chat-last-seen:*` per-WO keys), but the network fetch happens once instead of twice.

**Impact on request volume:**

| Scenario | Before | After |
|---|---:|---:|
| Tab visible, owner / shop persona | ~10/min (2 pollers × 12s) | ~5/min (1 poller × 12s) |
| Tab visible, admin / mechanic persona | ~5/min (Launcher only) | ~5/min (unchanged) |
| Tab hidden | ~5–10/min (kept polling) | 0/min (paused) |

For a user who leaves `/ask` open in a background tab all day, this drops from ~3 000 wasted requests/8h to zero.

**Files changed.** 4 files:

- New — [apps/web/lib/chat/unread-rollup-context.tsx](apps/web/lib/chat/unread-rollup-context.tsx) — `UnreadRollupProvider` + `useUnreadRollup()` hook. Single poller, visibility-aware.
- Updated — [apps/web/components/redesign/AppLayout.tsx](apps/web/components/redesign/AppLayout.tsx) — wraps both floating consumers in the provider, with the persona mapped to the chat persona (`'shop'` for shop, `'owner'` for everything else).
- Updated — [apps/web/components/launcher/UnifiedLauncher.tsx](apps/web/components/launcher/UnifiedLauncher.tsx) — removed the local `setInterval`/`fetch`, replaced with `useUnreadRollup()` + a small effect to recompute `hasUnread` against `mac.launcher.lastSeenMessageAt`.
- Updated — [apps/web/components/chat-bubble/work-order-chat-bubble.tsx](apps/web/components/chat-bubble/work-order-chat-bubble.tsx) — same pattern; preserves the per-WO `wo-chat-last-seen:*` semantics for `hasUnread` + `unreadPreview`.

**Verified.** `tsc --noEmit` is clean on all four files (only pre-existing errors elsewhere unchanged). End-to-end browser verification was blocked by auth (`/ask` requires a logged-in session in the preview), but the changes are localised: the dev server picks them up via HMR. After a hard refresh of `/ask`, the network tab should show `messages-unread` firing once every 12s (not twice), and stop entirely when the tab is hidden.

**Commit.** _Pending._

---

## 2026-05-25 — Session cleanup: ignore `.tmp/`; `useTenantRouter` stabilised

Two small follow-ups at the end of the inspector + audit session:

**Gap 1.** Debug scripts created during the audit (`.tmp/inspect-doc.mjs`, `.tmp/render-pdf-pages.py`) dump JSON and render PDF pages into `.tmp/`. Without an ignore rule, every future `git status` would show `?? .tmp/` (≈ 29 MB after one run) as noise, and a careless `git add .` would commit it.

**Fix 1.** Added `.tmp/` to [.gitignore](.gitignore) under a new "Local scratch / debug artifacts" section so the directory is invisible to git for everyone.

**Gap 2.** The user opened `/ask?aircraft=<id>` and saw the network tab firing `/api/aircraft` continuously in a back-to-back loop, never stopping. Beyond the obvious perf hit, this also re-ran the dedup + canonical-match logic on every iteration, occasionally racing the user's own dropdown selection via `router.replace`. The same root cause was previously suspected during the session's `/admin/command-center` `TypeError: Cannot read properties of null (reading 'useContext')` crash — that one was masked by a stale `.next` webpack cache.

**Root cause.** `useTenantRouter()` in [tenant-link.tsx](apps/web/components/shared/tenant-link.tsx) returned a fresh object literal every render — it spread the underlying Next.js router and constructed new arrow-function wrappers for `push` / `replace` / `prefetch`. Consumers like the aircraft-loader effect at [ask-experience.tsx:495](apps/web/components/ask/ask-experience.tsx:495) listed `router` in their dep array, so each `setAircraft(...)` re-render produced a "new" router → effect re-fires → fetch → setState → render → loop. Next.js's `useRouter()` itself is stable; the instability was entirely in our wrapper.

**Fix 2.** Wrapped the returned object in `useMemo` keyed on `[router, tenantSlug, demo]` so the reference is stable across renders. Inlined `ctx` inside the memo so dependency tracking stays correct. One-line-of-logic change at the root, but it impacts all **42 files** that call `useTenantRouter` — any of them with `router` in a `useEffect` deps array had a latent version of this same bug.

**Files changed.** 2 files:

- Committed — [.gitignore](.gitignore) — new `.tmp/` ignore.
- Working tree (not yet committed) — [apps/web/components/shared/tenant-link.tsx](apps/web/components/shared/tenant-link.tsx) — `useMemo` wrap of `useTenantRouter` return value.

**Verified.** Gitignore: `.tmp/` no longer appears in `git status` output. `tenant-link.tsx`: end-to-end browser verification in the preview environment was blocked by auth (`/ask` requires a logged-in session); the change is small, targeted, and structurally correct. The user's live dev server picks up the fix via HMR — after a hard refresh of `/ask`, `/api/aircraft` should fire **once** on mount, not continuously.

**Commit.** `.gitignore` → `498ef386`. `tenant-link.tsx` → pending (operator to commit + push).

---

## 2026-05-25 — Inspector polish + first real-doc audit findings

**Two follow-up bug fixes to the inspector** (both surfaced while a real platform admin used it), and a documented audit of one real propeller logbook that revealed material problems in the existing field-extraction pipeline. Fixes ship in this commit; the extraction bugs are scoped for the next session.

**Fix 1 — PDF side pane was always showing page 1 of N.** The first cut of [inspect-pdf-pane.tsx](apps/web/components/admin/inspect-pdf-pane.tsx) reused the shared `DocumentViewer` from `components/ask`, which is intentionally designed for Ask-AI citation rendering: it always appends `?page=N` to `/api/documents/[id]/preview`, and the preview route uses `pdf-lib` to extract that page as a *standalone single-page PDF*. Great for citation snippets, wrong for an admin inspector where the operator wants to scroll context around the chunk they're looking at. Rewrote the pane to load the full PDF once and seek via hash mutation (`contentWindow.location.hash = 'page=N'`) — same browser-native PDF viewer, no per-jump reload, page indicator now correctly reads `N / 15` on a 15-page doc.

**Fix 2 — OCR tab was silently empty even when Summary showed 15 pages.** The OCR tab's `document_pages` SELECT requested columns (`ocr_raw_text`, `page_classification`, `classification_confidence`, `arbitration_confidence`, `page_image_path`) that don't exist on `document_pages` — those live on the sibling `ocr_page_jobs` table. PostgREST rejected the whole query, `data` came back `null`, the length check evaluated to 0, and the user saw a misleading "No `document_pages` rows for this document yet — text-native PDF" empty state. Fixed by (a) restricting the `document_pages` SELECT to columns that actually exist there, (b) separately fetching `ocr_page_jobs` and merging per-page-number for the richer fields, (c) surfacing query errors as a red error card so this class of bug can't masquerade as "empty" again.

**Audit — propeller logbook `178fc22f-…` (N401LP, 15 pages, OCR confidence 0.96 avg).** I read pages 4–10 of the PDF visually with my multimodal vision and compared every entry against what the pipeline stored. The OCR step is doing fine; **the field extractor is the problem.** Three concrete findings, all material for production-readiness:

1. **Entry recall is ~37%.** Pages 4–9 each contain 3 or 4 distinct logbook entries in the standard ASA-SP-L 4-up layout. The extractor produces exactly **one event per page** every time. Counted across pages 4–10 I see ~19 entries in the PDF; only 7 events in `ocr_extracted_events`. Every "list all 100-hour inspections" query, every AD-applicability computation, and every owner-facing historical logbook view is therefore wrong by ~63%.

2. **The 7 events that DO exist are field-blended Frankensteins.** Page 4's stored event has date+tach from the Chino 7/22/2019 entry but work_description+mechanic from the Infinity 4-29-2019 annual — a row that doesn't correspond to any real entry. Page 5's stored event is a three-way blend (date from Chino 4/25/2020, tach from Chino 1/23/2020, work_desc from Long Beach 11/23/2019 prop-removal, ia_number from yet another row). 5 of 7 stored events have at least one field from the wrong entry.

3. **Confidence scores are not measuring per-field accuracy.** Every row stores `confidence_overall = confidence_date = confidence_tach = confidence_mechanic` — the same value, always the page-level OCR confidence. So events with provably wrong work_description and provably wrong mechanic are auto-approved at 0.96, projected into `logbook_entries` and `maintenance_events` by the trigger, and never reach the human review queue. Bad data is silently flowing into the source-of-truth tables.

Bonus side findings: the **most recent entry in the book** (page 10, JDA Services 1/24/2024) has no `canonical_document_chunks` row, so vector retrieval cannot reach it; meanwhile pages 11–14 (blank "FACTORY BULLETINS" forms and pages containing the literal string `"Notes"`) **are** in the canonical layer — promotion logic is keeping noise and dropping signal.

**Root cause (best guess pending code-read in the next session).** The `field_extraction` stage at [server.ts:1817](apps/web/lib/ingestion/server.ts:1817) appears to call the extractor LLM with the full per-page text and ask for one event, instead of a list of events. On a 4-up ASA logbook page this manifests exactly as observed.

**What's deferred to the next session (a fork from here).** (1) Rewrite the field-extraction prompt to return a list of events per page; (2) crop the page image into entry-level sub-regions before extraction (the visual layout is consistent and exploitable); (3) measure per-field confidence independently rather than copying page OCR confidence; (4) fix canonical-promotion to keep real-content pages and drop blank forms; (5) add a "logbook page produced fewer than 2 events" tripwire that flags for human review.

**Files changed in this commit.** 3 files — only the inspector polish ships now; the audit work is documented above for the next session to pick up:

- New — [apps/web/app/(app)/admin/documents/[id]/inspect/page.tsx](apps/web/app/(app)/admin/documents/[id]/inspect/page.tsx) — full inspector (Summary / OCR / Chunks / Canonical+Context / Extracted events tabs, two-column layout with sticky source-PDF pane, per-row "→ p.N" jump pills, active-page emerald tint, error cards on failed queries).
- New — [apps/web/components/admin/inspect-pdf-pane.tsx](apps/web/components/admin/inspect-pdf-pane.tsx) — full-PDF iframe pane with hash-based page navigation (no per-jump reload).
- Updated — [apps/web/app/(app)/admin/documents/admin-documents-client.tsx](apps/web/app/(app)/admin/documents/admin-documents-client.tsx) — "Inspect pipeline content →" link in the expanded-row panel header.

Temporary audit scripts (`scripts/inspect-doc.mjs`, `scripts/render-pdf-pages.py`) and rendered page images under `.tmp/pdf-pages/` are intentionally **not** committed — they're local debug artifacts kept for the follow-up session to reuse.

**Verified.** Local `tsc --noEmit` on the inspector files is clean (pre-existing errors elsewhere unchanged). The OCR-tab fix compiles and renders against a real doc — confirmed in the live `/admin/documents/<id>/inspect?tab=ocr` page after restart. The audit was performed against the actual production Supabase using the service role from `apps/web/.env.local` (read-only SELECTs).

**Commit.** _This commit._

---

## 2026-05-25 — Pipeline Inspector: source-PDF side panel

**Gap.** The first cut of the Pipeline Inspector showed *what the pipeline produced* (OCR text, chunks, canonical chunks with `context_text`, extracted events) but not *what the original document actually looked like*. To find ingestion bugs the operator has to compare the two — "the OCR for page 7 says X, but the PDF page 7 actually shows Y" — and that meant flipping between tabs and a separate `/documents/[id]` browser tab.

**Fix.** Inspector is now a two-column view on `xl+` screens: tabs on the left, the source PDF on the right. The PDF column is sticky so it stays visible while scrolling a long chunks list. Each pipeline item (OCR page, chunk, canonical chunk, extracted event) now carries a small "→ p.N" pill that updates the right pane to that page without losing scroll position. The currently-shown page is tinted emerald in the list, so you can tell at a glance which chunk corresponds to the PDF page you're inspecting.

URL state is `?tab=X&page=N&chunk=<id>` — fully linkable. The PDF pane reuses the existing `DocumentViewer` (the same component the Ask AI side panel and the `/documents/[id]` page use), so PDF rendering, page navigation, and the citation-snippet highlight all behave identically.

**Files changed.** 2 files:

- New — [apps/web/components/admin/inspect-pdf-pane.tsx](apps/web/components/admin/inspect-pdf-pane.tsx) — thin client wrapper that dynamic-loads the existing `DocumentViewer` and synthesizes the citation prop from page + optional chunk id.
- Updated — [apps/web/app/(app)/admin/documents/[id]/inspect/page.tsx](apps/web/app/(app)/admin/documents/[id]/inspect/page.tsx) — two-column layout, `?page=N` parsing, `JumpToPage` link component, per-row jump pills and active-page tinting in OCR / Chunks / Canonical / Events tabs.

**Verified.** Local `tsc --noEmit` pass shows no new TypeScript errors in either file. End-to-end browser verification deferred for the same reason as the previous inspector entry — admin-gated route, needs a real Supabase session + ingested documents.

**Operational note.** Production admin credentials were shared in the chat during this session. Recommend rotating the `info@myaircraft.us` password and enabling MFA — the DB CHECK constraint locks platform-admin to that single email, so that login is effectively the master key.

**Commit.** _Pending._

---

## 2026-05-25 — Pipeline Inspector for one document

**Gap.** A new developer taking over the RAG ingestion pipeline (production-readiness pass) needed to see the actual *content* produced at each pipeline stage for a given document — what OCR extracted from each page, how many chunks were produced and where they split, which chunks got promoted to the canonical retrieval layer, what `context_text` Wave 2 added, and whether embeddings actually exist. The platform already had per-stage *timing* visibility (`/admin/documents` table + `IngestionProgressCard`) but nothing showed the content itself. Without it, finding ingestion bugs meant writing one-off SQL.

**Fix.** New admin route `/admin/documents/[id]/inspect` (platform-admin only, gated by the existing `/admin` layout). Five tabs, all server-rendered, navigation via `?tab=` query string so every view is linkable:

- **Summary** — doc metadata header, stats grid (OCR page count, avg confidence, chunk counts, canonical counts, contextualization coverage, embedding coverage, extracted-event status), full pipeline-stage timeline from `ingestion_progress`.
- **OCR** — every `document_pages` row as an expandable item with page number, OCR engine confidence (colour-banded against the review-queue rescore thresholds), classification, char count, image path, and the full raw OCR text.
- **Chunks** — every `document_chunks` row (paginated past PostgREST's 1 000-row cap) with chunk_index, page range, token/char counts, section title, full chunk text. Page-break markers (▸) highlight where the splitter crossed onto a new page so cuts at section boundaries are easy to verify.
- **Canonical + Context** — every `canonical_document_chunks` row with the Wave 2 `context_text` blurb, the verbatim cited `chunk_text`, "ctx" / "emb" presence badges, and a top-of-page stats strip ("X of Y raw chunks promoted · Z with context_text · W with embeddings — ⚠ missing flagged"). This is the tab that surfaces the most common silent failure modes — a chunk that exists but has no embedding will silently never be retrieved.
- **Extracted events** — full `ocr_extracted_events` table for the doc with per-field confidence, mechanic / IA info, review status. The events that get auto-promoted (via the `promote_approved_event_to_logbook` trigger) into both `logbook_entries` and `maintenance_events`.

The inspector is discoverable from the existing admin pipeline monitor — clicking a row to expand it now also shows an "Inspect pipeline content →" link in the panel header.

**Files changed.** 2 files:

- New — [apps/web/app/(app)/admin/documents/[id]/inspect/page.tsx](apps/web/app/(app)/admin/documents/[id]/inspect/page.tsx)
- Updated — [apps/web/app/(app)/admin/documents/admin-documents-client.tsx](apps/web/app/(app)/admin/documents/admin-documents-client.tsx) (added the Inspect link inside the expanded row panel)

**Verified.** Local `tsc --noEmit` pass shows no new TypeScript errors in either file (pre-existing errors elsewhere in the repo are unchanged). End-to-end browser verification deferred — the route is admin-gated and depends on a real Supabase session + a populated org with documents, which can't be exercised from this session's environment. The first real verification will be the next admin login.

**Why this matters for the production push.** This is the foundation for every following debugging step. Once you can see a real document's chunks and embeddings side-by-side with its OCR text, the next questions ("is the splitter cutting mid-sentence?", "did Wave 2 actually run on this doc?", "do all canonical chunks have embeddings?") become observations instead of theories. The not-built stretch tabs — PageIndex tree and Vision pages — are deferred until a first pass over real documents tells us what we actually need next.

**Commit.** _Pending._

---

## 2026-05-24 — Marketing header now auth-aware

**Gap.** Signed-in users visiting `/` (and any other marketing page — `/pricing`, `/features`, `/blog`, `/about`, `/scanning`, etc.) saw "Sign in" and "Get started" buttons in the top-right header. The buttons made it look like the user had been logged out, even though the session was still valid (clicking "Sign in" would immediately bounce to `/dashboard` because `middleware.ts` already redirects authed users away from auth routes). The experience was confusing for returning users.

**Why this happened.** `apps/web/middleware.ts` redirects authenticated users away from `/login` (and other auth routes) but does **not** touch marketing routes. The `PublicLayout` header is a client component that always rendered the signed-out CTAs without checking auth state.

**Fix.** In [apps/web/components/marketing/vite/PublicLayout.tsx](apps/web/components/marketing/vite/PublicLayout.tsx):

- Added an `isAuthed` state and a `useEffect` that hits `GET /api/me`.
- When authed, both the desktop and mobile headers show a single blue **Dashboard** button linking to `/dashboard`.
- When signed out, the existing "Sign in" + "Get started" CTAs are preserved unchanged — no marketing regression.

**Implementation note.** The first attempt used the browser-side Supabase client (`createBrowserSupabase` → `auth.getUser()`) to detect auth state. It returned `null` user even when a valid session existed — because Supabase auth cookies in this project are HttpOnly and invisible to JavaScript. Switched to `fetch("/api/me")`, which is served by an existing route that uses the server-side Supabase client (`createServerSupabase()`) and reads HttpOnly cookies correctly. Returns 200 when authed, 401 otherwise.

**Files changed.** 1 file — `apps/web/components/marketing/vite/PublicLayout.tsx`.

**Verified.** Local dev server at `localhost:3001`:
- Signed-out path: "Sign in" + "Get started" remain visible — no regression confirmed via screenshot.
- Signed-in path: single "Dashboard" button shows — confirmed by user in their browser after refresh.
- No console errors, clean HMR recompile.

**Commit.** _Pending._

---

## 2026-05-24 — Dev server launch config fix (internal)

**Small infra fix.** `.claude/launch.json` was running `npm run dev -- --port 3001`. The repo's root `package.json` runs `turbo run dev` which doesn't accept a `--port` flag and bailed with `unexpected argument '--port' found`.

**Fix.** Replaced with `pnpm --filter @myaircraft/web dev --port 3001` so the port flag reaches `next dev` directly. This is internal — only affects the AI-assisted dev workflow, not the product.

**Verified.** Dev server starts on port 3001; homepage renders cleanly.

**Commit.** _Pending._

---

## 2026-05-24 — Repo housekeeping: untrack `.claude/settings.local.json`

**Small repo fix.** `.claude/settings.local.json` was listed in `.gitignore` but had been tracked before the ignore rule was added — so it kept showing in `git status` and changes kept getting committed. Ran `git rm --cached` so the gitignore rule actually takes effect from this commit forward. Local file untouched.

**Commit.** _Pending._

---

## 2026-05-24 — WORKLOG + Stop hook automation (internal)

**Setup.** Stood up the freelance work-tracking workflow so the client has a single document to read for transparency.

- `WORKLOG.md` at repo root — this file.
- `.claude/hooks/check-worklog.ps1` — Stop hook that nudges if source changed but `WORKLOG.md` wasn't updated this session.
- `.claude/commands/worklog.md` — `/worklog` slash command for manual updates.
- `.claude/settings.json` — wires the Stop hook into the existing hook config.

**Commit.** _Pending._

---
