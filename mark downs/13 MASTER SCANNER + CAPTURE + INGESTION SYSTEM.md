# MYAIRCRAFT.US — MASTER SCANNER + CAPTURE + INGESTION SYSTEM
## Codex + Claude Code Master Build Markdown
## Scanner Role + Embedded Mobile Capture + Classification-at-Capture + Multi-Engine Arbitration + Canonical Storage

You are extending the existing **myaircraft.us** product.  
Do **not** rebuild the platform from scratch.  
Inspect the current codebase first, preserve working flows, and integrate this system into the existing live product.

This build must create a **simple scanner-first experience** for field staff while preserving a **high-accuracy aviation-grade ingestion pipeline** behind the scenes.

The design goal is:

- very simple scanning UI
- dedicated scanner login
- customer/org and aircraft association at scan time
- classification at scan time
- capture on iPad and phone
- originals stored in our own cloud
- batch PDF automatically generated at the end
- page images preserved individually
- processing handed into our multi-engine OCR/HTR/VLM arbitration pipeline
- work orders and one-off evidence capture using the same component
- human review only when confidence is weak

---

# 1. CORE PRODUCT DECISION

## Final architecture decision
We are **not** building around Adobe Scan as the front-end scanner product.

We are building:

1. **our own scanner workflow inside myaircraft.us**
2. **a scanner-specific role/login**
3. **an iPad-first but phone-capable capture UI**
4. **embedded capture technology for document capture**
5. **our own cloud storage as source of truth**
6. **our own metadata, custody chain, and batch management**
7. **our own downstream arbitration/canonicalization pipeline**
8. **optional Adobe PDF Services as one backend OCR/extract lane**
9. **optional ABBYY-style embedded mobile capture for front-end capture quality**

This is the architecture to implement.

---

# 2. WHY THIS APPROACH

We want to combine:
- simple field operation
- strong page capture quality
- correct customer/aircraft/logbook association at the time of scan
- clean custody and audit trail
- strong downstream document intelligence
- shared capture tooling across scanning and maintenance workflows

This means:

- the front-end scan experience must belong to myaircraft.us
- original evidence must be stored in our own system
- third-party tools help with capture/OCR, but do not own the product flow
- capture metadata should be gathered before OCR begins
- the same capture engine should be reusable across historical logbook scanning and ongoing operational paperwork

---

# 3. PRODUCT GOALS

Build a scanner/capture subsystem that supports:

## A. Historical logbook scanning
For large historical books:
- scan many pages quickly
- associate to correct customer/org
- associate to correct aircraft
- associate to correct logbook type
- create a batch
- generate PDF automatically at end
- keep page images
- send to ingestion pipeline

## B. One-off evidence capture
For:
- work orders
- handwritten maintenance entries
- yellow tags
- signed entries
- invoices
- discrepancy sheets
- paper attachments

User can:
- take picture
- classify it
- connect it to aircraft / work order / logbook
- decide where to store it
- optionally trigger follow-up flows like invoice generation or logbook entry generation

## C. Shared ingestion quality
Whether historical or one-off:
- preprocessing
- page classification
- OCR/HTR/VLM arbitration
- deterministic validation
- human review when needed
- canonical storage

---

# 4. ROLES AND ACCESS MODEL

## Scanner Role
Create a dedicated **Scanner** role with highly limited permissions.

Scanner users can:
- log in to scanner mode
- choose customer/org
- choose aircraft
- choose logbook/document class
- create scan batches
- capture pages
- retake/delete/reorder pages
- mark page as unreadable
- submit scan batch
- view their recent batches/status
- capture one-off evidence linked to aircraft/work order/logbook

Scanner users cannot:
- manage billing
- view sensitive org admin settings
- access broad account data outside assigned work
- modify canonical maintenance truth directly
- approve compliance-critical review tasks unless separately authorized

## Optional roles related to this subsystem
- `scanner`
- `scanner_supervisor`
- `reviewer`
- `mechanic`
- `admin`

---

# 5. FRONT-END CAPTURE STRATEGY

## Preferred operational device
Prefer **iPad-first** UX, while still supporting phone.

Rationale:
- larger preview
- easier review of thumbnails
- easier page order management
- easier classification taps
- easier retake decisions
- easier document batching

## Capture technology decision
Build the scanner front-end inside our app and embed a guided capture component.

### Preferred capture integration
Use an embedded capture SDK / web capture layer similar to **ABBYY Mobile Web Capture**:
- JavaScript-based SDK
- embeddable in mobile web workflows
- automatic document detection/capture
- mobile browser support
- smartphone and tablet support
- suitable for fast document capture inside our product flow

## Important product posture
The capture SDK is only the **capture lane**, not the source of truth.

We still own:
- UI flow
- metadata collection
- storage
- batch model
- aircraft/document associations
- downstream ingestion pipeline

---

# 6. STORAGE / CUSTODY DECISION

## Source of truth
All originals must be stored in **our own cloud storage** first.

Store:
- original page image
- processed page image
- batch PDF
- batch metadata
- scanner identity
- customer/org id
- aircraft id
- document/logbook class
- timestamps
- capture device metadata if useful
- upload status
- processing status

Do NOT rely on Adobe Cloud or any third-party cloud as the primary evidence source of truth.

## Why
We need:
- stable custody chain
- auditability
- reprocessing
- deterministic document IDs
- our own canonical storage model
- future portability
- zero vendor lock-in of evidence

---

# 7. BATCHING MODES

Build two first-class capture modes.

## Mode A — Batch Scanning Mode
Used for historical books and large scan jobs.

Workflow:
1. scanner logs in
2. chooses org/customer
3. chooses aircraft
4. chooses batch class
5. captures many pages quickly
6. reviews thumbnails
7. reorders/removes/retakes if needed
8. finishes batch
9. system builds PDF
10. system stores page images + PDF
11. system starts ingestion automatically

## Mode B — Evidence Capture Mode
Used for individual items such as:
- work order
- handwritten entry
- signed maintenance statement
- invoice
- yellow tag
- discrepancy sheet
- one-off attachment

Workflow:
1. choose org/customer
2. choose aircraft
3. choose evidence type
4. capture one or more images
5. optionally choose storage target:
   - airframe log
   - engine log
   - prop log
   - avionics log
   - work order
   - job folder
   - general document
6. upload and process
7. prompt optional next action:
   - generate logbook entry
   - attach to work order
   - create invoice draft
   - create reminder candidate
   - mark informational only

---

# 8. SIMPLE SCANNER UI REQUIREMENTS

The scanner UI must be **extremely simple**.

## Required flow
### Screen 1 — Login
- scanner email/password or magic link
- optionally PIN after cached auth

### Screen 2 — Select context
- customer/org
- aircraft
- batch type / evidence type

### Screen 3 — Capture
- live camera view
- automatic document detection
- auto capture where possible
- blur warning
- edge cutoff warning
- glare/lighting warning
- quick retake button
- next page button

### Screen 4 — Review
- thumbnail strip/grid
- reorder pages
- remove bad pages
- retake selected page
- optional page-level labels
- mark page unreadable if needed

### Screen 5 — Finish
- batch title/default name
- logbook/document category confirmation
- submit

### Screen 6 — Status
- upload progress
- PDF creation status
- processing queued / running / completed / review required

## UX rule
Minimize typing.
Prefer:
- dropdowns
- chips
- scan buttons
- reusable defaults
- “same as previous page” shortcuts
- recent aircraft/customer suggestions

---

# 9. CLASSIFICATION AT CAPTURE

This is mandatory and should happen early.

## Batch-level classifications
Support:
- engine logbook
- prop logbook
- airframe logbook
- avionics logbook
- work order batch
- discrepancy batch
- general records batch
- unknown batch

## Page-level or item-level classifications
Support:
- logbook entry
- work order
- annual inspection
- 100-hour inspection
- AD sheet
- yellow tag / serviceable tag
- FAA Form 337
- FAA Form 8130-3
- discrepancy sheet
- invoice / receipt
- weight and balance
- STC/reference/manual
- informational attachment
- unknown

## Rules
- batch-level class should be quick/default
- page-level class should be optional when speed matters
- unknown must be allowed
- capture-time classification should improve downstream routing, not become an absolute irreversible truth

---

# 10. SHARED CAPTURE FOR WORK ORDERS / LOGBOOK ENTRIES

The same capture component must be reusable in operational workflows.

## Example use cases
### Work order image capture
Mechanic uploads a handwritten or paper work order:
- attach to aircraft
- attach to work order
- parse details
- optionally propose invoice
- optionally propose maintenance entry
- store source image with work order

### Manual logbook entry capture
If the user did not generate the logbook entry inside our system:
- take picture of handwritten/signed entry
- classify it
- read it
- verify it
- ask where to store it
- attach it to correct logbook
- preserve source image and extracted entry together

### Signed tag / 8130 / 337 capture
- one-off capture
- attach to aircraft/component
- run extraction
- store in correct category

This component should be universal across scanning and operations.

---

# 11. FRONT-END CAPTURE QUALITY CONTROLS

At capture time, implement real-time or near-real-time checks where possible:

- blur detection
- edge/crop completeness
- lighting/glare detection
- skew detection
- low contrast warning
- multi-page order confirmation
- duplicate page warning
- upside-down/rotation warning

If image quality is poor:
- prompt retake before upload
- allow override if user insists
- flag page quality as low in metadata

---

# 12. FALLBACKS AND FAILURE MODES

Build for real field conditions.

## Fallback A — Unknown class
Allow `unknown`.
Do not block scanning.
Route to downstream classifier later.

## Fallback B — Bad page quality
Allow upload with warning.
Flag `low_quality = true`.
Send to more aggressive downstream processing or review path.

## Fallback C — Weak internet / offline-ish capture
Support local queue / temporary persistence in browser/app session where practical:
- keep pages locally until upload succeeds
- resume upload when connection returns
- preserve metadata

## Fallback D — Partial upload failure
Never lose the batch.
Retry individual pages or finalize partial batch safely.

## Fallback E — PDF assembly failure
Keep page images individually and retry server-side PDF assembly.

## Fallback F — OCR/arbitration failure
Keep evidence safe.
Mark batch as `processing_failed` or `review_required`.
Allow reprocess.

## Fallback G — Misclassification
Allow supervisor or reviewer to reclassify later.

---

# 13. DOWNSTREAM INGESTION PIPELINE INTEGRATION

After capture, send the batch into the existing Godmode pipeline.

## Required downstream stages
1. intake registration
2. page expansion/raster validation
3. preprocessing
4. page classification
5. multi-engine extraction
6. field-level comparison
7. deterministic validation
8. arbitration
9. human review if needed
10. canonical normalization
11. embedding/indexing only after approval

## Important
Capture-time classification is an input to routing, not the only truth.
The downstream classifier can confirm/correct it.

---

# 14. MULTI-ENGINE PROCESSING MODEL

Use this combination:

## Front-end capture lane
Embedded capture SDK for better page capture quality and UX.

## OCR/HTR/document lane
Primary document engine for:
- OCR
- HTR
- forms
- layout
- page quality signals

## Secondary document lane
Fallback/comparison engine for:
- forms/tables/signatures
- second opinion
- disagreement detection

## VLM lane
For:
- handwritten ambiguity
- mixed handwritten + typed content
- graphs/tables/diagram interpretation
- relation reasoning across page objects
- interpretation of maintenance semantics

## Deterministic lane
For:
- AD patterns
- part number patterns
- cert number patterns
- date/time/tach patterns
- chronology checks
- recurrence checks
- compliance safety rules

---

# 15. SCANNER-TO-PIPELINE DATA MODEL

Build or extend these entities.

## scan_sessions
- id
- org_id
- scanner_user_id
- device_type
- device_metadata
- started_at
- ended_at
- status

## scan_batches
- id
- org_id
- aircraft_id
- scanner_user_id
- batch_type
- source_mode
- title
- page_count
- batch_pdf_path
- status
- submitted_at
- created_at
- updated_at

## scan_pages
- id
- scan_batch_id
- page_number
- original_image_path
- processed_capture_image_path
- capture_quality_score
- capture_warnings
- capture_classification
- user_marked_unreadable
- upload_status
- processing_status
- created_at

## evidence_captures
- id
- org_id
- aircraft_id
- related_work_order_id
- related_job_id
- evidence_type
- image_path
- batch_id_nullable
- chosen_storage_target
- created_by
- created_at

## scan_batch_events
- id
- scan_batch_id
- event_type
- payload
- created_at

---

# 16. AIRCRAFT / WORKFLOW ASSOCIATION RULES

Every batch or evidence item must be linked to:
- org/customer
- aircraft
- source user
- classification
- logbook/workflow destination

If aircraft is not yet found:
- allow temporary unassigned state
- require resolution before canonicalization if needed

## Storage target choices for evidence mode
- airframe log
- engine log
- prop log
- avionics log
- work order
- discrepancy
- invoice support doc
- general records
- unknown review bucket

---

# 17. BACKEND PDF / OCR OPTIONAL LANES

## Adobe role in architecture
Adobe must be treated as an **optional backend processing lane**, not the scanner front-end center.

Potential Adobe use cases:
- OCR scanned PDFs into searchable PDFs
- Extract structured text/tables/images from PDFs
- secondary extraction for comparison

## Why use Adobe only as backend lane
Adobe PDF Services publicly supports:
- OCR PDF
- Extract API
- scanned and native PDFs
- structured extraction

That makes Adobe a strong backend lane, but not the primary product shell.

## ABBYY role in architecture
ABBYY-style capture is attractive at the **capture UI/SDK layer** because it is positioned as an embeddable JavaScript-based mobile web capture SDK for phones and tablets.

---

# 18. REVIEW AND HUMAN INTERVENTION

The scanner should not handle deep review.
That belongs to reviewer roles.

## Scanner may do:
- rescan bad page
- delete bad page
- mark unreadable
- choose unknown

## Reviewer must do:
- resolve low-confidence extraction
- resolve misclassification
- resolve critical field conflicts
- approve/reject canonicalization
- split multi-entry pages
- reclassify destination when needed

---

# 19. CREDENTIAL / API / SETUP BEHAVIOR

When external services are needed, do not stop vaguely.
If credentials/setup are required, tell the user exactly:

1. which provider
2. why it is needed
3. whether it is needed now or later
4. exact setup steps
5. exact environment variables
6. how to test it

## Potential providers requiring setup
- ABBYY Mobile Web Capture or equivalent capture SDK vendor
- Adobe PDF Services
- primary OCR/document AI provider
- secondary OCR provider
- OpenAI
- storage/cloud provider
- auth/session provider if new scanner role changes auth scope
- push/email notifications if scanner status alerts are added

## Example env vars to define as needed
- ABBYY_* or capture vendor variables
- ADOBE_CLIENT_ID / ADOBE_CLIENT_SECRET or chosen credential format
- OPENAI_API_KEY
- OCR provider credentials
- STORAGE bucket/container credentials
- DATABASE connection
- auth secrets

Do not guess final names blindly; inspect current codebase conventions first.

---

# 20. SECURITY AND TENANCY RULES

## Security
- scanner users must only see assigned org/customer data
- scanner uploads must be authenticated and attributed
- all batches must be auditable
- no shared public upload endpoints without secure tokening
- storage must preserve org separation
- evidence must be immutable or versioned appropriately after submission

## Tenancy
Everything must be scoped by org/customer.
No cross-org exposure of:
- aircraft
- batches
- evidence
- documents
- canonical records

---

# 21. METRICS AND OPERATIONS

Track:
- scans per session
- retake rate
- unreadable page rate
- batch completion rate
- upload failure rate
- preprocessing failure rate
- low-confidence rate
- review-required rate
- misclassification rate
- scanner productivity by workflow
- average pages per batch
- average time to submit batch

These metrics help tune capture UX and downstream quality.

---

# 22. TESTING REQUIREMENTS

Build tests for:

## Scanner UI
- login
- org/customer selection
- aircraft selection
- batch creation
- page capture flow
- thumbnail reorder
- delete page
- retake page
- finish batch

## Failure cases
- weak connection
- partial upload
- PDF assembly failure
- low-quality page
- unknown classification
- aborted batch recovery

## Workflow integrations
- evidence capture attached to work order
- image-to-logbook-entry path
- image-to-invoice-draft suggestion path
- correct storage target assignment
- downstream job trigger after batch submit

## End-to-end
- scan batch -> store -> PDF create -> ingestion start
- capture evidence -> classify -> attach -> process -> canonicalize if approved

---

# 23. IMPLEMENTATION ORDER

## Phase 1 — Repo inspection
- inspect current codebase
- map auth flow
- map aircraft/work order/document models
- map current upload paths
- map current reminders/RAG/document flows
- identify best integration points

## Phase 2 — Scanner role + schema
- add scanner role
- add scan session/batch/page models
- add permissions
- add status lifecycle

## Phase 3 — Scanner UI
- build simple scanner UI
- iPad-first responsive layout
- batch mode and evidence mode
- classification controls
- thumbnail review

## Phase 4 — Capture SDK integration
- integrate embedded capture provider
- implement quality checks
- implement upload pipeline

## Phase 5 — Storage + PDF assembly
- store originals
- store processed images
- create batch PDFs
- status reporting

## Phase 6 — Downstream ingestion integration
- connect batches to multi-engine arbitration pipeline
- preserve classification metadata
- create review tasks when needed

## Phase 7 — Work order / logbook evidence reuse
- attach captures to work orders/jobs/logbooks
- optional invoice/logbook entry prompts

## Phase 8 — Hardening
- offline-ish retry behavior
- partial upload retry
- metrics
- supervisor/reviewer tooling
- tests

---

# 24. SUCCESS CRITERIA

This system is successful when:

- scanner staff can sign in with a dedicated scanner role
- scanning is very simple on iPad/phone
- customer/org + aircraft + classification are captured before ingestion
- originals are stored in our own cloud
- batch PDFs are created automatically
- page images are preserved individually
- the same capture tool can be reused for work orders and one-off evidence
- captured documents flow into the arbitration/canonicalization pipeline
- low-confidence pages are safely routed to review
- field teams can work fast without losing quality or custody
- the system feels simple up front and powerful behind the scenes

---

# 25. FINAL BUILD POSTURE

Build a scanner system that is:
- simple for the operator
- strict on metadata
- strong on custody
- reusable across workflows
- compatible with our multi-engine truth pipeline
- easy to extend later

The front-end should feel lightweight.
The backend should be aviation-grade.

Do not overcomplicate the scanner UI.
Do not outsource the product’s core ownership to a third-party scan app.
Own the user flow, own the evidence, and use external vendors only as capture/OCR lanes inside our architecture.

---

# 26. REPO-FIRST INSTRUCTION

Before building, inspect the current codebase and produce:

1. summary of what already exists
2. where scanner role should plug in
3. what upload/storage paths can be reused
4. what data models need extension
5. how to integrate capture mode with documents/work orders/logbooks
6. what credentials are needed now vs later
7. phased implementation plan

Then implement incrementally without breaking existing production flows.
