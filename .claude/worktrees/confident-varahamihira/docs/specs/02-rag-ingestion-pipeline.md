# Spec 2 — RAG Ingestion Pipeline (Human-in-the-Loop)

## Core Requirement
System must NOT rely on raw OCR alone. Must support messy historical aviation records including handwritten text, faded scans, open-book spreads, rotated pages, portrait/landscape variations, low-contrast scans, pasted inserts, repair tags, printed forms, and mixed document layouts.

## Goals
1. Accept uploaded PDFs/images of aircraft records
2. Preprocess each page for OCR and layout understanding
3. Classify page type before extraction
4. Extract text and structured events with confidence scoring
5. Route uncertain fields/pages to human review queue
6. Normalize reviewed information into evidence-backed record model
7. Index only reviewed/high-confidence structured content + evidence-linked page summaries into RAG
8. Enable grounded Q&A with page-level citations and evidence previews

## Pipeline Architecture

### A. Intake
- Store original file unchanged
- Create document, page, and aircraft IDs
- Support grouping by aircraft, logbook type, and upload batch

### B. Page Preprocessing
- Detect rotation/orientation
- De-skew and crop borders
- Split open-book spreads into left/right logical pages
- Improve contrast and denoise
- Detect blank pages, backside bleed-through, inserts, pasted labels, attachments
- Save both original page image and processed image

### C. Page Classification
- cover, engine log, prop log, airframe log, avionics log
- maintenance entry page, printed work order
- serviceable tag / yellow tag, AD compliance sheet
- status sheet, parts/reference page, checklist/reference insert
- blank/ignore, unknown-needs-review

### D. Extraction (page-type-specific)
- Printed OCR for typed pages
- Handwriting-aware extraction for handwritten entries
- Layout-aware extraction for tabular/ruled maintenance pages
- Attachment parser for labels/tags/cards
- Freeform narrative extraction for long maintenance descriptions

### E. Structured Normalization
Entity types: maintenance_event, inspection_event, oil_change, overhaul, repair, installation, removal, AD_compliance, component_status, discrepancy, signoff, check_result, unknown_event

Every entity must include:
- aircraft_id, tail_number, component_domain
- source_file_id, page_number, page_image_reference
- extracted_raw_text, normalized_summary
- parsed fields (date, tach, hobbs, TT, TSMOH, part_number, serial_number, work_performed, signer, certificate_number, references)
- confidence_score, review_status, timestamps

### F. Human Review Workflow
Queue for: low OCR confidence, uncertain handwriting, ambiguous dates/tach/parts, contradictory values, uncertain classification, compliance-critical wording, mixed layouts

Review UI: side-by-side original + processed, extracted fields editable, approve/reject/reclassify, mark unreadable, mark informational-only, create multiple events from one page

### G. RAG Strategy (Evidence-First)
Index:
1. Reviewed/high-confidence structured events
2. Page summaries linked to source evidence
3. Aircraft/component timelines
4. Compliance summaries
5. Document-level summaries with page references

Every retrieval result must preserve: source file, page number, evidence snippet, confidence, whether from structured reviewed data or raw fallback

### H. Retrieval Priority Order
1. Reviewed structured data
2. High-confidence extracted summaries
3. Raw page evidence only as fallback

Answers must: be grounded, show citations, avoid hallucinating unreadable handwriting, explicitly say when uncertain

## Recommended Tech Stack
- **Primary OCR/HTR:** Google Document AI (Enterprise Document OCR — supports handwriting, rotation correction, quality scoring)
- **Secondary/fallback OCR:** AWS Textract
- **LLM extraction/reasoning:** OpenAI
- **Retrieval:** OpenSearch (exact + hybrid)
- **Truth store:** PostgreSQL
- **Human review:** Non-negotiable queue UI

## V1 Simplified Architecture
- Backend: Python FastAPI, single repo
- Services: api + worker + web + opensearch + postgres + redis
- OCR: Google Document AI → AWS Textract fallback → OpenAI extraction
- Frontend: React + TypeScript, search page + doc viewer + review queue + aircraft timeline
- Data model: documents, pages, extracted_blocks, maintenance_entries, parts, ad_refs, review_tasks, corrections, citations
- Search modes: exact, filtered keyword, hybrid, assistant answer with evidence

## Database Schema
Tables: aircraft, documents, pages, page_classifications, extracted_blocks, structured_events, components, reviewers, review_tasks, embeddings, citations
