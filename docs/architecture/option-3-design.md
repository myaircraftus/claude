# Option 3 — Gemini-Direct Chunking (Design)

**Status:** Implemented + verified end-to-end. Default ON in production.
**Author:** Pipeline rewrite, May 2026.
**Master kill-switch:** `OCR_DIRECT_CHUNKING=false` (any other value, including unset, keeps it enabled).
**Provider:** Auto-detect (Gemini if `GEMINI_API_KEY` set, else OpenAI GPT-4o); pin via `OCR_DIRECT_CHUNKING_PROVIDER=gemini|openai`.
**Scope:** Replace the OCR-text → annotation → segmentation → canonical-promotion
chain with a single Gemini 3 Flash Preview call per page that emits raw text +
family-aware chunks + structured events as a constrained-JSON response, then
writes those chunks directly into `canonical_document_chunks`. All existing
fallback engines (GPT-4o, Document AI, Textract, local tesseract) keep their
current pipelines untouched.

---

## 1. Why this rewrite

Today's scanned-PDF pipeline is a 4-stage chain:

1. **OCR** (Gemini 3 Flash Preview / GPT-4o / Document AI / Textract / tesseract).
   Returns per-page text + per-block geometry.
2. **GPT-4o annotation** (`annotateOcrPagesWithOpenAI`). Re-reads the OCR text
   and assigns `page_classification` + extracts a `NativeExtractedEvent[]` list.
3. **Geometry-aware segmentation** (`buildOcrEntrySegments`). Splits each
   page's text into block-level segments, classifies each as a
   `maintenance_entry` / `signoff_block` / `header_template_block` / etc., and
   sets `canonical_candidate=true` where confidence ≥ 0.72.
4. **Canonical promotion** (`insertCanonicalChunksFromOcrSegments`). Reads
   `ocr_entry_segments WHERE canonical_candidate=true` and writes the survivors
   into `canonical_document_chunks` — the table Ask AI actually queries.

Each stage is a separate LLM/heuristic pass over the same page content. Three
distinct passes (OCR → annotation → segmentation) each get the same page wrong
in slightly different ways, and the survivors of the chain are determined by
the WORST of the three. Bake-off evidence:

- Gemini's bare OCR scored 8.8/10 on handwritten airframe pages vs Doc AI 5.2.
- But segmentation's `detectSegmentType` keyword heuristics
  (`TABLE_HINT_RE` matching "hours", "tach", "serial") frequently
  misclassified real maintenance entries as `table_block` until commit
  `5b0f199d` patched in a page-classification trust gate.
- Pre-printed-form pages still hit `template_or_form` suppression after
  `5b0f199d` because the unique-token heuristic doesn't see handwritten
  overlays added to a printed template.
- The annotation step (`annotateOcrPagesWithOpenAI`) frequently swallows
  multi-entry pages because its 12 000-char per-batch budget gets eaten by
  preamble even when the schema explicitly says "ONE item per entry."

The fix the bake-off and the audit kept landing on: **let the vision model
chunk while it reads the page**. The model that sees the layout is the one
best positioned to decide where an entry ends and the next begins. Gemini 3
Flash Preview supports OpenAPI-3.0-subset `responseSchema` — we can ask for
`raw_text + chunks[] + events[]` in one structured-output call and skip the
re-read-and-segment chain entirely.

### What we keep

- The OCR cascade (`parseScannedPdfWithFallbacks`). Gemini-direct only
  activates when (a) Gemini is the selected engine AND (b)
  `GEMINI_DIRECT_CHUNKING=true`. Every other engine keeps its current path.
- `annotateOcrPagesWithOpenAI` — still the structured-event extractor for
  GPT-4o / Doc AI / Textract / tesseract.
- `buildOcrEntrySegments` — still the segmenter for those same engines.
- `insertCanonicalChunksFromOcrSegments` — still the canonical-promotion
  step for the legacy path.
- All retrieval (`canonical_document_chunks` vector + `canonical_document_chunks`
  BM25 + `document_chunks` tree + `document_chunks` vision). Schema unchanged.
- Wave 2 contextual retrieval. Modified to skip its LLM context-blurb call for
  `source=gemini_direct` chunks (the chunks are already family-aware).

### What we remove (from the Gemini-direct path only)

For documents where the flag is on AND Gemini ran successfully:
- `annotateOcrPagesWithOpenAI` is NOT invoked. (`page_classification` and
  `extracted_events` come straight from Gemini's structured output.)
- `buildOcrEntrySegments` is NOT invoked. (No `ocr_entry_segments` rows for
  these docs.)
- `insertCanonicalChunksFromOcrSegments` is NOT invoked.

---

## 2. Schema verification — results

A test fetch was run against page 1 (cover) and page 7 (4-up handwritten
airframe entries) of `2019ae69-2080-41e7-99b8-8e17e773564a.pdf` (logbook-jeet-v10)
to verify Gemini 3 Flash Preview's `responseSchema` supports every feature the
design needs. Script: `.tmp/gemini-schema-test.mjs`. Raw responses in
`.tmp/gemini-schema-test-output/`.

| Capability tested | Verdict | Notes |
| --- | --- | --- |
| Enum with `nullable: true` at property level | ✅ Works | `page_classification: "airframe_log"` on page 7. Schema accepted `nullable: true` + `enum` together. |
| Nested object with `required + optional` | ✅ Works | `page_metadata.page_kind_freetext` (required) populated; `tail_number_visible` (optional) populated when visible, omitted otherwise. |
| Array of nested objects | ✅ Works | `chunks[5]` on page 7 covering 3 distinct `chunk_kind` enum values. |
| Mixed required / nullable / optional inside array items | ✅ Works | `events[]` items had `source_chunk_index` (required) as valid int, nullable scalars (`event_date`, `tach_time`, `mechanic_name`) came back as proper `null`, array fields (`ad_references`, `part_numbers`) as `[]`. |
| Plain string arrays (`type: array, items: {type: string}`) | ✅ Works | `ad_references: []` on page 7 (no ADs visible). |
| Constrained `chunk_kind` enum honored | ✅ Works | Page 7 emitted only `maintenance_entry`, `signoff_block`, `header_template_block` — all in the supplied enum. No out-of-enum values. |
| `finishReason: STOP` (no truncation under structured-output) | ✅ Works | Both calls returned `STOP`. Page 7's 1976-char `raw_text` + 5 chunks + 2 events fit comfortably in the 8192-token output budget. |
| Repetition tails (the open issue from the bake-off) | ✅ Did not appear | Structured output appears to suppress the failure mode where a text-only call locks into looping `| | |` patterns on table-template content. The required schema gives each chunk a structural commitment that breaks the loop. (Will re-verify on the propeller log in implementation Phase 1.) |
| `thinkingBudget: 0` still required | ✅ Yes | Same as bake-off. Without it, the thinking model burns the output budget and truncates. |

**Latency / cost per page (Gemini 3 Flash Preview, May 2026 pricing):**

| Page | Tokens prompt / candidates | Latency | Cost |
| --- | --- | --- | --- |
| 1 (cover) | 848 / 325 | 7.3s | $0.0014 |
| 7 (4-up airframe, 5 chunks + 2 events) | 861 / 1983 | 14.6s | $0.0064 |

Extrapolating: a 23-page logbook at concurrency=4 ≈ 84-90s wall-clock,
~$0.10-$0.15 total. Comparable to the current Gemini-OCR-only pass; replaces
the 90-180s GPT-4o annotation call that follows it.

### One bug surfaced by the test

The model returned `page_number: 1` even for the 7th source page, because the
single-page PDF it sees IS page 1 of 1. **Fix:** server-side, ignore the
model's `page_number` and stamp the source PDF's actual page number after the
call. (Same fix applies for ocr_extracted_events row writes — the per-page
page number must come from the source, not the model.)

---

## 3. The six per-family responseSchemas

Each family is one constrained-JSON schema selected at call time via
`inferDocumentFamily(docType)` (already exported from
`apps/web/lib/ocr/segments.ts`). The envelope is identical across families;
the only differences are the `chunk_kind` enum and the per-family chunk
`metadata` object.

> **Schema rules used throughout:**
> - OpenAPI-3.0 subset (Gemini's responseSchema dialect).
> - Nullable: `nullable: true` at the property level (NOT JSON-Schema's
>   `type: ['string','null']`).
> - Required vs optional: object-level `required: [...]` array.
> - Enum + nullable can coexist (verified in §2).

### 3.0 Shared envelope (all families)

```json
{
  "type": "object",
  "properties": {
    "page_classification": {
      "type": "string",
      "enum": [ "engine_log", "airframe_log", "prop_log",
                "maintenance_entry", "work_order", "ad_compliance",
                "inspection_report", "manual_reference", "cover",
                "blank", "unknown" ],
      "nullable": true
    },
    "raw_text": { "type": "string" },
    "overall_confidence": { "type": "number" },
    "tail_number_visible":      { "type": "string", "nullable": true },
    "aircraft_make_visible":    { "type": "string", "nullable": true },
    "aircraft_model_visible":   { "type": "string", "nullable": true },
    "chunks": { "type": "array", "items": "<<PER-FAMILY ITEM>>" },
    "events": { "type": "array", "items": "<<PER-FAMILY ITEM>>" }
  },
  "required": [ "page_classification", "raw_text", "overall_confidence",
                "chunks", "events" ]
}
```

`page_number` is intentionally absent from the schema — server-side stamping
only (see bug note in §2). Everything else is per-family.

### 3.1 LOGBOOK family

`chunk_kind` enum mirrors `OcrSegmentType` from `segments.ts` minus the
non-logbook block types, plus one new `entry_continuation` for continued
entries that wrap across pages:

```json
{
  "type": "object",
  "properties": {
    "chunk_index": { "type": "integer" },
    "chunk_kind": {
      "type": "string",
      "enum": [
        "maintenance_entry",
        "entry_continuation",
        "signoff_block",
        "attached_tag",
        "inserted_form",
        "header_template_block",
        "ignore_block"
      ]
    },
    "text": { "type": "string" },
    "section_title": { "type": "string", "nullable": true },
    "confidence": { "type": "number" },
    "is_canonical_candidate": { "type": "boolean" },
    "metadata": {
      "type": "object",
      "properties": {
        "entry_date_iso":     { "type": "string", "nullable": true },
        "tach_time_text":     { "type": "string", "nullable": true },
        "airframe_tt_text":   { "type": "string", "nullable": true },
        "tsmoh_text":         { "type": "string", "nullable": true },
        "mechanic_name":      { "type": "string", "nullable": true },
        "mechanic_cert":      { "type": "string", "nullable": true },
        "ia_number":          { "type": "string", "nullable": true },
        "ad_references":      { "type": "array", "items": { "type": "string" } },
        "part_numbers":       { "type": "array", "items": { "type": "string" } },
        "continuation_from_previous_page": { "type": "boolean" },
        "continuation_to_next_page":       { "type": "boolean" }
      }
    }
  },
  "required": [ "chunk_index", "chunk_kind", "text",
                "confidence", "is_canonical_candidate" ]
}
```

Logbook events use the existing `NativeExtractedEvent` shape with one added
`source_chunk_index` back-reference field:

```json
{
  "type": "object",
  "properties": {
    "source_chunk_index":   { "type": "integer" },
    "event_type":           { "type": "string", "nullable": true },
    "logbook_type":         { "type": "string", "nullable": true },
    "event_date":           { "type": "string", "nullable": true },
    "tach_time":            { "type": "string", "nullable": true },
    "airframe_tt":          { "type": "string", "nullable": true },
    "tsmoh":                { "type": "string", "nullable": true },
    "work_description":     { "type": "string", "nullable": true },
    "mechanic_name":        { "type": "string", "nullable": true },
    "mechanic_cert_number": { "type": "string", "nullable": true },
    "ia_number":            { "type": "string", "nullable": true },
    "ad_references":        { "type": "array", "items": { "type": "string" } },
    "part_numbers":         { "type": "array", "items": { "type": "string" } },
    "return_to_service":    { "type": "boolean", "nullable": true },
    "confidence_overall":   { "type": "number" }
  },
  "required": [ "source_chunk_index", "confidence_overall" ]
}
```

Per-family chunking guidance (encoded in the prompt, not the schema):
> Pre-printed ASA-SP-L / Jeppesen pages typically have a 4-up grid of
> independent entries — each cell has its OWN date, tach, work description,
> and mechanic signature. Emit ONE `maintenance_entry` chunk per cell.
> Signoff certifications ("I certify... A&P 12345") become a SEPARATE
> `signoff_block` chunk. 8130 / yellow-tag photocopies → `attached_tag`.
> FAA Form 337 → `inserted_form`. Pre-printed boilerplate with no real
> entry content → `header_template_block` with `is_canonical_candidate=false`.

### 3.2 WORK_ORDER family

```json
{
  "type": "object",
  "properties": {
    "chunk_index": { "type": "integer" },
    "chunk_kind": {
      "type": "string",
      "enum": [
        "header_block",
        "labor_entry",
        "parts_line",
        "discrepancy_finding",
        "corrective_action",
        "signoff_block",
        "ignore_block"
      ]
    },
    "text": { "type": "string" },
    "section_title": { "type": "string", "nullable": true },
    "confidence": { "type": "number" },
    "is_canonical_candidate": { "type": "boolean" },
    "metadata": {
      "type": "object",
      "properties": {
        "work_order_number":  { "type": "string", "nullable": true },
        "customer_name":      { "type": "string", "nullable": true },
        "tail_number":        { "type": "string", "nullable": true },
        "open_date_iso":      { "type": "string", "nullable": true },
        "close_date_iso":     { "type": "string", "nullable": true },
        "part_number":        { "type": "string", "nullable": true },
        "part_quantity":      { "type": "number", "nullable": true },
        "labor_hours":        { "type": "number", "nullable": true },
        "labor_mechanic":     { "type": "string", "nullable": true },
        "labor_cert":         { "type": "string", "nullable": true }
      }
    }
  },
  "required": [ "chunk_index", "chunk_kind", "text",
                "confidence", "is_canonical_candidate" ]
}
```

Work-order events reuse the logbook-event schema (parts/labor signoffs
ARE maintenance events — that's the existing semantic). One signoff_block
chunk → one event row.

### 3.3 AD_SB family

```json
{
  "type": "object",
  "properties": {
    "chunk_index": { "type": "integer" },
    "chunk_kind": {
      "type": "string",
      "enum": [
        "header_block",
        "applicability_clause",
        "compliance_instruction",
        "effectivity_table",
        "alternative_means",
        "reference_block",
        "ignore_block"
      ]
    },
    "text": { "type": "string" },
    "section_title": { "type": "string", "nullable": true },
    "confidence": { "type": "number" },
    "is_canonical_candidate": { "type": "boolean" },
    "metadata": {
      "type": "object",
      "properties": {
        "ad_number":           { "type": "string", "nullable": true },
        "sb_number":           { "type": "string", "nullable": true },
        "subject":             { "type": "string", "nullable": true },
        "effective_date_iso":  { "type": "string", "nullable": true },
        "compliance_date_iso": { "type": "string", "nullable": true },
        "affected_makes":      { "type": "array", "items": { "type": "string" } },
        "affected_models":     { "type": "array", "items": { "type": "string" } },
        "serial_range":        { "type": "string", "nullable": true },
        "compliance_method":   { "type": "string", "nullable": true },
        "referenced_far":      { "type": "array", "items": { "type": "string" } }
      }
    }
  },
  "required": [ "chunk_index", "chunk_kind", "text",
                "confidence", "is_canonical_candidate" ]
}
```

`events: []` — AD/SB content is purely regulatory; the chunks themselves
carry the structured data via `metadata`. No `ocr_extracted_events` rows
written for this family.

### 3.4 INSPECTION family

```json
{
  "type": "object",
  "properties": {
    "chunk_index": { "type": "integer" },
    "chunk_kind": {
      "type": "string",
      "enum": [
        "header_block",
        "checklist_section",
        "finding",
        "corrective_action",
        "signoff_block",
        "ignore_block"
      ]
    },
    "text": { "type": "string" },
    "section_title": { "type": "string", "nullable": true },
    "confidence": { "type": "number" },
    "is_canonical_candidate": { "type": "boolean" },
    "metadata": {
      "type": "object",
      "properties": {
        "inspection_type":     { "type": "string", "nullable": true },
        "inspection_date_iso": { "type": "string", "nullable": true },
        "hours_at_inspection": { "type": "number", "nullable": true },
        "cycles_at_inspection":{ "type": "integer", "nullable": true },
        "finding_severity":    {
          "type": "string",
          "enum": [ "info", "minor", "major", "airworthiness", "deferred" ],
          "nullable": true
        },
        "part_number":         { "type": "string", "nullable": true },
        "mechanic_name":       { "type": "string", "nullable": true },
        "mechanic_cert":       { "type": "string", "nullable": true },
        "ia_number":           { "type": "string", "nullable": true }
      }
    }
  },
  "required": [ "chunk_index", "chunk_kind", "text",
                "confidence", "is_canonical_candidate" ]
}
```

Inspection events use the logbook-event schema (signoff_blocks ARE maintenance
events). One signoff_block per inspection → one event row.

### 3.5 MANUAL_REFERENCE family

```json
{
  "type": "object",
  "properties": {
    "chunk_index": { "type": "integer" },
    "chunk_kind": {
      "type": "string",
      "enum": [
        "subsection",
        "table_block",
        "diagram_caption",
        "safety_warning",
        "parts_list",
        "procedural_step_block",
        "appendix",
        "ignore_block"
      ]
    },
    "text": { "type": "string" },
    "section_title": { "type": "string", "nullable": true },
    "confidence": { "type": "number" },
    "is_canonical_candidate": { "type": "boolean" },
    "metadata": {
      "type": "object",
      "properties": {
        "chapter":             { "type": "string", "nullable": true },
        "section":             { "type": "string", "nullable": true },
        "subsection":          { "type": "string", "nullable": true },
        "ata_chapter":         { "type": "string", "nullable": true },
        "revision":            { "type": "string", "nullable": true },
        "table_preserved_as":  {
          "type": "string",
          "enum": [ "pipe_delimited", "fixed_width", "prose", "not_a_table" ],
          "nullable": true
        },
        "warning_class":       {
          "type": "string",
          "enum": [ "warning", "caution", "note", "danger" ],
          "nullable": true
        },
        "part_numbers":        { "type": "array", "items": { "type": "string" } }
      }
    }
  },
  "required": [ "chunk_index", "chunk_kind", "text",
                "confidence", "is_canonical_candidate" ]
}
```

`events: []`. Per `detectEvidenceState` in `segments.ts`,
`manual_reference` content is `informational_only` and never canonical for
maintenance retrieval — but it stays in `canonical_document_chunks` so it can
still be retrieved as reference context.

`is_canonical_candidate` is set per chunk by the model based on whether the
chunk is substantive reference content (subsections, tables, parts lists with
real numbers, safety warnings) vs page-template noise (page numbers, running
headers/footers, blank pages).

### 3.6 GENERAL family (fallback)

```json
{
  "type": "object",
  "properties": {
    "chunk_index": { "type": "integer" },
    "chunk_kind": {
      "type": "string",
      "enum": [ "section", "table_block", "signature_block", "ignore_block" ]
    },
    "text": { "type": "string" },
    "section_title": { "type": "string", "nullable": true },
    "confidence": { "type": "number" },
    "is_canonical_candidate": { "type": "boolean" },
    "metadata": {
      "type": "object",
      "properties": {
        "approx_target_tokens": { "type": "integer" }
      }
    }
  },
  "required": [ "chunk_index", "chunk_kind", "text",
                "confidence", "is_canonical_candidate" ]
}
```

Prompt instructs: "Aim for ~600-token chunks at natural section boundaries
where possible." This is the closest analogue to today's `chunkPages()`
token-budget chunker but driven by the vision model, not by post-hoc text
splitting.

Events `[]` for general — no structured event semantics.

---

## 4. The Gemini-direct → DB contract

### 4.1 Per-page Gemini call (input)

For each page `p` of a non-text-native PDF, when
`GEMINI_DIRECT_CHUNKING=true` and `GEMINI_API_KEY` is set:

```
POST /v1beta/models/${GEMINI_OCR_MODEL}:generateContent
{
  contents: [{
    parts: [
      { text: <family-specific prompt> },
      { inline_data: { mime_type: "application/pdf", data: <base64 of 1-page PDF p> } }
    ]
  }],
  generationConfig: {
    temperature: 0.4, topP: 0.9, topK: 40,
    maxOutputTokens: 8192,
    thinkingConfig: { thinkingBudget: 0 },
    responseMimeType: "application/json",
    responseSchema: <family-specific schema from §3>
  }
}
```

Concurrency 4 (matches existing `GEMINI_OCR_CONCURRENCY`).
Per-page timeout 90s (matches `GEMINI_OCR_TIMEOUT_MS`).
On a single page's failure, the per-page slot is filled with an empty stub
(`text: ""`, `chunks: []`) and the document-level success-ratio check
(`GEMINI_OCR_MIN_SUCCESS_RATIO = 0.5`) runs the same as today. If too many
pages failed, the cascade falls through to GPT-4o (which uses the legacy
chain).

### 4.2 Per-page result (output)

```ts
interface GeminiDirectPageResult {
  page_number: number          // SERVER-stamped (not from model — see §2 bug)
  page_classification: string | null
  raw_text: string
  overall_confidence: number
  tail_number_visible: string | null
  aircraft_make_visible: string | null
  aircraft_model_visible: string | null
  chunks: GeminiDirectChunk[]
  events: GeminiDirectEvent[]  // empty for ad_sb / manual_reference / general
  document_family: DocumentFamily
  ocr_engine: 'gemini_3_flash_preview_direct'
}
```

### 4.3 Database writes

For each ingested document under Gemini-direct mode, the orchestrator writes:

| Table | What | Why |
| --- | --- | --- |
| `document_pages` | One row per page, `page_text = raw_text` | Existing invariant. Inspector + retrievers expect a row per page. |
| `document_chunks` | Pass-through of Gemini chunks | Tree-builder (`page_tree_nodes`) and vision retriever both read this table. Same `chunk_index`, same `chunk_text`, `metadata_json.source = 'gemini_direct'`. |
| `document_embeddings` | One embedding row per `document_chunks` row | Matches existing pipeline invariant. Cheap; same cost as today. |
| `canonical_document_chunks` | One row per chunk where `is_canonical_candidate = true` | The retrieval target. `metadata_json.source = 'gemini_direct'`, `metadata_json.chunk_kind = <family enum value>`, `metadata_json.family_metadata = <per-chunk metadata object>`. |
| `canonical_document_embeddings` | One embedding per canonical chunk | Vector retrieval reads this. Same as today. |
| `ocr_page_jobs` | One row per page | Inspector / human-review queue requires it. `engines_run = ['gemini_3_flash_preview_direct']`, `arbitration_status` derived from `overall_confidence` (same thresholds as `buildOcrPageState`). |
| `extraction_runs` | One row per page, `engine_name='gemini_3_flash_preview_direct'`, `engine_type='ocr+chunks+events'` | Audit trail. `raw_output` carries the Gemini response; `structured_output` carries the events. |
| `ocr_extracted_events` | One row per Gemini `events[]` item (logbook / work_order / inspection only) | Feeds the existing trigger that promotes events into `maintenance_events` for owner-facing Ask AI. |
| `ocr_entry_segments` | **NOT WRITTEN** | The whole segmentation chain is bypassed. |
| `ocr_segment_field_candidates`, `extracted_field_candidates`, `field_conflicts`, `segment_conflicts`, `review_queue_items` (segment-scope) | **NOT WRITTEN** | These all derive from segments. |
| `review_queue_items` (page-scope) | Same logic as today — fired by `needs_human_review` on `ocr_page_jobs` | Page-level review is still possible (low confidence, classification mismatch). |

### 4.4 chunk_index numbering across the document

`canonical_document_chunks.chunk_index` is unique per `(document_id, chunk_index)`.

| Path | Scheme |
| --- | --- |
| Text-native (today) | Monotonic 0..N across the whole document. |
| OCR-segment promotion (today) | `page_number * 1000 + segment_index`. |
| Gemini-direct (new) | `page_number * 1000 + per_page_chunk_index`. (Mirrors OCR-segment promotion. Cap of 1000 per page is well above the realistic chunk count per page; an 8192-token output budget caps Gemini at ~20-30 chunks/page in practice.) |

Same scheme is used for the pass-through write to `document_chunks` so tree
nodes and vision page-mappings stay stable across the layer.

### 4.5 events[] → ocr_extracted_events

For each `events[i]` from a logbook / work_order / inspection page:
- `ocr_page_job_id` = the page's `ocr_page_jobs.id` (server-stamped).
- `ocr_entry_segment_id` = NULL (no segments in this mode).
- `event_date`, `tach_time`, etc. = field-by-field copy from the event item.
- `raw_text` = the source chunk's `text` (looked up via `source_chunk_index`).
- `confidence_overall` = event's `confidence_overall` (with `page.overall_confidence` as fallback).
- `review_status` = `'approved'` if confidence ≥ 0.72 else `'needs_review'`.
- `segment_group_key`, `evidence_state` = NULL (no segments).

Downstream: the existing promote-events-to-maintenance-events trigger fires
exactly as today (`source_event_id` linking is unchanged), so owner-facing
Ask AI sees these events identically.

### 4.6 Wave 2 contextual retrieval

`contextualizeCanonicalDocument` runs unchanged at the end of ingestion. **One
modification:** when a canonical chunk's `metadata_json.source ===
'gemini_direct'`, the LLM context-blurb call is skipped and `context_text` is
set to the deterministic identifier line only (`tail · make+model · doc_type ·
title · section_title · p<n>`).

Rationale: Gemini-direct chunks already carry section-title + family-aware
boundaries + identifier metadata. The LLM blurb on top would be near-duplicate
information. Skipping saves the per-chunk GPT-4o-mini call (most of Wave 2's
cost). The identifier line + the chunk text itself still go to the embedding,
so retrieval quality is preserved.

The `scripts/wave2-contextualize.mjs` standalone backfill picks up Gemini-
direct chunks with `context_text = NULL` (i.e., backfilled docs) and applies
the same skip-LLM rule.

### 4.7 Feature flag and per-document mode resolution

```
GEMINI_DIRECT_CHUNKING=true  (env)
                |
                v
For each ingesting document:
  1. Text-native probe (unchanged).
  2. If text-native → text-native path (unchanged).
  3. Else, OCR cascade (parseScannedPdfWithFallbacks):
     a. Gemini attempt:
        - If GEMINI_DIRECT_CHUNKING=true → parseScannedPdfWithGeminiDirect
        - Else                          → parseScannedPdfWithGemini (today)
        Both have the same success-ratio cascade trigger (< 0.5 → next engine).
     b. GPT-4o attempt (unchanged, legacy chain).
     c. Doc AI / tesseract / Textract (unchanged).
  4. Persistence:
     - Result tagged with which path produced it.
     - Gemini-direct results → new persistGeminiDirectArtifacts (§5).
     - All other results     → existing persistOcrArtifacts (no change).
```

A single document's mode is decided at OCR time and persisted. No mixed
modes within a document.

---

## 5. File-by-file implementation plan

> **Status:** Plan only. No code is written until the client approves §3 + §4.

### 5.1 NEW — `apps/web/lib/ocr/gemini-direct.ts`

The whole new module:

- Exports:
  ```ts
  export type GeminiDirectChunkKind = ... // discriminated union of all 6 families
  export interface GeminiDirectChunk { ... }
  export interface GeminiDirectEvent { ... }
  export interface GeminiDirectPageResult { ... }
  export function buildResponseSchema(family: DocumentFamily): object
  export function buildPrompt(family: DocumentFamily, args: { docType, title, make, model }): string
  export async function runGeminiDirectPage(args: {
    pdfDoc: PDFDocument
    pageNumber: number
    docType: string
    family: DocumentFamily
    prompt: string
    schema: object
  }): Promise<GeminiDirectPageResult>
  export async function parseScannedPdfWithGeminiDirect(args: {
    fileUrl: string
    docType: string
    title: string
    pageCount: number
    make?: string | null
    model?: string | null
    onProgressUpdate?: (update: OcrProgressUpdate) => Promise<void> | void
  }): Promise<GeminiDirectIngestResponse>
  ```
- Per-family `RESPONSE_SCHEMAS: Record<DocumentFamily, object>` (the 6 schemas).
- Per-family prompts, reusing the existing `OCR_PROMPTS` family text + a
  chunk/event addendum.
- Concurrency / timeout / min-success-ratio constants identical to the
  existing Gemini code.
- Server-side stamping of `page_number` after each call.

### 5.2 EDIT — `apps/web/lib/ingestion/native-pdf.ts`

- Existing `parseScannedPdfWithGemini` stays as-is (used when flag is off).
- `parseScannedPdfWithFallbacks` gains a `useGeminiDirect: boolean` param;
  when true, the Gemini attempt invokes the new `parseScannedPdfWithGeminiDirect`
  and the returned response is tagged so the orchestrator routes it through
  the new persistence path.
- Export the new types from gemini-direct.ts via a re-export so server.ts has
  a single import surface.

### 5.3 EDIT — `apps/web/lib/ingestion/server.ts`

- New `persistGeminiDirectArtifacts({ supabase, document, pages: GeminiDirectPageResult[] })`
  function. Mirrors `persistOcrArtifacts` but:
  - Writes `ocr_page_jobs` with `engines_run = ['gemini_3_flash_preview_direct']`.
  - Writes `extraction_runs` with the Gemini response (raw_output) + events
    (structured_output).
  - Does NOT call `buildOcrEntrySegments`.
  - Does NOT write `ocr_entry_segments` / `ocr_segment_field_candidates` /
    `field_conflicts` / `segment_conflicts`.
  - Writes `ocr_extracted_events` directly from the Gemini events array.
  - Writes page-scope `review_queue_items` based on `ocr_page_jobs.needs_human_review`.
- New `insertCanonicalChunksFromGeminiDirect({ supabase, document, pages })`
  function. Mirrors `insertCanonicalChunksFromOcrSegments` but reads from the
  in-memory `pages: GeminiDirectPageResult[]` (no DB segment query). Writes
  rows with `chunk_index = page_number * 1000 + per_page_chunk_index`,
  `metadata_json.source = 'gemini_direct'`,
  `metadata_json.chunk_kind = <enum value>`,
  `metadata_json.family_metadata = <per-chunk metadata>`. Embeds with
  `generateEmbeddings` and writes `canonical_document_embeddings` same as
  today.
- `ingestDocumentInline` orchestration changes:
  - Pass `useGeminiDirect = process.env.GEMINI_DIRECT_CHUNKING === 'true'` to
    `parseScannedPdfWithFallbacks`.
  - After OCR returns, branch on `ingestData.gemini_direct === true`:
    - If true:
      - Skip the line-1854 `annotateOcrPagesWithOpenAI` call.
      - Write `document_chunks` pass-through (the same Gemini chunks, no
        changes to the existing batch insert).
      - Run `insertEmbeddingsCompat` (existing) — same embedding cost, no
        change.
      - Call `persistGeminiDirectArtifacts` instead of `persistOcrArtifacts`.
      - Call `insertCanonicalChunksFromGeminiDirect` instead of
        `insertCanonicalChunksFromOcrSegments`.
    - If false:
      - Existing flow unchanged.
- `clearDerivedArtifactsWithRetry` already cleans all relevant tables; no
  change needed.

### 5.4 EDIT — `apps/web/lib/rag/contextual.ts`

- In `contextualizeCanonicalDocument`, after fetching the chunk's
  `metadata_json` (currently not selected), check
  `metadata_json.source === 'gemini_direct'`. If so:
  - Set `context_text = deterministicLine(chunk, doc, ac)` directly.
  - Skip the `generateContext` LLM call.
  - Still re-embed `(context_text || chunk_text)` so the canonical embedding
    is updated.
- Same shape change applied to `scripts/wave2-contextualize.mjs` for the
  backfill path.

### 5.5 EDIT — `apps/web/lib/ocr/segments.ts`

No structural change. `inferDocumentFamily` is already exported.

### 5.6 NEW — `.tmp/gemini-direct-verify.mjs`

Verification harness, modelled on `.tmp/ocr-bakeoff.mjs`. Given a document
ID, runs (a) the legacy pipeline output (read from DB) vs (b) the new
Gemini-direct pipeline output (run live), and compares:
- Total chunks count per page.
- Canonical chunks count per page.
- Chunks that contain ground-truth maintenance-entry phrases (date + tach +
  mechanic name in the same chunk).
- Events extracted per page.
- Wall-clock time.
- Total cost.

Run before flipping the flag in any environment.

### 5.7 NO MIGRATION NEEDED

`canonical_document_chunks` schema accepts everything we need:
- `chunk_index` is `bigint`, room for the `page*1000+i` scheme.
- `metadata_json` is `jsonb`; the new keys (`source`, `chunk_kind`,
  `family_metadata`) live there.
- `parser_confidence` numeric is reused.
- `source_chunk_id` / `source_segment_id` left NULL for Gemini-direct (those
  are legacy back-references).

Same for `document_chunks` and `ocr_extracted_events`. No migration required.

---

## 6. Risks and open questions

### R1. Repetition tails on form-template pages
The bake-off saw 10-13k chars of `| | |` appended on some airframe pages with
text-only Gemini. Initial structured-output evidence (§2) shows no repetition
— the schema's required chunks[] structure breaks the loop. **Mitigation:**
re-verify on the propeller log (`logbook-jeet-v7` / `76b30a6a-...`, 15 pages,
the original locus of the issue) in Phase 1 before flipping the flag.

### R2. Per-family classification overlap
A document classified as `logbook` (DocumentFamily) can contain pages of
attached AD/SB photocopies that are AD/SB content. Today these still go
through the logbook family path; the model emits them as `attached_tag` or
`inserted_form` chunks. **Acceptable:** the chunk's `text` still gets indexed
and retrieved; only the structured `metadata` is logbook-shaped instead of
ad_sb-shaped. **Follow-up if needed:** per-page family inference (the model
could emit `detected_family`).

### R3. Cost regression on big binder uploads
A 200-page maintenance manual = 200 Gemini calls = ~$1.20-$2.00 vs today's
Doc AI cost of pennies. **Mitigation:** the cascade still prefers Document AI
for non-handwritten content via the empirical confidence check.
`GEMINI_DIRECT_CHUNKING` does not force Gemini; it only swaps the post-Gemini
chain. Reference docs (`service_manual`, `maintenance_manual`, `parts_catalog`)
that already short-circuit out of vision-GPU dispatch (see server.ts line
2204) likely don't need this path at all. **Open question:** should the flag
be doc-family-gated (e.g., disabled by default for `manual_reference`)?
**Proposal:** make this configurable via a second env var
`GEMINI_DIRECT_CHUNKING_FAMILIES=logbook,work_order,inspection,ad_sb` and
default to that. Manuals stay on the legacy chain even with the flag on.

### R4. Page-17 silent-drop bug
`persistOcrArtifacts` at server.ts:1110 filters out pages with empty text.
For Gemini-direct mode, a per-page Gemini failure should produce a stub row
with `extraction_status='rejected'` so the page doesn't silently disappear
from the document. Out of scope for the flag work itself (the same bug exists
in the legacy path) but `persistGeminiDirectArtifacts` should write the stub
correctly from day one.

### R5. Schema drift between families
The 6 schemas differ in their `chunk_kind` enums and `metadata` shape only.
Adding a new chunk kind in the future requires updating both the schema and
any downstream consumer (the inspector UI's chunk-kind filter, for instance).
**Mitigation:** keep the schemas in one module (`gemini-direct.ts`) with type
exports; add a runtime validator that fails fast on unknown enum values.

### R6. The model occasionally emits page_number=1 for the single-page PDF
Documented in §2. **Fix in implementation:** server-stamp page_number from the
caller's known source page. Already noted in §5.1.

### R7. ocr_extracted_events shape mismatch for non-logbook families
`ocr_extracted_events` table is logbook-shaped (event_date, tach_time, etc.).
Work_order / inspection events fit reasonably. AD/SB / manual_reference don't
emit events at all (per §3.3 / §3.5). **Acceptable for v1.** Long-term, an
AD-compliance-events table is a reasonable next step but is OUT OF SCOPE.

---

## 7. Test plan

### Pre-implementation (Phase 0, this doc)
- ✅ Single-page Gemini schema fetch on cover + page-7 of the airframe log.
  Done — results in `.tmp/gemini-schema-test-output/`.
- ⬜ Single-page schema fetch on a `manual_reference` page (POH section)
  to confirm the manual_reference enum + metadata work. Adds ~$0.005.
- ⬜ Single-page schema fetch on a known-broken propeller log page
  (`76b30a6a-...`) to verify repetition-tail suppression. Adds ~$0.005.

### Phase 1 (after design review, before flipping flag)
- Implementation + unit tests for:
  - `buildResponseSchema(family)` returns the correct shape per family.
  - `runGeminiDirectPage` parses + validates the response cleanly.
  - `parseScannedPdfWithGeminiDirect` handles partial-failure cascade
    (success-ratio < 0.5 throws the right exception).
  - `insertCanonicalChunksFromGeminiDirect` writes the right chunk_index
    scheme.
  - `contextualizeCanonicalDocument` skips the LLM call for
    `source='gemini_direct'` chunks.

### Phase 2 (post-implementation, before staging rollout)
- `.tmp/gemini-direct-verify.mjs` on:
  - `logbook-jeet-v10` (handwritten airframe, 23 pages) — primary doc.
  - `logbook-jeet-v7` (printed propeller, 15 pages) — repetition-tail
    repro doc.
  - One real work_order doc from staging.
  - One real AD/SB doc from staging.
  - One POH section from staging.
- Compare: chunks/canonical-chunks/events count, wall-clock, cost,
  page-recall@20 on a known query set against the doc.

### Phase 3 (rollout)
- Flip `GEMINI_DIRECT_CHUNKING=true` in STAGING first.
- Re-ingest the 5 test docs above.
- Manually verify in `/admin/documents/[id]/inspect` that the canonical
  chunks look right and events were extracted.
- Watch `[ingestion]` logs for per-page failure counts.
- After 1 week of clean staging operation, flip in PROD.

### Rollback
- Flag is OFF by default. Setting it back to `false` reverts new ingests to
  the legacy chain immediately.
- Already-ingested Gemini-direct docs keep working — their
  `canonical_document_chunks` rows are schema-compatible. They just have
  `metadata_json.source='gemini_direct'` instead of `'ocr_segment'`. No
  re-ingestion required to roll back.
- To re-process a Gemini-direct doc through the legacy chain: use the
  existing "Re-ingest" admin button. The next ingestion run with the flag off
  will produce legacy-shaped artifacts and overwrite canonical chunks via
  the existing `clear_document_derived_artifacts` RPC.

---

## 8. Out of scope (intentionally)

- Adding new database tables.
- Changing `canonical_document_chunks` schema.
- Touching `annotateOcrPagesWithOpenAI`, `buildOcrEntrySegments`, or
  `insertCanonicalChunksFromOcrSegments`. They stay for non-Gemini engines.
- Vision-OCR re-transcription (`retranscribeGarbledPages`) — not invoked in
  Gemini-direct mode either, because Gemini IS the vision pass.
- Per-page DocumentFamily inference (R2 above).
- Splitting `ocr_extracted_events` into per-family tables (R7 above).
- The page-17 silent-drop bug (R4 — pre-existing, but the new function
  writes correct stubs from day one).

---

## 9. Approval checklist

Before any code is written, please confirm:

- [ ] §3 — The six per-family schemas are what you want.
- [ ] §4.3 — The DB write plan is what you want (pass-through to
  `document_chunks`, skip `ocr_entry_segments`, write
  `ocr_extracted_events`).
- [ ] §4.4 — chunk_index scheme (`page*1000+i`) is fine.
- [ ] §4.6 — Wave 2 skips the LLM call for Gemini-direct chunks.
- [ ] §4.7 — Per-document mode is decided at OCR time and not mixed within
  a doc.
- [ ] §6 R3 — `GEMINI_DIRECT_CHUNKING_FAMILIES` proposal (default
  `logbook,work_order,inspection,ad_sb`) — accept, reject, or modify.
- [ ] §5 — File-by-file plan is the implementation surface you expect.
- [ ] §7 — Test plan is acceptable; add Phase 0 fetches above if you want
  them done now.

After approval, Phase 1 (implementation) begins. Estimated implementation
size: ~600-900 LOC net new, ~200 LOC modified.
