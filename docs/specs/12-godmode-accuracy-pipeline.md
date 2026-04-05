# Spec 12 — GodMode Accuracy Pipeline
## Multi-Engine OCR/HTR + VLM Arbitration + Deterministic Validation + Human Review + Canonical Embedding

## Core Principle
NEVER: upload → OCR once → embed everything
ALWAYS: upload → preprocess → classify → multi-engine extraction → compare → validate → review if needed → normalize → embed approved content

## Master Architecture (6 Layers)

### Layer A — Evidence Layer
Raw storage: original PDF/image, per-page raw raster, per-page processed raster, OCR output per engine, HTR output per engine, VLM output, confidence scores, source provenance

### Layer B — Candidate Extraction Layer
All candidate fields before truth is decided: dates, tach values, total times, descriptions, A&P/IA data, part numbers, AD references, manual references, work types, reminder signals — with source engine and confidence per field

### Layer C — Arbitration Layer
Compare outputs: page classification, field agreement/disagreement, deterministic validation, conflict scoring, review decision

### Layer D — Human Review Layer
If confidence low or disagreement material: generate review task + discrepancy packet, highlight conflicts, allow approve/edit/reject, save reviewer actions as canonical corrections

### Layer E — Canonical Truth Layer
Only after arbitration/review: normalized maintenance entries, structured evidence objects, aircraft maintenance history update, reminders/AD status update, exact + semantic indexes

### Layer F — Retrieval Layer
Query canonical approved data first, high-confidence auto-accepted second, raw OCR fallback third (never as primary truth)

## 11-Stage Pipeline

### Stage 1 — Intake
Store original unchanged, create document record, assign org_id/aircraft_id/uploader_id/document_type, record timestamp

### Stage 2 — Page Expansion
PDF → split pages, rasterize at sufficient resolution, preserve page order. Image → treat as single page.

### Stage 3 — Image Preprocessing
- orientation detection, deskew, rotation correction, crop borders
- denoise, contrast enhancement, brightness normalization, adaptive thresholding
- split double-page spreads if detected
- blank-page detection, backside bleed-through detection
- low-visibility scoring, attachment/insert detection
- Store: original page image, processed page image, preprocessing metadata, quality score

### Stage 4 — Page Classification
Types: cover | index/contents | engine log | prop log | airframe log | avionics log | maintenance entry | annual inspection | 100-hour inspection | progressive inspection | AD compliance | FAA Form 337 | FAA Form 8130-3 | work order | yellow tag | discrepancy sheet | status sheet | weight and balance | STC/manual/reference | table-heavy | graph/diagram-heavy | mixed attachment | blank/ignore | unknown-needs-review

Classification MUST affect extraction strategy.

### Stage 5 — Multi-Engine Extraction (Parallel Lanes)
- Lane 1: Primary document OCR/HTR (Google Document AI — typed text, forms, handwriting, layout)
- Lane 2: Secondary OCR/HTR (AWS Textract — forms/tables/signatures, comparison)
- Lane 3: VLM interpretation (OpenAI GPT-4o Vision — ambiguous handwriting, mixed layouts, tables, graphs, stamps, signatures)
- Lane 4: Deterministic pattern extraction (regex/rules — AD refs, part numbers, A&P/IA numbers, dates, tach, TT/TSOH/TSMOH/AFTT, registrations, ATA codes)

### Stage 6 — Field-Level Comparison
Compare per field: entry date, tach/hobbs/total time, TSOH/TSMOH/ETT/AFTT, work description, work type, return-to-service language, mechanic name, A&P/IA number, part/serial numbers, AD refs, FAR refs, ATA chapter, manual refs, inspection classification, reminder signals

For each field: candidate values per engine + agreement score + source engines + validation result + field confidence

### Stage 7 — Deterministic Aviation Validation
- date format plausibility
- chronological plausibility vs nearby pages
- tach/total-time progression plausibility
- AD format correctness
- part number pattern correctness
- A&P/IA format correctness
- annual/100-hour inspection language detection
- return-to-service wording detection
- due interval plausibility
- recurrence logic plausibility

### Stage 8 — Arbitration Engine
Evaluate: page type, quality score, engine agreement, rule validation, aircraft timeline consistency, compliance criticality, business risk

Outcomes: auto_accept | accept_with_caution | review_required | reject_for_manual_reprocessing

### Stage 9 — Human Review Packet Generation
Packet includes: original + processed image, page type, quality score, all OCR/HTR/VLM outputs, conflicting fields, confidence per field, validator warnings, recommended candidate, reason for review

Reviewer actions: approve all | approve individual fields | edit fields | split entries | reject extraction | mark unreadable | escalate | rerun with alternate strategy

### Stage 10 — Canonical Normalization
Only after auto-accept or human approval: normalized record → link to source page + evidence snippets + bounding boxes → push to truth store

### Stage 11 — Embedding / Indexing
Embed only approved canonical entries + high-confidence summaries + reviewed evidence. Update: exact search, structured query, semantic index, aircraft timeline, reminder engine, AD evidence matcher

## Confidence Model
- 90–100: auto_accept
- 70–89: accept_with_caution
- 50–69: review_required
- 0–49: reject (manual intervention required)
Compliance-critical fields use STRICTER thresholds.

## What MUST Go to Human Review
Poor visibility, weak handwriting, critical field disagreement, tach conflicts vs history, uncertain AD/part/A&P-IA references, ambiguous return-to-service, ambiguous inspection type, diagram/graph affecting meaning, multiple engines materially disagree, uncertain page type classification, compliance outcome depends on uncertain evidence

## Data Models (New Tables)
- extraction_runs: id, page_id, engine_name, engine_type, raw_output, confidence_summary
- extracted_field_candidates: id, page_id, field_name, candidate_value, source_engine, confidence, validation_status, normalized_value
- field_conflicts: id, page_id, field_name, candidate_values, conflict_reason, resolution_status, resolved_by, resolved_at
- review_tasks: id, org_id, aircraft_id, document_id, page_id, issue_type, severity, status, review_packet_path_or_payload, assigned_to
- maintenance_entry_evidence: id, maintenance_entry_id, page_id, snippet, bounding_box, source_engine, confidence

## 9 Orchestration Agents
1. Intake Agent — upload registration, document creation, page splitting, job scheduling
2. Preprocessing Agent — image cleanup, orientation, spread splitting, quality scoring
3. Page Classification Agent — page type + extraction strategy selection
4. Extraction Agent — calls OCR/HTR engines, VLM, collects outputs
5. Validation Agent — deterministic aviation validation, timeline, pattern checks
6. Arbitration Agent — candidate comparison, confidence aggregation, final disposition
7. Review Report Agent — human review packet creation, issue highlighting, candidate proposals
8. Canonicalization Agent — writes approved truth, indexes, embeds, updates downstream systems
9. Reminder/Compliance Agent — AD evidence matching, inspection reminder updates, due calculations

## Accuracy Optimization Strategies
- A: Neighbor page context (continued entries, signatures on next page)
- B: Aircraft timeline context (sanity-check dates, tach, total time)
- C: Field-specific arbitration (part numbers → strict rules; descriptions → tolerant semantic)
- D: Compliance risk weighting (AD/annual/100hr/RTS → stricter thresholds, more review)
- E: Review packet compression (highlight only uncertain regions, one-click approval)

## Canonical Embedding Policy
Main: approved normalized entries + approved summaries + approved AD evidence + approved reminder-relevant events
Secondary/fallback: raw OCR kept but labeled as raw/unverified, never preferred for compliance answers
Retrieval order: 1) canonical reviewed 2) high-confidence auto-accepted 3) raw evidence fallback 4) say uncertain if still unclear

## Search Rules
- Compliance-critical: exact fields + deterministic derived states + cited evidence (NO fuzzy similarity)
- Natural language: canonical structured records + cited evidence packets + raw page fallback (labeled uncertain)

## Implementation Phases
Phase 1: Evidence layer models, preprocessing pipeline, page classification, extraction run storage
Phase 2: Multi-engine extraction orchestration, field candidate storage, deterministic validators, arbitration engine
Phase 3: Review task generation, review packet structure, minimal review UI
Phase 4: Canonical normalization layer, change embedding to approved-only, maintain fallback index
Phase 5: Reminders/compliance/AD connected to canonicalized records, timeline validation, quality dashboards
