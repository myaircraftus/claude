# Go-Live Plan — myaircraft

Captured 2026-05-18. Items consciously deferred from the RAG-hardening program
to the go-live phase, so they get built and tested **with real uploads** rather
than untested months in advance. Existing sample documents are intentionally
left as-is — none of this touches them.

---

## 1. Vision-OCR in the ingestion pipeline  *(priority — pre-go-live)*

### Why
Google Document AI (the current OCR) is strong on **printed** text and weak on
**handwriting**. The corpus is mostly handwritten scanned logbooks, so Document
AI produces garbled text on those pages. Measured pilot — `scripts/ocr-pilot.mjs`,
40 random logbook pages: **GPT-4o vision re-transcription beats Document AI on
37/40 pages, mean improvement 7.3/10**, gibberish ratio 0.16 → 0.11.

### What it is — and what it is NOT
- Document AI **still runs first on every upload.** It is fast, cheap and good
  on printed text (typed manuals, POHs, native-text PDFs).
- GPT-4o vision is a **targeted cleanup** — it re-transcribes ONLY the pages
  whose Document AI text came out garbled. It does **not** replace Document AI
  and does **not** run on every page (that would be wasteful and slower).
- Forward-only: only new uploads trigger it; sample data is never touched.

### How
The vision pipeline already renders every page to a PNG image. Extend it:
1. After page images are rendered, compute a gibberish ratio on each page's
   current OCR text (`canonical_document_chunks` / `document_pages.ocr_raw_text`).
2. Garbled page (ratio above threshold) → GPT-4o vision transcribes the
   already-rendered page image → clean text.
3. Replace that page's `canonical_document_chunks` with the clean text
   (re-chunked), re-embed + re-contextualize (reuse `lib/rag/contextual.ts`).
4. Best-effort: any failure leaves the page untouched; ingestion never blocks.

### Cost
~$0.007 per garbled page, per upload. Document AI remains the cheap first pass,
so printed documents cost nothing extra.

### Test plan
After go-live, run one 40–50 page handwritten-logbook document through and
inspect the canonical chunks + the resulting logbook entries.

---

## 2. Dormant feature modules  *(future)*
`inspections` / `meter_readings` / `document_expirations` / `mechanic_certificates`
— tables and UI scaffolding exist but are empty. Each is a self-contained
feature build.

## 3. Applicability engine — Wave 3C  *(future, safety-critical)*
Refine `aircraft_ad_applicability` (the "does this AD/SB apply / is it overdue"
logic). Liability-bearing — must stay conservative, human-gated, and get close
review. Build only after the structured layers above are exercised with real data.

---

## Reference — the upload pipeline after item 1 is built

```
User uploads a document
  ↓
Native-text probe — digital PDF with real text? use it directly, skip OCR
  ↓
Google Document AI OCR  (scanned docs — fast, cheap, great on printed text)
  ↓
Vision pipeline renders page images + ColQwen2 embeds them (visual retrieval)
  ↓
NEW: garbled pages → GPT-4o vision re-transcribes → clean text replaces chunks
  ↓
Chunking → contextual embeddings (Wave 2) → canonical retrieval layer
  ↓
Event extraction → logbook_entries + maintenance_events (auto-promote trigger)
  ↓
Searchable; owner logbook + intelligence layers populated
```
