# MyAircraft — Complete System Documentation
## Scan-to-Embedding Pipeline · Developer Implementation Plan · All Workflows

**Version:** 1.0 — April 2026
**Platform:** myaircraft.us
**Stack:** Next.js 14 · TypeScript · Supabase · OpenAI · TailwindCSS · Stripe · Vercel
**Prepared for:** Development Team & Claude Code Agent

---

## Table of Contents

1. [What We're Building and Why](#1-what-were-building-and-why)
2. [The Real Document World — What We Actually Scan](#2-the-real-document-world)
3. [Complete Pipeline Architecture: Scan to Embedding](#3-complete-pipeline-architecture)
4. [Scanner Operator Workflow — Step by Step](#4-scanner-operator-workflow)
5. [QC and Auditor Workflow](#5-qc-and-auditor-workflow)
6. [Developer Implementation Plan — Phase by Phase](#6-developer-implementation-plan)
7. [Database Architecture](#7-database-architecture)
8. [API Routes Reference](#8-api-routes-reference)
9. [What's Built vs What's Not](#9-whats-built-vs-whats-not)
10. [Environment Setup](#10-environment-setup)
11. [Appendix A: Document Classification Schema](#appendix-a-document-classification-schema)
12. [Appendix B: Field Extraction Schemas by Document Type](#appendix-b-field-extraction-schemas)
13. [Appendix C: Claude Code Agent Instructions](#appendix-c-claude-code-agent-instructions)

---

## 1. What We're Building and Why

### Product Summary

MyAircraft is a multi-tenant SaaS platform for aviation maintenance organizations, aircraft owners, and FBOs (Fixed-Base Operators). The core job: take physical aircraft records — logbooks, maintenance entries, ADs, Form 337s, weight and balance sheets, propeller logs, avionics logs — and digitize them into a searchable, queryable, AI-powered database tied to specific tail numbers.

The product solves a real pain: aviation maintenance records are almost entirely paper-based, stored in physical binders, and completely unsearchable. When a DPE (Designated Pilot Examiner), A&P mechanic, or aircraft owner needs to answer "When was the last annual on N262EE?" or "Is the transponder current?" they have to manually flip through books. MyAircraft makes that question answerable in seconds.

### Why Quality Matters More Than Speed Here

Aviation records are legally significant. A bad entry in an aircraft logbook can ground a plane, fail an FAA audit, or affect an aircraft's resale value. Unlike most document digitization use cases, an incorrect extraction is not a minor inconvenience — it is a liability.

This is why the pipeline has 10–12 steps with explicit validation and human review gates. The goal is not just to extract text. The goal is to produce data that a licensed A&P mechanic or aircraft owner can trust enough to rely on for regulatory compliance.

**The business moat is accuracy.** Any team can stand up a RAG system against logbook PDFs. Not every team can guarantee the data behind it has been validated at every stage of the pipeline.

### Live URL and Stack

| Item | Value |
|------|-------|
| Live URL | https://myaircraft-claude.vercel.app |
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Database | Supabase (Postgres + pgvector + Auth + RLS) |
| AI | OpenAI GPT-4o + text-embedding-3-small |
| Styling | TailwindCSS + Shadcn UI |
| Billing | Stripe |
| Hosting | Vercel |

---

## 2. The Real Document World

### What We Have Observed in Actual Logbooks

The Google Drive folder `AIRCRAFT LOGBOOK` contains 17 real aircraft organized by tail number: N262EE, N401LP, N562AF, N636SA, N714VH, N757VB, N2302Y, N4063G, N4918H, N5276M, N8202L, N20957, N67844, N69207, N80587, N89114, N92995.

Each aircraft folder contains these subfolders:

| Subfolder | What's In It |
|-----------|-------------|
| **Originals** | 15–25 numbered PDFs — the complete record set for that aircraft, scanned from physical books |
| **FAA Disc** | Airworthiness certificate, FAA data disc contents, Aircraft Registration (Form AC 8050-1) |
| **E-Signed Records** | Electronically signed maintenance entries (newer format) |
| **Newest entry sent** | The most recent logbook entries for that aircraft |
| **Updates** | Amendments, corrections, and additions made after original upload |

### Document Types Found in Real Logbooks

Based on actual observation of N262EE (a Cessna 172M, typical general aviation aircraft), these are the real document families encountered:

#### Logbook Family — Physical Maintenance Books

These are the orange, green, and brown physical logbooks with structured pages. Each page contains dated entries signed by A&P mechanics.

| Physical Book | Document Type ID | Content |
|---------------|------------------|---------|
| Airframe Log (Aircraft Maintenance Records — Airframe Log Book) | `airframe_log` | Airframe maintenance, annual inspections, repairs, modifications |
| Engine Log (Aircraft Maintenance Records — Engine Log Book) | `engine_log` | Engine TBO tracking, oil changes, compression checks, overhauls |
| Avionics Log (Aircraft Maintenance Records — Avionics Log Book) | `avionics_log` | Avionics installation, repair, upgrades |
| Propeller Log (Aircraft Technical Record — Propeller / Installations & Modifications Log) | `prop_log` | Prop time, overhauls, STC installations, modifications |
| FBO/Shop Logbook (e.g., Tetra Aeronautical Systems Logbook for N262EE) | `fbo_logbook` | Third-party maintenance organization entries |
| Current Maintenance Logbooks (binder with date range) | `airframe_log` | Continuation of airframe log, current period |

#### FAA/Regulatory Documents

These are structured government forms with defined fields.

| Document | Document Type ID | Key Fields |
|----------|------------------|------------|
| FAA Form 337 — Major Repair and Alteration | `form_337` | Work description, certification, STC reference, dates, A&P signature |
| Aircraft Registration (FAA Form AC 8050-1) | `registration` | N-number, make/model, serial number, owner name and address, issue date |
| Airworthiness Certificate | `airworthiness_cert` | Certificate class, aircraft make/model/serial, issue date, limitations |
| Airworthiness Directives (AD sheets) | `ad_sheet` | AD number, effective date, compliance method, compliance date, next due |

#### Manufacturer/Equipment Documentation

These are reference books and guides — not maintenance records per se, but part of the aircraft's permanent record.

| Document | Document Type ID | Notes |
|----------|------------------|-------|
| Cessna Pilot Safety and Warning Supplements | `reference_manual` | Safety warnings, operating limitations |
| Garmin GPS 175/GNX 375 Pilot's Guide | `avionics_manual` | Avionics reference — classify as reference manual, extract model/version |
| Garmin G5 EFI Pilot's Guide for Certified Aircraft | `avionics_manual` | Same — extract installed equipment metadata |
| Cessna Aircraft Log and Maintenance Records (factory-issued blank book) | `airframe_log` | Part of official airframe record |

#### Weight, Balance, and STC Records

| Document | Document Type ID | Key Fields |
|----------|------------------|------------|
| Weight and Balance / Equipment List | `weight_balance` | Empty weight, CG, useful load, equipment list, STC references |
| Supplemental Type Certificates (STCs) | `stc` | STC number, description, approved aircraft, approval date |

#### Miscellaneous Records

| Document | Document Type ID | Notes |
|----------|------------------|-------|
| Loose Documents and Booklets | `loose_docs` | Unclassified loose paperwork — route to review queue |
| Folders (miscellaneous paperwork) | `loose_docs` | Same treatment |
| 8130-3 FAA/EASA Authorized Release Certificate | `form_8130` | Parts and components release documents |
| Yellow tags, discrepancy cards | `discrepancy` | Squawk entries, write-ups from pilots |
| Work Orders (shop paperwork) | `work_order` | Labor, parts, sign-offs — route to work order system |

### What a Single Logbook Page Looks Like

A typical engine logbook entry page contains:
- **Date** of maintenance action (MM/DD/YYYY or written out)
- **Aircraft total time** at time of entry (e.g., "2,847.3 TTAF")
- **Tach time** or Hobbs time
- **Work performed** — free text, ranging from one sentence to multiple paragraphs
- **Parts installed** — part numbers, descriptions, serial numbers
- **References** — AD numbers, SB numbers, STC numbers, POH section references
- **Certifying mechanic name and certificate number** (A&P or IA certificate)
- **Signature** (handwritten)

The challenge: every A&P mechanic writes differently. Some use abbreviations ("1 QT OIL ADD"), some write full sentences. Some use printed entries, some use entirely handwritten script. Pages may be crammed or sparse. Cross-outs and ink corrections are common.

### The 40+ Classification Categories (AI Training Target)

The discussion references needing labels for approximately 40 categories across the full document population. Based on the real data, these break down as:

**Logbook Entry Categories (what the text on a given page represents):**
- Annual inspection entry
- 100-hour inspection entry
- Engine oil change
- Compression check
- Magneto inspection / timing
- Spark plug service
- Engine overhaul entry
- Engine replacement entry
- Airframe repair entry (structural)
- Airframe inspection entry
- Avionics installation entry
- Avionics repair entry
- Propeller overhaul entry
- Propeller replacement entry
- AD compliance entry
- SB (Service Bulletin) compliance entry
- STC installation entry
- Weight and balance amendment
- Return to service signature
- Discrepancy write-up (pilot squawk)
- Discrepancy clearance (mechanic sign-off)
- ELT inspection entry
- Transponder test/inspection entry
- Pitot-static test entry
- VOR check entry
- Altimeter calibration entry
- Fuel system inspection
- Landing gear inspection
- Brake service entry
- Battery replacement entry
- Instrument repair/replacement entry
- Major repair (requires Form 337)
- Major alteration (requires Form 337)
- Ferry permit documentation
- Aircraft purchase/sale notation
- Import/export documentation note
- Time-limited component change
- Factory overhaul tag reference
- 8130-3 certificate reference
- Yellow tag/discrepancy card attachment note

---

## 3. Complete Pipeline Architecture

### Overview: 12 Steps from Physical Page to Searchable Embedding

```
PHYSICAL DOCUMENT
       ↓
[STEP 1] CAPTURE (iPad/mobile scanner in-app)
       ↓
[STEP 2] QUALITY GATE (blur / skew / glare check)
       ↓
[STEP 3] STORAGE (originals saved to Supabase Storage — never lost)
       ↓
[STEP 4] PREPROCESSING (deskew, denoise, contrast normalization)
       ↓
[STEP 5] PAGE CLASSIFICATION (what kind of page is this?)
       ↓
[STEP 6] PRIMARY OCR / HTR (main text extraction engine)
       ↓
[STEP 7] SECONDARY OCR / HTR (independent second engine)
       ↓
[STEP 8] ARBITRATION (resolve conflicts between engines, VLM reasoning)
       ↓
[STEP 9] DETERMINISTIC VALIDATION (field-level rules for known doc types)
       ↓
[STEP 10] HUMAN REVIEW GATE (for flagged / uncertain / conflicting pages)
       ↓
[STEP 11] CANONICALIZATION (normalize to structured schema)
       ↓
[STEP 12] EMBEDDING + INDEXING (vector store + keyword index — final truth)
       ↓
RAG QUERY ENGINE (user Q&A on their aircraft records)
```

Raw scan output NEVER becomes canonical truth directly. The pipeline exists specifically to prevent bad data from entering the system.

---

### Step 1: Capture

**Where:** `/scanner/capture` route in the `(scanner)/` route group
**Who:** Scanner role user on iPad or mobile browser
**Technology:** Browser `getUserMedia()` — no app install needed, runs in Safari on iPad

**What happens:**
- Camera opens in browser
- Document framing overlay guides placement
- Auto-detection indicates when page is in frame
- User taps to capture
- Page stored as individual high-res image (JPEG or PNG)

**Two capture modes operate differently:**

**Batch Scanning Mode** (for large historical logbooks):
- Rapid-fire capture — tap, next page, tap, next page
- Classification happens at batch level, not page level
- No interruption between pages
- Hundreds of pages possible in one session
- Good for: digitizing an entire 30-year logbook in one sitting

**Evidence Capture Mode** (for individual work orders, tags, invoices):
- Single or small-group capture
- Immediately attached to specific record (work order ID, aircraft ID)
- Classification and metadata entry happens immediately
- Good for: capturing a yellow tag, a signed work order, a parts invoice

**What data is stored at capture time:**
```
scan_pages table:
- page_id (UUID)
- batch_id (FK → scan_batches)
- image_url (original, unprocessed)
- capture_timestamp
- sequence_number
- classification (from scanner's tap, or 'unknown')
- capture_device_info
- scanner_user_id
```

---

### Step 2: Quality Gate

**Where:** Runs in-browser before accepting each page
**Technology:** JavaScript image analysis — checks immediately after capture

**Checks performed:**

| Check | Threshold | Action if Failed |
|-------|-----------|-----------------|
| Blur score | < threshold | Show "Too blurry — retake?" warning |
| Skew angle | > 15 degrees | Show "Tilted — retake?" warning |
| Lighting / glare | Overexposed regions | Show "Glare detected — retake?" warning |
| Page coverage | < 70% of frame | Show "Move closer — retake?" warning |

**Rules:**
- Warning is shown, but scanner CAN still accept and continue (never blocks the scanning session)
- Poor-quality pages get flagged as `quality_flag = 'low_quality'` in the DB
- Low-quality pages automatically route to QC review queue after upload
- Three failed retakes → page marked `quality_flag = 'unreadable'` and queued for manual handling

**Critical principle:** Never block the scanning session. A scanner who cannot proceed will lose their place in a physical logbook. Accept everything, flag problems for later.

---

### Step 3: Storage (Originals Preservation)

**Where:** Supabase Storage
**Trigger:** After each page capture or batch submission

**Storage structure:**
```
supabase-storage/
└── aircraft-records/
    └── {organization_id}/
        └── {aircraft_id}/
            └── {batch_id}/
                ├── originals/
                │   ├── page_001_original.jpg
                │   ├── page_002_original.jpg
                │   └── ...
                ├── processed/
                │   ├── page_001_processed.jpg
                │   └── ...
                └── batch_{batch_id}.pdf   ← assembled at batch end
```

**Rules:**
- Original images are NEVER overwritten or deleted
- Processed images stored separately alongside originals
- Batch PDF assembled at batch submission time (Step 6 in scanner workflow)
- All images stored with metadata: scanner ID, timestamp, capture device, aircraft ID, batch ID
- Supabase RLS ensures org isolation — one org can never access another org's files

**Why this matters:** The original capture is the chain of custody. If the OCR gets it wrong, if the validator has a dispute, if an FAA auditor asks "show me the original" — that original image must be there, permanently, unaltered.

---

### Step 4: Preprocessing

**Where:** Server-side API route, triggered after batch submission
**Technology:** Image processing library (sharp, or Python PIL/OpenCV via edge function)

**Operations applied:**
1. **Deskew** — detect page rotation and correct to level
2. **Denoise** — reduce scanner noise and compression artifacts
3. **Contrast normalization** — improve readability for dark/faded ink
4. **Binarization** — convert to black/white for OCR optimization (preserves grayscale for VLM)
5. **Crop/border removal** — remove scanner bed edges and binder shadows
6. **Resolution normalization** — ensure consistent DPI for OCR engines (300 DPI standard)

**Output:** `processed` version of each page image stored alongside original
**Database update:** `scan_pages.preprocessing_status = 'complete'`

---

### Step 5: Page Classification

**Where:** Server-side, runs on preprocessed image
**Technology:** GPT-4 Vision (initial), with option to fine-tune a local model (Google Gemma 2B/27B) for scale

**Classification targets (the 13 base types currently in the system):**

| Type ID | Description | Typical Indicators |
|---------|-------------|-------------------|
| `engine_log` | Engine logbook page | "ENGINE LOG", hours/TBO references, magneto entries |
| `airframe_log` | Airframe logbook page | "AIRFRAME", annual inspection entries, structural work |
| `prop_log` | Propeller logbook page | "PROPELLER", prop overhaul, STC references |
| `avionics_log` | Avionics logbook page | "AVIONICS", avionics installation/repair entries |
| `work_order` | Shop work order | WO number, labor lines, parts lines, total charge |
| `logbook_entry` | Generic maintenance entry | Dated entry, mechanic signature, certification number |
| `discrepancy` | Squawk/discrepancy card | Pilot write-up, defect description |
| `yellow_tag` | Yellow tag / parts tag | Part number, serial number, maintenance record reference |
| `form_8130` | FAA/EASA 8130-3 certificate | "AUTHORIZED RELEASE CERTIFICATE", block structure |
| `form_337` | FAA Form 337 | "MAJOR REPAIR AND ALTERATION", official form header |
| `ad_sheet` | AD compliance record | AD number format (e.g., 2019-04-05), compliance dates |
| `reference_manual` | Technical manual / POH / guide | Manufacturer name, guide title, not a maintenance record |
| `unknown` | Cannot classify | Routes to human classification queue — never blocks |

**Confidence score** is returned with every classification. Pages below the confidence threshold are flagged for human review regardless of classification.

**On classification failure or low confidence:** Page gets `classification = 'unknown'`, routed to review queue. Scanning session is NOT blocked.

---

### Step 6: Primary OCR / HTR

**Where:** Godmode pipeline — `godmode_jobs` table
**Technology:** OpenAI Vision (GPT-4o with vision) — primary engine

**OCR vs HTR distinction:**
- **OCR (Optical Character Recognition):** Works well on printed/typed text. Standard approach.
- **HTR (Handwritten Text Recognition):** Required for handwritten logbook entries. Much harder. Current primary engine uses GPT-4o Vision which handles both.

**What the primary engine extracts:**
- Full page text (raw)
- Structured fields (dates, times, part numbers, cert numbers) where detectable
- Tables (if present)
- Signature block location (flagged, not transcribed)

**Output stored in:** `godmode_jobs` table, `primary_result` field (JSONB)

**Known limitations:**
- Faded ink or pencil entries may be missed
- Heavy abbreviation requires aviation-domain knowledge to interpret correctly
- Cursive handwriting from older entries (pre-1990) is harder for current models
- Two-column logbook layouts can confuse reading order

---

### Step 7: Secondary OCR / HTR

**Where:** Same godmode pipeline, independent pass
**Technology:** Different model/configuration from primary (ideally a different architecture entirely)

**Purpose:** Independent extraction against the same preprocessed image. The goal is NOT to get the same answer — it is to get an answer that can be compared to the primary result for arbitration.

**Current state:** Secondary engine is present in the architecture. Current implementation uses a different temperature/prompt configuration of GPT-4o Vision. Ideal future state is a different engine entirely (e.g., AWS Textract, Google Document AI, or a fine-tuned local model like Gemma 27B).

**Output stored in:** `arbitration_results` table, `secondary_result` field

---

### Step 8: Arbitration

**Where:** `/api/ocr/arbitrate`
**Technology:** Deterministic comparison + GPT-4o reasoning for conflict resolution

**Arbitration process:**

```
primary_result + secondary_result
              ↓
1. Token-level diff — identify where they agree and disagree
              ↓
2. For agreement regions → accept agreed text as candidate truth
              ↓
3. For disagreement regions → VLM reasoning pass:
   - Send original image + both extractions to GPT-4o
   - Ask: "Which extraction is more accurate for this region?"
   - GPT-4o reasons over visual evidence and returns winner
              ↓
4. Merge into arbitrated_result
              ↓
5. Assign confidence score to arbitrated result
              ↓
6. If confidence < threshold → route to human review
   If confidence >= threshold → proceed to validation
```

**Stored in:** `arbitration_results` table:
- `primary_result` (JSONB)
- `secondary_result` (JSONB)
- `arbitrated_result` (JSONB)
- `conflict_regions` (JSONB — locations where engines disagreed)
- `arbitration_confidence` (float)
- `status`: `pending | arbitrating | arbitrated | needs_review | approved`

---

### Step 9: Deterministic Validation

**Where:** Server-side validation layer, runs after arbitration
**Technology:** Rule-based TypeScript validators per document type

**What validation checks:**

For `engine_log` / `airframe_log` entries:
- Date is parseable and within plausible range (not future, not before aircraft build year)
- Aircraft total time (TTAF) is a number and is plausible (not regressing from prior entry)
- Hobbs/tach time, if present, is plausible
- If an A&P certificate number is present, it matches known format (e.g., 1234567)
- If an AD reference is present, it matches known AD number format

For `form_337`:
- Form number is present
- Aircraft N-number matches the aircraft it's being attached to
- Certifying authority is identified

For `ad_sheet`:
- AD number is present and parseable
- Compliance date is parseable
- Method of compliance is identified

For `registration` / `airworthiness_cert`:
- N-number matches
- Make/model is populated
- Issue date is present

**On validation failure:**
- Specific failing fields noted in `validation_issues` (JSONB)
- Page status set to `needs_review` with failure reason
- Routed to human QC queue with pre-populated issue flags

---

### Step 10: Human Review Gate

**Where:** `/documents/review` — QC reviewer UI
**Who:** Designated QC reviewer / auditor role
**Technology:** Review queue UI showing flagged pages with original image side-by-side

**Pages routed to review when:**
- Arbitration confidence below threshold
- Validation failed on one or more fields
- Classification was `unknown`
- Quality flag is `low_quality` or `unreadable`
- Any field marked as uncertain by the arbitration engine
- Manual flagging by any team member

**What the reviewer sees:**
- Original scanned image (full resolution)
- Extracted text from arbitration result
- Highlighted conflict regions (where engines disagreed)
- Validation failure messages with specific fields
- Current classification and confidence score

**What the reviewer can do:**
- Approve the extraction as-is
- Edit specific fields (click field to override)
- Reject the page (kicks back to re-scan request)
- Re-classify the page
- Mark page as "signature only" (no extractable data)
- Mark page as "blank" (filler page)
- Split page (if two records on one scan)
- Add a note for audit trail

**After review:** `review_status = 'approved'` → proceeds to Step 11. `review_status = 'rejected'` → scanner notified to rescan, batch paused.

---

### Step 11: Canonicalization

**Where:** `/api/ocr/canonicalize`
**Technology:** Schema-driven normalization function per document type

**What canonicalization does:**
- Normalizes dates to ISO 8601 (YYYY-MM-DD)
- Normalizes aircraft time formats (e.g., "2,847.3" → 2847.3 float)
- Normalizes part numbers (remove spaces, standardize format)
- Normalizes A&P certificate numbers
- Extracts structured fields into typed columns (not just raw text)
- Links extracted maintenance events to the `maintenance_events` table
- Links extracted AD compliance to the `faa_airworthiness_directives` and `aircraft_ad_applicability` tables
- Updates aircraft reminders if relevant intervals are detected (annual, 100hr, transponder, ELT)

**Canonical schema for a maintenance entry:**

```typescript
interface CanonicalMaintenanceEntry {
  aircraft_id: string;
  entry_date: string; // ISO date
  entry_type: string; // from classification
  aircraft_total_time?: number; // TTAF in decimal hours
  tach_time?: number;
  hobbs_time?: number;
  work_description: string; // full text
  work_summary?: string; // AI-generated one-sentence summary
  parts_used: PartReference[];
  ad_compliance?: ADComplianceReference[];
  sb_compliance?: SBReference[];
  stc_references?: STCReference[];
  certifying_mechanic_name?: string;
  certifying_mechanic_cert_number?: string;
  return_to_service: boolean;
  source_page_ids: string[]; // which pages this was extracted from
  raw_text: string; // original OCR output preserved
  confidence: number;
  review_status: 'auto_approved' | 'human_approved';
}
```

---

### Step 12: Embedding and Indexing

**Where:** Called only after Step 11 is complete and `review_status` is approved
**Technology:** OpenAI `text-embedding-3-small` → 1536-dim vectors stored in pgvector

**What gets embedded:**
- Each `document_chunk` (400–600 token sliding window with overlap)
- Chunk includes: raw text + metadata (page number, aircraft ID, entry date, document type)
- Metadata is stored in both the embedding record and the chunk record for filtering

**Two search indexes maintained:**

1. **Vector index** (`document_embeddings` table with pgvector) — semantic similarity search
2. **Keyword index** (standard Postgres full-text search on `document_chunks.content`) — exact term matching

Both are used in RAG retrieval, with results ranked and merged before generation.

**Embedding is the final step.** Nothing is embedded until it has passed arbitration + validation + (if needed) human review + canonicalization. This ordering is intentional and must be preserved for any new document type or OCR lane added to the system.

---

## 4. Scanner Operator Workflow

### Who is a Scanner?

A scanner is a person physically holding the iPad at the aircraft, going through physical logbooks page by page. They may be a junior office staff member, a line tech, or a dedicated digitization contractor. They are NOT a full system admin. They have no access to billing, settings, or any other aircraft's data.

**Scanner login** grants access only to:
- `/scanner/*` routes
- Their assigned organization's aircraft list
- Batch creation and page capture
- No access to `/dashboard`, `/settings`, `/admin`, `/maintenance`

---

### Scanner Step-by-Step Workflow

#### Step 1: Login

- Open myaircraft.us on iPad in Safari
- Enter scanner credentials (email/password — scanner role account)
- Automatically redirected to `/scanner/select`
- No access to any other part of the app — sidebar is absent

#### Step 2: Select Session Context

At `/scanner/select`, the scanner chooses:

1. **Organization / Customer** — which company or individual owns this aircraft
2. **Aircraft (Tail Number)** — e.g., N262EE
3. **Batch Type (Logbook Type)** — what family of documents are being scanned:
   - Airframe Log (historical)
   - Engine Log (historical)
   - Propeller Log (historical)
   - Avionics Log (historical)
   - Current Maintenance Records
   - FAA / Regulatory Documents
   - Weight & Balance / Equipment List
   - Loose Documents / Miscellaneous
   - Work Orders (evidence capture)
   - Single Entry / Evidence

4. **Scan Mode:**
   - Batch Scanning (historical — large book)
   - Evidence Capture (single document — attach to record)

System creates a `scan_batch` record and returns a `batch_id`. Session is now live.

#### Step 3: Capture Pages

At `/scanner/capture`:

- Camera activates full-screen
- Framing overlay shows ideal document position
- Quality indicators show in real-time:
  - Green frame = good to go
  - Yellow frame = minor issue (slight skew)
  - Red frame = problem (blurry, too dark, major skew)
- Scanner taps the capture button
- Page thumbnail appears briefly at bottom of screen
- Scanner immediately moves to next page

**Capture best practices (trained to scanner):**
- Hold the iPad 12–18 inches above the page
- Ensure full page is visible within the frame
- Wait for green frame indicator before tapping
- Do not flip pages while the capture button is highlighted
- For pages with stapled attachments (yellow tags, invoices) — capture the attachment as a separate page
- For two-page spreads — capture each page individually

**Quick page label** (optional during capture, not required):
- Swipe left on the just-captured thumbnail to label it
- Options: Engine, Airframe, Propeller, Avionics, AD, 337, Signature, Blank, Unknown
- If no label: defaults to batch-level type

#### Step 4: Review Batch (Optional Inline Review)

After completing a section of scanning, scanner can:
- Swipe to `/scanner/review` at any time
- View thumbnail grid of all captured pages in this batch
- Long-press a thumbnail to: Delete, Re-scan, Mark Unreadable, Re-label
- Reorder pages by drag-and-drop (if a page was captured out of sequence)
- Mark a page as "blank" to exclude from processing

**Note:** This is a fast quality control step — the scanner is not verifying extraction accuracy. They are only verifying that the physical capture was successful (right pages, right order, readable).

#### Step 5: Finish and Submit

At `/scanner/finish`:

- Scanner reviews the batch summary: total pages, batch type, aircraft, any flagged pages
- Taps **Submit Batch**
- System:
  1. Assembles all page images into a batch PDF
  2. Stores PDF to Supabase Storage
  3. Updates `scan_batches.status = 'submitted'`
  4. Queues the batch for backend processing (preprocessing → classification → OCR pipeline)
- Scanner sees a confirmation screen with batch ID
- Scanner is returned to `/scanner/select` to start the next batch

#### Step 6: Monitor Status (Optional)

At `/scanner/status/{batchId}`:
- Scanner can check live processing status
- Shows: pages processed, pages in review queue, estimated time remaining
- No action needed from scanner at this stage — QC team takes over

---

### Scanner Fallback Procedures

| Situation | Action |
|-----------|--------|
| Page is too damaged to scan cleanly | Scan it anyway, mark as "Low Quality", add note. The QC team will decide. |
| iPad runs out of battery mid-batch | Do not close Safari. Plug in and resume — batch is preserved in progress. |
| WiFi drops during upload | Batch stays locally in browser session. Upload resumes automatically when connection returns. (Offline queue — to be built with IndexedDB + service worker) |
| Backend processing fails | Batch stays stored safely with `status = 'failed'`. Admin is notified. Retry available. |
| Scanner accidentally deletes a page | Go to review screen → deleted pages are recoverable for 30 minutes (soft delete) |
| Physical logbook has pages that are stapled together | Carefully separate if possible, scan individually. If not possible, capture the spread and add note. |
| Book has water damage or fading | Scan anyway. OCR confidence will be low and it will go to review. |

---

## 5. QC and Auditor Workflow

### Who is a QC Reviewer / Auditor?

The QC reviewer is responsible for the quality gate between raw extraction and canonical truth. They have a mechanic-level understanding of aviation records or, at minimum, have been trained to recognize what correct logbook data looks like.

The **auditor role** is a read-only role for compliance personnel, insurance reviewers, or aircraft buyers doing due diligence. They can view everything but cannot modify.

---

### QC Reviewer Dashboard

**Route:** `/documents/review` or an admin-accessible review queue
**What they see:** A queue of pages that require human judgment, sorted by:
1. **Blocked** — pages flagged as unreadable that are holding up a batch
2. **Validation failed** — pages where field validators found issues
3. **Low confidence** — arbitration confidence below threshold
4. **Unknown classification** — needs a human to classify
5. **Low quality** — camera quality warning was triggered at capture

---

### QC Step-by-Step Workflow

#### Step 1: Open Review Queue

- Log in as reviewer/admin (not scanner role)
- Navigate to Documents → Review Queue
- See count of pages awaiting review, organized by aircraft and batch

#### Step 2: Open a Review Task

For each page in the queue:

**Left panel:** Original scanned image at full resolution, zoomable
**Right panel:** Extracted text with field highlights

- Green highlight = high-confidence extraction
- Yellow highlight = medium confidence, needs a look
- Red highlight = low confidence or validation failure
- Grey = not extracted (signature block, blank region)

Failure reason shown at top: "Validation failed: TTAF value (2847.3) is lower than previous entry (3102.1). Please verify."

#### Step 3: Take Action

| Action | When to Use |
|--------|-------------|
| **Approve** | Extraction looks correct. Proceeds to canonicalization. |
| **Edit field** | Extraction is mostly right but one field is wrong. Click field to override. |
| **Re-classify** | Page was classified as wrong type. Select correct type from dropdown. |
| **Mark as Signature Only** | Page contains only a mechanic's signature block — no extractable data entry. |
| **Mark as Blank** | Page is a blank filler page. Excluded from embedding. |
| **Split** | Two distinct maintenance entries were captured on one page. Split into two records. |
| **Request Rescan** | Image is genuinely unreadable. Sends notification to scanner to physically rescan. |
| **Add Note** | Leave an audit note attached to this page (visible to admin but not to end users). |

#### Step 4: Batch Approval

For pages that look correct and consistent, reviewer can do bulk approval on a batch: select all → Approve All. System will still individually validate before canonicalization.

#### Step 5: Sign-off and Audit Trail

Every QC decision is recorded in `audit_logs`:
- Who approved (user ID + name)
- What action was taken
- Timestamp
- Before state (raw arbitration result)
- After state (approved canonical data)

This audit trail is the compliance record that proves every piece of data in the system was validated by a human before being used.

---

### Auditor Read-Only Workflow

The auditor role can:
- View all documents for all aircraft in their organization
- View full audit trails for any document
- View extraction confidence scores
- View who approved what and when
- Export audit reports to PDF
- Cannot modify anything

Typical use case: An FAA auditor, aircraft insurance underwriter, or prospective aircraft buyer is given auditor credentials to review the records for a specific aircraft.

---

## 6. Developer Implementation Plan

### Current State Baseline (What's Already Live)

Approximately 85% of the target architecture is live:

- Scanner role and restricted login system ✅
- iPad-first scanner UI with all 6 screens ✅
- In-app camera capture via getUserMedia() ✅
- Batch and evidence capture modes ✅
- Page classification (13 types) ✅
- Supabase storage with org isolation ✅
- Godmode multi-engine OCR pipeline ✅
- Arbitration engine ✅
- Review queue ✅
- Canonicalization ✅
- Embedding (pgvector, 1536-dim) ✅
- RAG Q&A system ✅
- Work orders with Kanban ✅
- Parts ordering system ✅
- Aircraft management + FAA AD sync ✅
- Maintenance reminders ✅
- Google Drive integration ✅
- Stripe billing ✅
- 22 database migrations applied ✅

### Phase 1: Offline Queue (Critical Gap)

**Priority: HIGH** — Without this, a scanner who loses WiFi mid-batch loses their work.

**What to build:**
1. Service Worker registration in Next.js app
2. IndexedDB local buffer for captured page images and batch metadata
3. Background sync API to upload when connection resumes
4. Visual indicator showing "X pages queued offline — will upload when connected"
5. Conflict resolution if server batch was partially received

**Technical notes:**
- Use Workbox (Google's service worker library) with Next.js
- IndexedDB key: `{batch_id}_{page_sequence}` → image blob
- Sync trigger: `navigator.onLine` event + BackgroundSync API
- Maximum local storage: warn scanner at 80% browser storage quota
- Service worker must be in `/public/sw.js` for Next.js

**Database impact:** No new tables needed. `scan_batches.status = 'partially_uploaded'` new status value needed.

### Phase 2: ABBYY-Grade Mobile Capture SDK

**Priority: MEDIUM** — Current getUserMedia() capture works but has no auto-document detection.

**What to build:**
- Integrate ABBYY Mobile Web Capture SDK (or alternative: Scanbot SDK)
- SDK provides: automatic document edge detection, perspective correction, automatic capture trigger (no tap needed)
- Replace current manual capture UI with SDK capture view
- Keep all existing batch/submit logic — only replace the camera layer

**Technical notes:**
- ABBYY Mobile Web Capture is a JavaScript SDK, integrates into the browser capture screen
- License cost — evaluate vs. Scanbot SDK (similar capability, different pricing)
- Must still preserve original captured image (pre-SDK-processing) as the source of record
- SDK processing output (cropped, perspective-corrected) becomes the `processed` image

### Phase 3: Live FAA DRS API Integration

**Priority: MEDIUM** — Currently syncing ADs from a local dataset. Needs live connection.

**What to build:**
1. HTTP client for FAA DRS (Directives Research System) REST API
2. Scheduled job to pull new/amended ADs daily
3. Aircraft-specific AD applicability determination (by make/model/serial/engine type)
4. Alert system when a new AD affects an aircraft in the system

**Technical notes:**
- FAA DRS API: `https://drs.faa.gov/drsdocdata/` (public, no auth required)
- Pull by aircraft make/model — filter to active ADs
- Compare against `aircraft_ad_applicability` table, flag new matches
- Trigger reminders if new AD has compliance deadline

### Phase 4: Fine-Tuned Local Classification Model

**Priority: MEDIUM-LOW** — Current GPT-4o Vision classification works well but has per-call cost at scale.

**What to build:**
1. Training data pipeline: export labeled pages from review queue (human-approved classifications as ground truth)
2. Fine-tune Google Gemma 27B (or similar) on aviation page classification task
3. Host model via self-managed inference (e.g., Ollama on a GPU instance, or Google Vertex AI)
4. Route classification step through local model, fall back to GPT-4o Vision on low confidence

**Technical notes:**
- Minimum training set: 500 pages per category, 40 categories = 20,000 labeled pages
- Use the human-approved pages from `review_queue` as labeled training data
- Classification is a single-label multi-class problem (simpler than extraction)
- Evaluate accuracy before switching — local model must achieve >90% accuracy on held-out set
- This is the research task referenced in the team discussion

### Phase 5: Adobe PDF Services as Secondary OCR Lane

**Priority: LOW** — Enhances extraction quality for structured PDFs, not handwritten logbooks.

**What to build:**
1. Adobe PDF Services API integration for the secondary OCR lane (Step 7)
2. Route digital/typed PDFs through Adobe Extract API for structured table/text extraction
3. Route handwritten pages through existing GPT-4o Vision lane only
4. Classification step determines which lane to use

**Technical notes:**
- Adobe PDF Services has good structured extraction for typed documents (Form 337s, registration docs, manuals)
- NOT useful for handwritten logbook entries — GPT-4o Vision is better for those
- Decision tree: if `page_classification = 'reference_manual' | 'form_337' | 'registration' | 'form_8130'` → Adobe lane; otherwise → Vision lane

### Phase 6: 337 and 8130 Structured Extraction

**Priority: MEDIUM** — These forms have defined fields and deserve specific extractors.

**What to build:**
1. Form 337 extraction schema with specific field validators
2. 8130-3 extraction schema with specific field validators
3. Link Form 337 STCs to `supplemental_type_cert` records
4. Link 8130-3 to parts catalog and work orders

**Specific fields for Form 337:**
- Registration mark (N-number)
- Aircraft make, model, serial
- Owner name and address
- Type of work (repair vs. alteration)
- Description of work performed
- Parts/materials used
- DER/DAR approval number (if applicable)
- A&P or IA signature and cert number
- Return to service date

---

## 7. Database Architecture

### Core Principle: Everything is Org-Scoped

Every table that contains operational data has an `organization_id` column. Row-Level Security (RLS) is applied to every such table using these PostgreSQL functions:

```sql
-- Returns array of org IDs the current user is a member of
get_my_org_ids() → uuid[]

-- Checks if current user has a specific role in a specific org
has_org_role(org_id uuid, role text) → boolean
```

A user who is a member of Org A cannot see any data from Org B. This is enforced at the database level, not just the API level.

### User Roles (Least to Most Privileged)

| Role | Access |
|------|--------|
| `scanner` | Scanner routes only. Cannot access billing, admin, settings, or dashboard. |
| `viewer` | Read-only access to aircraft data and documents for their org. |
| `auditor` | Read-only access with full audit trail visibility. Can export. |
| `mechanic` | Can create and edit maintenance entries, work orders, and documents. |
| `admin` | Full access to org data. Can manage users and settings. |
| `owner` | Full access including billing. Can delete the organization. |

The `scanner` role is especially important — it is a completely separate auth session. A scanner user cannot navigate to any admin routes. The `(scanner)/` route group enforces this with middleware that checks for scanner-only status.

### Key Tables

#### Organizations and Users (migrations 002)
```sql
organizations (id, name, subscription_tier, stripe_customer_id, created_at)
user_profiles (id, email, full_name, avatar_url)
organization_memberships (org_id, user_id, role, created_at)
```

#### Aircraft (migration 003)
```sql
aircraft (
  id, organization_id, tail_number, make, model, year,
  serial_number, engine_make, engine_model, engine_serial,
  total_time_at_registration, faa_registry_data JSONB,
  created_at, updated_at
)
```

#### Documents (migration 004)
```sql
documents (
  id, organization_id, aircraft_id, document_type,
  title, description, source_filename,
  storage_path, parsing_status,
  -- parsing_status: queued | parsing | chunking | embedding | completed | failed
  upload_method, -- manual | gdrive | scanner
  metadata JSONB,
  created_at, updated_at
)
```

#### Scanner Pipeline (migrations 014, 019)
```sql
scan_batches (
  id, organization_id, aircraft_id, scanner_user_id,
  batch_type, capture_mode, -- batch_scan | evidence_capture
  status, -- created | scanning | submitted | processing | completed | failed
  total_pages, processed_pages, failed_pages,
  pdf_storage_path, created_at, submitted_at
)

scan_pages (
  id, batch_id, sequence_number,
  original_image_url, processed_image_url,
  classification, classification_confidence,
  quality_flag, -- ok | low_quality | unreadable
  preprocessing_status, ocr_status,
  created_at
)
```

#### Godmode Pipeline (migration 018)
```sql
godmode_jobs (
  id, scan_page_id, organization_id,
  status, -- queued | preprocessing | classifying | ocr_primary | ocr_secondary | arbitrating | validating | reviewing | canonicalizing | embedding | completed | failed
  started_at, completed_at, error_message
)

arbitration_results (
  id, job_id, scan_page_id,
  primary_result JSONB,
  secondary_result JSONB,
  arbitrated_result JSONB,
  conflict_regions JSONB,
  arbitration_confidence float,
  validation_issues JSONB,
  status -- pending | arbitrating | arbitrated | needs_review | approved
)

review_queue (
  id, job_id, scan_page_id, reviewer_user_id,
  reason, -- low_confidence | validation_failed | unknown_classification | low_quality | manual_flag
  status, -- pending | in_review | approved | rejected | rescan_requested
  reviewer_notes, reviewed_at
)
```

#### Maintenance Events (migration 008)
```sql
maintenance_events (
  id, organization_id, aircraft_id,
  event_type, entry_date,
  aircraft_total_time, tach_time,
  work_description, work_summary,
  parts_used JSONB,
  ad_compliance JSONB,
  certifying_mechanic_name, certifying_mechanic_cert,
  return_to_service bool,
  source_document_id, source_page_ids JSONB,
  confidence float,
  review_status, -- auto_approved | human_approved
  created_at
)
```

---

## 8. API Routes Reference

### Scanner Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/scanner/batches` | List batches / create new batch |
| GET | `/api/scanner/batches/[id]` | Batch details and progress |
| POST | `/api/scanner/batches/[id]/submit` | Submit batch → triggers pipeline |
| GET/POST | `/api/scanner/batches/[id]/pages` | List pages / add page to batch |
| GET/PATCH | `/api/scanner/batches/[id]/pages/[pageId]` | Get or update individual page |
| GET | `/api/scanner/aircraft` | Aircraft list for scanner (restricted) |

### OCR / Godmode Routes

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/ocr/arbitrate` | Run arbitration on a job |
| GET/POST | `/api/ocr/review` | List/update review queue items |
| POST | `/api/ocr/canonicalize` | Canonicalize approved extraction |

### Document Routes

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/upload` | Upload document directly |
| GET/POST | `/api/gdrive/auth` | Start Google Drive OAuth |
| GET | `/api/gdrive/callback` | OAuth callback |
| GET | `/api/gdrive/files` | Browse Drive files |

### Query / RAG Routes

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/query` | Main RAG endpoint |
| POST | `/api/ask` | UI wrapper for query |

### Aircraft Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/aircraft` | List / create aircraft |
| GET/PATCH/DELETE | `/api/aircraft/[id]` | Aircraft detail |
| GET | `/api/aircraft/[id]/ads` | AD compliance for aircraft |
| POST | `/api/aircraft/[id]/sync-ads` | Sync ADs from FAA |

### Work Order Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/work-orders` | List / create work orders |
| GET/PATCH/DELETE | `/api/work-orders/[id]` | Work order detail |
| GET/POST/PATCH/DELETE | `/api/work-orders/[id]/lines` | Line items |

### Billing Routes

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/billing/checkout` | Create Stripe checkout session |
| POST | `/api/billing/portal` | Open Stripe customer portal |
| POST | `/api/webhooks/stripe` | Stripe webhook handler |

---

## 9. What's Built vs What's Not

### Built and Live (~85%)

| Feature | Status | Notes |
|---------|--------|-------|
| Scanner role + restricted login | ✅ Live | Migration 019 |
| iPad-first scanner UI (all 6 screens) | ✅ Live | `(scanner)/` route group |
| In-app camera capture | ✅ Live | getUserMedia() |
| Batch + evidence capture modes | ✅ Live | |
| Page classification (13 types) | ✅ Live | |
| Supabase storage with org isolation | ✅ Live | |
| Preprocessing pipeline | ✅ Live | |
| Multi-engine OCR arbitration | ✅ Live | Godmode pipeline |
| Review queue UI | ✅ Live | `/documents/review` |
| Canonicalization | ✅ Live | `/api/ocr/canonicalize` |
| pgvector embeddings + RAG | ✅ Live | 1536-dim, text-embedding-3-small |
| Work orders (full CRUD + Kanban) | ✅ Live | |
| Parts ordering system | ✅ Live | |
| Aircraft management + FAA AD sync | ✅ Live | Local dataset |
| Maintenance reminders | ✅ Live | |
| Google Drive integration | ✅ Live | OAuth2 |
| Stripe billing | ✅ Live | |
| Live flight tracking | ✅ Live | ADS-B adapters |
| AI maintenance entry generator | ✅ Live | GPT-4o |
| 7 FBO integrations | ✅ Live | Connection layer |

### Not Yet Built (~15%)

| Feature | Priority | Phase |
|---------|----------|-------|
| Offline queue (IndexedDB + service worker) | HIGH | Phase 1 |
| ABBYY/Scanbot mobile capture SDK | MEDIUM | Phase 2 |
| Live FAA DRS API integration | MEDIUM | Phase 3 |
| Local classification model (Gemma fine-tune) | MEDIUM-LOW | Phase 4 |
| Adobe PDF Services as OCR lane | LOW | Phase 5 |
| Form 337 structured extraction | MEDIUM | Phase 6 |
| 8130-3 structured extraction | MEDIUM | Phase 6 |

---

## 10. Environment Setup

### Required Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# OpenAI
OPENAI_API_KEY=sk-...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Google Drive OAuth
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...

# App
NEXT_PUBLIC_APP_URL=https://myaircraft-claude.vercel.app

# Optional: FAA DRS API (Phase 3)
FAA_DRS_API_BASE=https://drs.faa.gov/drsdocdata

# Optional: ABBYY SDK (Phase 2)
ABBYY_LICENSE_KEY=...

# Optional: Adobe PDF Services (Phase 5)
ADOBE_CLIENT_ID=...
ADOBE_CLIENT_SECRET=...
```

### Running Supabase Migrations

```bash
# All 22 migrations must be applied in order
supabase db push

# Verify migrations applied
supabase migration list

# Apply specific migration
supabase migration up --version 022
```

### Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start Supabase local (for local dev with real DB)
supabase start

# Run type checking
npm run type-check

# Run linting
npm run lint
```

---

## Appendix A: Document Classification Schema

### Complete Classification Reference (13 Base Types + Subtypes)

| Type ID | Display Name | Physical Description | Page-Level Indicators |
|---------|--------------|---------------------|----------------------|
| `engine_log` | Engine Log | Orange/red physical book — "Aircraft Maintenance Records — Engine Log Book" | "ENGINE", tach time, oil references, TBO |
| `airframe_log` | Airframe Log | Various colored books — "Aircraft Maintenance Records" | "AIRFRAME", annual dates, structural references |
| `prop_log` | Propeller Log | Green physical book — "Aircraft Technical Record — Propeller" | "PROPELLER", prop time, overhaul dates |
| `avionics_log` | Avionics Log | Yellow physical book — "Aircraft Maintenance Records — Avionics Log Book" | "AVIONICS", equipment model numbers |
| `fbo_logbook` | FBO/Shop Logbook | Custom-printed logbook from maintenance org | FBO name on cover, shop work order references |
| `work_order` | Work Order | Printed shop form | WO number, labor/parts table, dollar amounts |
| `logbook_entry` | Logbook Entry | Single page from any logbook | Date, TTAF, description, mechanic cert, signature |
| `discrepancy` | Discrepancy Card | Yellow or white card | "SQUAWK", pilot name, defect description |
| `yellow_tag` | Yellow Tag | Physical yellow paper tag | Part number, serial, 8130 reference, red X or OK stamp |
| `form_8130` | FAA Form 8130-3 | Standardized two-column form | "AUTHORIZED RELEASE CERTIFICATE", CAGE code, blocks 1–21 |
| `form_337` | FAA Form 337 | Standardized multi-page form | "MAJOR REPAIR AND ALTERATION", title is standardized |
| `ad_sheet` | AD Compliance Sheet | Various formats | AD number pattern: YYYY-NN-NN, "AIRWORTHINESS DIRECTIVE" |
| `registration` | Aircraft Registration | FAA Form AC 8050-1 | "AIRCRAFT REGISTRATION APPLICATION", Department of Transportation header |
| `airworthiness_cert` | Airworthiness Certificate | FAA certificate | "AIRWORTHINESS CERTIFICATE", certificate class field |
| `weight_balance` | Weight and Balance | Shop-produced document | "WEIGHT AND BALANCE", empty weight, CG values |
| `stc` | STC Certificate | FAA-issued certificate | "SUPPLEMENTAL TYPE CERTIFICATE", SA/STC number |
| `reference_manual` | Reference Manual | Manufacturer publication | "PILOT'S GUIDE", "PILOT'S OPERATING HANDBOOK", "MAINTENANCE MANUAL" |
| `avionics_manual` | Avionics Manual | Garmin, Bendix, etc. | Brand name on cover, equipment model, "PILOT'S GUIDE" |
| `loose_docs` | Loose Documents | Misc paperwork | Cannot be classified — route to review queue |
| `unknown` | Unknown | Any unclassifiable page | Always routes to human review |

---

## Appendix B: Field Extraction Schemas

### Engine Log Entry

```typescript
{
  entry_date: string;           // ISO date — REQUIRED
  aircraft_total_time?: number; // TTAF in decimal hours
  tach_time?: number;
  engine_time?: number;         // SMOH (Since Major Overhaul)
  work_description: string;     // full text — REQUIRED
  maintenance_type: string;     // oil_change | compression | annual | 100hr | magneto | repair | overhaul | ad_compliance | sb_compliance | other
  oil_quarts_added?: number;
  oil_type?: string;
  compression_readings?: number[]; // e.g., [78/80, 76/80, 77/80, 74/80, 79/80, 77/80]
  parts_used: { part_number: string; description: string; quantity: number; }[];
  ad_references: { ad_number: string; compliance_method: string; next_due?: string; }[];
  certifying_mechanic_name?: string;
  certifying_mechanic_cert?: string;  // A&P cert number
  return_to_service: boolean;
}
```

### Form 337

```typescript
{
  registration_mark: string;   // N-number — REQUIRED
  aircraft_make: string;
  aircraft_model: string;
  aircraft_serial: string;
  aircraft_year?: string;
  owner_name: string;
  owner_address: string;
  work_type: 'repair' | 'alteration' | 'both';
  work_description: string;
  parts_materials: string;
  conformity_statement: string;
  approval_number?: string;   // DER/DAR number if applicable
  mechanic_name: string;
  mechanic_cert_number: string;
  mechanic_cert_type: 'AP' | 'IA' | 'DER' | 'DAR' | 'CRS';
  return_to_service_date: string;
  stc_reference?: string;
}
```

### AD Compliance Entry

```typescript
{
  ad_number: string;          // format: YYYY-NN-NN — REQUIRED
  ad_title?: string;
  compliance_date: string;    // ISO date — REQUIRED
  compliance_method: string;  // what was done
  next_due_date?: string;
  next_due_hours?: number;
  next_due_cycles?: number;
  parts_replaced?: { part_number: string; serial_number?: string; }[];
  certifying_mechanic_name?: string;
  certifying_mechanic_cert?: string;
}
```

### Aircraft Registration

```typescript
{
  registration_mark: string;  // N-number — REQUIRED
  aircraft_make: string;      // e.g., Cessna — REQUIRED
  aircraft_model: string;     // e.g., 172M — REQUIRED
  aircraft_serial: string;    // e.g., 172-61621 — REQUIRED
  engine_make?: string;
  engine_model?: string;
  aircraft_year?: string;
  registrant_name: string;
  registrant_address: string;
  registrant_city: string;
  registrant_state: string;
  registrant_zip: string;
  registration_type: 'individual' | 'partnership' | 'corporation' | 'co-owner' | 'government' | 'other';
  issue_date: string;         // ISO date
  expiration_date?: string;
}
```

---

## Appendix C: Claude Code Agent Instructions

These instructions are for Claude Code when working on this codebase.

### Core Rules That Must Never Be Violated

1. **Every table with operational data must include `organization_id`** and must have RLS policies. Never add a feature that stores user data without org scoping.

2. **Never query Supabase without organization filter** in API routes. Always verify membership with `has_org_role()` or equivalent before returning data.

3. **The scanner role is completely isolated.** Scanner users cannot reach `/dashboard`, `/settings`, `/admin`, or any other non-scanner route. The `(scanner)/` route group middleware enforces this. Never add a shortcut that bypasses it.

4. **The embedding step is always last.** Data flows: capture → preprocess → classify → OCR → arbitrate → validate → (review if needed) → canonicalize → embed. Never embed data that hasn't been through the full pipeline.

5. **Originals are never overwritten or deleted.** The `originals/` path in Supabase Storage is write-once. Processed images go to `processed/`. Never modify the original.

6. **Never block the scanner.** Quality warnings are warnings — the scanner can always proceed. Only a human QC reviewer can reject a page after the fact.

### Key Files to Know

```
lib/rag/retrieval.ts          — vector + keyword search, top-K chunk ranking
lib/rag/generation.ts         — GPT-4o answer generation with citations
lib/openai/embeddings.ts      — embedding generation wrapper
lib/supabase/server.ts        — server-side Supabase client (with service role)
lib/supabase/browser.ts       — browser-side Supabase client (anon key)
supabase/migrations/          — 22 migration files — DO NOT reorder or modify existing
app/(scanner)/                — all scanner routes — scanner role only
app/(app)/                    — all main app routes — authenticated users
app/api/                      — all API routes
components/maintenance/       — KanbanBoard, WorkOrderDetail
components/ask/               — answer-block, citations, confidence badge
```

### Adding a New Document Type

When adding support for a new document type:

1. Add the type ID to the `document_type` enum in the database (new migration)
2. Add the type to the classification reference in Step 5 of the pipeline
3. Create an extraction schema in the `/lib/extractors/` directory
4. Create field validators in the `/lib/validators/` directory
5. Update the canonicalization function to handle the new type
6. Update the review queue UI to show type-specific field highlights
7. Add any new maintenance events or reminder triggers that this type generates
8. Update the document type filter UI in `/documents`

### Common Gotchas

- **pgvector similarity search** returns cosine similarity (0–1), higher is better. The retrieval function normalizes and ranks before returning to generation.
- **Supabase RLS** — if you're getting empty results that should have data, check RLS. Use `supabase.auth.getUser()` and verify the returned org ID matches.
- **Scanner session** — the scanner has a different auth session than regular users. Test scanner flows with a dedicated scanner test account, not an admin account.
- **Batch PDF assembly** — happens server-side at batch submission time. The PDF is assembled from the individual page images in sequence order. Pages marked `blank` are excluded.
- **Confidence thresholds** — currently hardcoded. They should be moved to organization-level settings so orgs can tune their own QC thresholds.

---

*Document compiled April 2026 based on: developer briefing (current system state), team discussion transcript, GPT architecture recommendations, and direct review of real aircraft logbook documents in Google Drive (17 aircraft, N262EE folder examined in depth).*
