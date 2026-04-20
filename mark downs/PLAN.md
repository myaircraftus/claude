# Foolproof RAG + OCR/HTR Accuracy Plan for myaircraft.us

## Summary
Build a **strict, evidence‑first ingestion and retrieval system** that guarantees accuracy by combining Abbyy capture + Google Document AI OCR/HTR, multi‑engine arbitration, deterministic validation, and mandatory human review for low‑confidence fields. Only reviewed/high‑confidence content is embedded and searchable. Citation click‑through will land on the **exact page and exact box**, with visual highlight.

---

## Key Changes / Implementation Plan

### 1) Capture + Intake (Abbyy → Evidence Layer)
- **Scanner capture (Abbyy SDK)**:
  - enforce image quality checks (blur, skew, brightness, rotation, page split)
  - page classification hints from Abbyy preserved as metadata
- **Upload intake (PDFs/images)**:
  - store original file unchanged
  - assign aircraft_id, book_type, book_number, scan_batch_id
  - generate page records + page images (original + processed)
- **Book‑level organization** (required for historical records):
  - create `books` table and force mapping per batch  
  - label every batch with “Logbook #N”

### 2) Preprocessing + Page Classification
- Run preprocessing for every page:
  - deskew, denoise, contrast enhance, split open‑book spreads
  - blank page detection + unreadable detection
- Page classifier outputs:
  - logbook type, table/entry page, attachment, form, yellow tag, AD sheet, etc.
- Store preprocessing metadata + quality scores for each page.

### 3) Multi‑Engine OCR/HTR + Arbitration (Accuracy Core)
- **Primary OCR/HTR**: Google Document AI (handwriting‑capable)
- **Secondary OCR**: Abbyy OCR output (from capture)
- **Optional fallback**: Local OCR / VLM parsing for extreme cases
- **Arbitration layer**:
  - compare fields across engines
  - score agreement per field
  - apply aviation validation rules (date formats, tach jumps, cert # pattern, AD ref syntax)
  - flag conflicts and low‑confidence fields for review

### 4) Human Review Console (Mandatory for Uncertainty)
- Create review queue for:
  - low confidence
  - field conflicts
  - unreadable/blurred pages
  - compliance‑critical fields
- Review UI features:
  - original + processed image side‑by‑side
  - OCR outputs from each engine
  - structured fields editable
  - approve/reject/split/merge entries
  - audit log of every correction

### 5) Canonical Truth Layer (Only Truth Gets Indexed)
- Build normalized `maintenance_entries` (truth layer)
- Attach every field to evidence:
  - page number, box coordinates, engine provenance
- Only reviewed or high‑confidence fields become **canonical truth**

### 6) RAG + Search Index (Hybrid Retrieval)
- Index **only canonical truth + evidence summaries**
- Routing priority:
  1) reviewed structured data  
  2) high‑confidence extracted summaries  
  3) raw OCR fallback only if explicitly allowed  
- Search modes:
  - exact match for ADs, part numbers, cert numbers  
  - structured filters for dates/times  
  - semantic for open‑ended questions  
- Every answer must include evidence + confidence level  

### 7) PDF.js Exact Anchor Navigation (Box + Page)
- Store in each citation:
  - pageNumber
  - quotedText
  - boundingRegions (x/y/width/height)
  - textAnchorStart/End
- PDF.js behavior:
  - open correct page
  - highlight exact region box
  - if box missing, fallback to page only

### 8) Accuracy Guarantees
- Any blurred/low‑confidence content is **never auto‑trusted**
- If a page is unreadable:
  - show warning
  - require manual transcription before it becomes searchable  
- “100% accuracy” achieved via **strict gating + human review**  
  (not by trusting OCR blindly)

---

## Public Interfaces / Data Model Changes
- New tables:
  - `books`, `scan_batches`, `pages`, `page_classifications`
  - `ocr_outputs`, `extraction_candidates`
  - `review_tasks`, `review_actions`
  - `maintenance_entries` (canonical truth)
- New API endpoints:
  - `/api/ingest` (intake + preprocessing)
  - `/api/review/queue`, `/api/review/submit`
  - `/api/search` (hybrid router)
  - `/api/citations` (exact anchor payload)

---

## Test Plan (Quality + Accuracy)
1) Upload historical logbook (blurred) → flagged for review  
2) Abbyy capture → DocAI OCR → arbitration results  
3) Human review edits → canonical entries created  
4) Ask: “latest 100‑hour” → answer cites exact page + box  
5) Ask: “all alternator replacements in 2023” → exact search + evidence  
6) Ask: “AD compliance status” → pulls only reviewed truth  
7) Citation click → opens correct page + highlighted box  

---

## Assumptions / Defaults
- Abbyy SDK used for scanner capture and quality scoring
- Document AI is the primary OCR/HTR engine
- Strict gate: unreviewed/low confidence never indexed as truth
- Page+box citation precision is required for v1

---

If you want, I’ll next produce a **repo‑aligned implementation breakdown** (tables, routes, job queues, and UI screens tied directly to your current codebase), then we can start in Phase 1.  
