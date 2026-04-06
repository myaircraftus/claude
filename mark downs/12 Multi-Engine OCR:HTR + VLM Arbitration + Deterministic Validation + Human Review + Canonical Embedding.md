# MYAIRCRAFT.US — GODMODE ACCURACY PIPELINE
## Multi-Engine OCR/HTR + VLM Arbitration + Deterministic Validation + Human Review + Canonical Embedding

You are extending the existing **myaircraft.us** product.  
Do **not** rebuild the entire app from scratch.  
Inspect the current codebase first, preserve working flows, and integrate this architecture into the existing live product.

This system is for **aircraft maintenance records, scanned logbooks, handwriting-heavy pages, diagrams, forms, labels, attachments, tables, graphs, yellow tags, FAA forms, AD evidence, and compliance-critical records**.

The objective is to build the **most accurate aviation records intelligence system possible**, where:

- messy scanned pages are processed correctly
- handwritten and low-visibility pages are handled safely
- diagrams, objects, tables, and forms are interpreted correctly
- multiple extraction engines compare against each other
- only high-confidence canonical records are embedded
- low-confidence pages generate human-review packets automatically
- reminders, maintenance history, AD compliance, and search all run on evidence-backed structured truth

---

# 1. CORE PRINCIPLE

## Never do this:
`upload -> OCR once -> embed everything`

That is not safe enough for aviation.

## Always do this:
`upload -> preprocess -> classify -> multi-engine extraction -> compare -> validate -> review if needed -> normalize -> embed approved content`

This is the non-negotiable architecture.

---

# 2. SYSTEM GOAL

Build a **multi-stage ingestion and truth arbitration system** for aviation documents.

The system must:

1. accept messy scans and native PDFs
2. preprocess each page for readability
3. classify the page type before extraction
4. run multiple extraction engines in parallel
5. compare and score field-level agreement
6. apply deterministic aviation validation rules
7. generate human review reports for low-confidence or conflicting pages
8. create canonical structured maintenance records only after arbitration
9. embed only approved/high-confidence normalized content
10. preserve all raw evidence and citations for auditability

---

# 3. DEFINITIONS

## OCR
Optical Character Recognition.
Used mostly for printed text.

## HTR
Handwritten Text Recognition.
Used for handwritten entries, signatures, notes, and mixed print/cursive logbook pages.

## VLM
Vision-Language Model.
A model that can look at the page image and reason about:
- layout
- text relationships
- diagrams
- tables
- labels
- callouts
- arrows
- signatures
- objects
- stamps
- handwritten + printed context together

VLM is **not** a replacement for OCR/HTR.
VLM is a **reasoning and arbitration layer** that helps interpret complex pages and compare outputs.

---

# 4. MASTER ARCHITECTURE

Build the pipeline in these layers:

## Layer A — Evidence Layer
Store everything raw:
- original PDF
- original uploaded image
- per-page raw raster
- per-page processed raster
- OCR output from each engine
- HTR output from each engine
- VLM output
- metadata
- confidence scores
- source provenance

## Layer B — Candidate Extraction Layer
Store all candidate extracted fields before truth is decided:
- entry dates
- tach values
- total times
- descriptions
- A&P / IA data
- part numbers
- AD references
- manual references
- work types
- reminder-relevant signals
- source engine per field
- confidence per field

## Layer C — Arbitration Layer
Compare outputs from all engines:
- page classification
- field agreement/disagreement
- deterministic validation
- conflict scoring
- review decision

## Layer D — Human Review Layer
If confidence is low or disagreement is material:
- generate review task
- generate discrepancy packet
- highlight conflicting fields
- allow reviewer to approve/edit/reject
- save reviewer actions as canonical corrections

## Layer E — Canonical Truth Layer
Only after arbitration/review:
- create normalized maintenance entries
- create structured evidence objects
- update aircraft maintenance history
- update reminders and AD status
- update exact search indexes
- update semantic retrieval indexes

## Layer F — Retrieval Layer
Query only:
- canonical approved data
- high-confidence evidence-backed structured entries
- optionally raw OCR fallback in secondary/fallback results
- never let raw uncertain OCR become primary truth

---

# 5. REQUIRED PROCESSING PIPELINE

Implement this exact flow.

## Stage 1 — Intake
For every uploaded document:
- store original file unchanged
- create document record
- assign org_id
- assign aircraft_id if known
- assign uploader_id
- assign document type if user specified
- record upload timestamp

## Stage 2 — Page Expansion
If PDF:
- split into individual pages
- rasterize at sufficient resolution
- preserve page order
- preserve source page numbers

If image:
- treat as single page document
- process similarly

## Stage 3 — Image Preprocessing
For each page, run:
- orientation detection
- deskew
- rotation correction
- crop borders
- denoise
- contrast enhancement
- brightness normalization
- adaptive thresholding when useful
- split double-page spreads if detected
- blank-page detection
- backside bleed-through detection
- low-visibility scoring
- attachment / insert detection

Store:
- original page image
- processed page image
- preprocessing metadata
- quality score

## Stage 4 — Page Classification
Before extraction, classify page into one of these:

- cover
- index / contents
- engine log
- prop log
- airframe log
- avionics log
- maintenance entry page
- annual inspection
- 100-hour inspection
- progressive inspection
- AD compliance page
- FAA Form 337
- FAA Form 8130-3
- work order
- yellow tag / serviceable tag
- discrepancy sheet
- status sheet
- weight and balance
- STC / manual / reference
- table-heavy page
- graph/diagram-heavy page
- mixed attachment page
- blank / ignore
- unknown-needs-review

This classification must affect which extraction strategy is used.

## Stage 5 — Multi-Engine Extraction
For each page, run **multiple extraction lanes in parallel**.

### Lane 1 — Primary document OCR/HTR
Use the main document engine for:
- typed text
- forms
- handwriting
- layout-aware extraction
- page quality scoring

### Lane 2 — Secondary OCR/HTR
Use a second extraction engine as comparison/fallback:
- forms/tables/signatures support
- handwriting support if available
- second opinion on critical fields

### Lane 3 — VLM interpretation
Use a VLM on the page image with surrounding context:
- interpret ambiguous handwriting
- interpret mixed handwritten + typed pages
- interpret tables, graph labels, arrows, callouts
- interpret stamps/signatures/layout relationships
- identify if a statement actually indicates return-to-service, compliance, due status, inspection completion, etc.

### Lane 4 — Deterministic pattern extraction
Run regex / rule-based extractors for high-value structured fields:
- AD references
- part numbers
- A&P numbers
- IA numbers
- dates
- tach values
- TT / TSOH / TSMOH / AFTT
- registration numbers
- ATA codes
- recurring inspection phrasing

Do not depend on LLMs alone for these structured fields.

## Stage 6 — Field-Level Comparison
Compare outputs field-by-field, not only at full-page text level.

Fields to compare:
- entry date
- tach / hobbs / total time
- TSOH / TSMOH / ETT / AFTT
- work description
- work type
- return-to-service language
- mechanic name
- A&P number
- IA number
- part numbers
- serial numbers
- AD references
- FAR references
- ATA chapter
- manual references
- inspection classification
- reminder-relevant events

For each field:
- record candidate values from each engine
- record agreement score
- record source engine(s)
- record validation result
- assign field confidence

## Stage 7 — Deterministic Aviation Validation
This is mandatory.

Run validation rules for:
- date format plausibility
- chronological plausibility relative to nearby pages
- tach progression plausibility
- total-time progression plausibility
- AD format correctness
- part number pattern correctness
- A&P / IA format correctness
- annual inspection language detection
- 100-hour inspection language detection
- return-to-service wording
- due interval plausibility
- recurrence logic plausibility
- reminder activation sanity

If a field is syntactically possible but contextually suspicious:
- lower confidence
- create conflict marker
- optionally send to human review

## Stage 8 — Arbitration Engine
Do not say “pick whichever AI seems best.”
Build an actual arbitration engine.

The arbitration engine must:
- evaluate page type
- evaluate quality score
- evaluate engine agreement
- evaluate rule validation
- evaluate aircraft timeline consistency
- evaluate compliance criticality
- evaluate business risk of wrong extraction

Possible outcomes:
- `auto_accept`
- `accept_with_caution`
- `review_required`
- `reject_for_manual_reprocessing`

## Stage 9 — Human Review Packet Generation
When human review is needed, create a structured review packet.

Each review packet must include:
- original page image
- processed page image
- page type
- page quality score
- OCR/HTR outputs from each engine
- VLM interpretation
- conflicting fields
- confidence per field
- validator warnings
- recommended final candidate
- reason for review

Reviewer UI must allow:
- approve proposed value
- edit field(s)
- reject candidate
- reclassify page
- mark page unreadable
- mark page informational only
- split multiple maintenance events if one page contains several entries

## Stage 10 — Canonical Normalization
Only after auto-accept or human approval:
- create normalized structured record(s)
- link to source page
- link to evidence snippets
- link to bounding boxes if available
- compute derived states
- push into truth store

## Stage 11 — Embedding / Indexing
Only embed:
- approved canonical entries
- high-confidence structured summaries
- reviewed evidence-backed text

Optionally store raw OCR in a fallback search index, but not as main truth.

Update:
- exact search indexes
- structured query indexes
- semantic index
- aircraft timeline
- reminder engine inputs
- AD evidence matcher

---

# 6. ENGINE STRATEGY

Build the system to support this pattern:

## Primary document intelligence engine
Used for:
- OCR
- HTR
- form understanding
- page quality analysis
- layout extraction

## Secondary document extraction engine
Used for:
- second opinion
- comparison
- forms/tables/signatures
- disagreement detection

## VLM engine
Used for:
- ambiguous page interpretation
- mixed layout reasoning
- graph/table/diagram interpretation
- semantic interpretation of maintenance statements
- final structured extraction support

## Rule-based validators
Used for:
- deterministic correctness checks
- timeline checks
- exact pattern checks
- compliance safety rules

Important:
No one engine is “the truth.”
Truth comes from **agreement + validation + review**.

---

# 7. PAGE ROUTER

Build a page router before extraction.

The page router must decide:
- page type
- which engines to run
- how aggressively to preprocess
- whether neighboring pages should be included as context
- whether table extraction mode is needed
- whether diagram reasoning mode is needed
- whether page should go directly to review due to terrible quality

Examples:
- clean typed page -> OCR lane prioritized
- cursive handwritten entry -> HTR + VLM prioritized
- graph/diagram-heavy page -> VLM + layout reasoning prioritized
- yellow tag -> form extraction + pattern extractors prioritized
- dense mixed page -> full multi-engine arbitration

---

# 8. CONFIDENCE MODEL

Use three levels of confidence:

## Page confidence
How trustworthy the page extraction is overall.

## Field confidence
How trustworthy each extracted field is.

## Record confidence
How trustworthy the normalized maintenance record is after arbitration.

Use confidence bands:
- 90–100: auto-accept
- 70–89: accept with caution
- 50–69: review required
- 0–49: reject from canonical truth until manual intervention

Additionally, compliance-critical fields should use stricter thresholds than general descriptive text.

---

# 9. WHAT MUST GO TO HUMAN REVIEW

Human review is required when:
- page visibility is poor
- handwriting is weak
- critical fields disagree
- tach progression conflicts with aircraft history
- AD reference is uncertain
- part number is uncertain
- A&P / IA number is incomplete
- return-to-service wording is ambiguous
- inspection type is ambiguous
- page contains diagram/object/graph relationship affecting meaning
- reminder/compliance outcome depends on uncertain evidence
- multiple engines disagree materially
- page type cannot be confidently classified

---

# 10. WHAT MUST NOT BECOME CANONICAL IMMEDIATELY

Do NOT immediately commit to canonical truth:
- low-confidence handwriting
- uncertain AD compliance references
- uncertain serial numbers
- uncertain part numbers
- uncertain due dates
- uncertain signoffs
- conflicting tach or total-time values
- diagram-derived maintenance conclusions without confirmation

---

# 11. NORMALIZED DATA MODEL

Build or extend these models.

## documents
- id
- org_id
- aircraft_id
- original_file_path
- file_type
- upload_source
- status
- page_count
- created_at
- updated_at

## document_pages
- id
- document_id
- page_number
- original_image_path
- processed_image_path
- page_type
- page_quality_score
- preprocessing_metadata
- classification_confidence
- needs_review
- created_at

## extraction_runs
- id
- page_id
- engine_name
- engine_type
- raw_output
- confidence_summary
- created_at

## extracted_field_candidates
- id
- page_id
- field_name
- candidate_value
- source_engine
- confidence
- validation_status
- normalized_value
- created_at

## review_tasks
- id
- org_id
- aircraft_id
- document_id
- page_id
- issue_type
- severity
- status
- review_packet_path_or_payload
- assigned_to
- created_at
- updated_at

## maintenance_entries
- id
- org_id
- aircraft_id
- document_id
- page_id
- logbook_type
- entry_date
- tach_time
- total_time_airframe
- TSOH
- TSMOH
- ETT
- description
- work_type
- ata_chapter
- mechanic_name
- ap_cert_number
- ia_cert_number
- repair_station
- return_to_service
- confidence_overall
- review_status
- created_at
- updated_at

## maintenance_entry_evidence
- id
- maintenance_entry_id
- page_id
- snippet
- bounding_box
- source_engine
- confidence
- created_at

## field_conflicts
- id
- page_id
- field_name
- candidate_values
- conflict_reason
- resolution_status
- resolved_by
- resolved_at

---

# 12. CANONICAL EMBEDDING POLICY

This is critical.

## Main truth embedding
Embed only:
- approved normalized maintenance entries
- approved summaries of canonical records
- approved evidence-backed maintenance history
- approved AD evidence
- approved reminder-relevant extracted events

## Secondary fallback index
You may keep raw OCR / raw VLM text in a fallback evidence index, but:
- label it as raw/unverified
- never prefer it over canonical truth for compliance answers
- show it as fallback evidence only

## Retrieval policy
When answering user questions:
1. canonical reviewed records first
2. high-confidence auto-accepted records second
3. raw evidence fallback third
4. if uncertainty remains, say so

---

# 13. SEARCH + ANSWERING RULES

The search system must support:
- exact part number lookups
- exact AD lookups
- exact A&P/IA lookup
- date range lookup
- tach range lookup
- semantic maintenance history queries
- reminder evidence lookup
- page/image citation drilldown

## For compliance-critical answers
Never use fuzzy similarity as authority.
Use:
- exact fields
- deterministic derived states
- cited evidence

## For natural language answers
Use:
- canonical structured records
- cited evidence packets
- fallback raw page evidence only if labeled as uncertain

---

# 14. REMINDER ENGINE INPUT POLICY

Reminder generation must use:
- canonical maintenance entries
- approved inspection evidence
- approved AD evidence
- approved usage/tach synchronization data
- registry / certificate data
- deterministic date/time rules

The reminder engine may use LLM-extracted candidates only after arbitration and approval.

---

# 15. HUMAN REVIEW UX REQUIREMENTS

The reviewer should not be forced to manually inspect whole books.

The review UI must show:
- aircraft
- document
- page number
- original image
- processed image
- classified page type
- all extracted candidates
- validator warnings
- proposed canonical result
- neighboring page context if needed

Actions:
- approve all
- approve individual fields
- edit fields
- split into multiple entries
- reject extraction
- mark unreadable
- escalate
- rerun with alternate strategy

---

# 16. ORCHESTRATION AGENTS

Build the system as multiple cooperating agents/services, not one giant LLM prompt.

## Agent 1 — Intake Agent
Handles:
- upload registration
- document creation
- page splitting
- job scheduling

## Agent 2 — Preprocessing Agent
Handles:
- image cleanup
- orientation
- spread splitting
- visibility improvement
- quality scoring

## Agent 3 — Page Classification Agent
Handles:
- page type classification
- extraction strategy selection

## Agent 4 — Extraction Agent
Handles:
- calling OCR/HTR engines
- calling secondary engine
- calling VLM
- collecting outputs

## Agent 5 — Validation Agent
Handles:
- deterministic aviation validation
- timeline consistency
- pattern checks
- rule checks

## Agent 6 — Arbitration Agent
Handles:
- candidate comparison
- confidence aggregation
- final disposition decision

## Agent 7 — Review Report Agent
Handles:
- human review packet creation
- highlighting issues
- proposing final candidates

## Agent 8 — Canonicalization Agent
Handles:
- writing approved truth
- indexing
- embedding
- updating downstream systems

## Agent 9 — Reminder/Compliance Agent
Handles:
- AD evidence matching
- inspection reminder updates
- due calculations
- compliance status recomputation

---

# 17. ACCURACY OPTIMIZATION STRATEGIES

Implement these strategies for highest accuracy.

## Strategy A — Neighbor Page Context
Some pages need surrounding page context to interpret:
- continued entries
- signatures on next page
- references spanning pages
- tables continued across pages

Support context windows.

## Strategy B — Aircraft Timeline Context
Use prior known aircraft data to sanity-check:
- dates
- tach progression
- total time progression
- repeated component references

## Strategy C — Field-Specific Arbitration
Different fields can use different weighting:
- part numbers -> stricter rule validation
- descriptions -> more tolerant semantic arbitration
- AD references -> exact patterns + review if uncertain
- signoff language -> VLM + rule validation

## Strategy D — Compliance Risk Weighting
If a page affects:
- AD compliance
- annual/100-hour status
- return-to-service
- recurring reminders
use stricter thresholds and more likely human review

## Strategy E — Review Packet Compression
Review packets must minimize human time:
- highlight only uncertain regions
- show only disputed fields
- show recommended resolution
- preserve one-click approval

---

# 18. IMPLEMENTATION ORDER

## Phase 1
- inspect current repo
- map existing upload and RAG flows
- preserve working native-text behavior
- add evidence layer models
- add preprocessing pipeline
- add page classification
- add extraction run storage

## Phase 2
- add multi-engine extraction orchestration
- add field candidate storage
- add deterministic validators
- add arbitration engine

## Phase 3
- add review task generation
- build review packet structure
- build minimal review UI

## Phase 4
- add canonical normalization layer
- change embedding flow so only approved canonical content is embedded
- maintain fallback raw evidence index separately

## Phase 5
- connect reminders/compliance/AD evidence to canonicalized records
- add aircraft timeline validation
- add metrics and quality dashboards

---

# 19. TESTING REQUIREMENTS

Create tests for:
- low-visibility scanned pages
- rotated pages
- spread pages
- handwritten pages
- mixed handwritten + typed pages
- yellow tags / forms
- graph/diagram-heavy pages
- conflicting extraction outputs
- timeline conflict detection
- part number uncertainty
- AD reference uncertainty
- review packet generation
- canonical embedding policy
- reminder activation based on approved evidence only

---

# 20. SUCCESS CRITERIA

The system is successful when:
- messy aviation records can be processed with high accuracy
- multiple engines compare before truth is decided
- diagrams/tables/handwriting pages are handled safely
- low-confidence pages generate focused human-review packets
- only approved canonical content becomes the main searchable truth
- reminders and compliance logic depend on approved evidence, not raw guesses
- search answers are grounded and cited
- the product becomes safer and more accurate than single-engine OCR pipelines

---

# FINAL BUILD POSTURE

Do not build a naive OCR pipeline.
Do not embed raw uncertain text blindly.
Do not let one AI decide truth without arbitration.
Do not force humans to review everything.

Build a system where:
- AI extracts
- AI compares
- rules validate
- humans resolve uncertainty
- only approved normalized truth powers search, reminders, and compliance
