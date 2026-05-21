---
sop_id: "SOP-11"
title: "ATA / JASC Code Reference System"
module: "taxonomy"
version: "1.0.0"
status: "active"
last_updated: "2026-05-21"
faa_refs: ["14 CFR 43.9", "14 CFR 43.11", "AC 43-204"]
source_file: "mark downs/manuals/ata:jasc code/"
---

# myaircraft.us ATA / JASC Maintenance Taxonomy — SOP and Product Specification

**Audience:** product, engineering, QA, the maintenance taxonomy team, Codex/Claude Code agents.
**Purpose:** the authoritative reference for how myaircraft.us classifies maintenance work — and the contract every operational module (work orders, estimates, parts, logbook, squawks, reports) must honor when assigning a maintenance category to a record.

---

## 1. Executive Summary

Aircraft maintenance documentation requires consistent classification so a future mechanic, inspector, owner, or auditor can find any historical work by the **system** it affected — not by who happened to type the description that day.

The aviation industry uses two overlapping taxonomies:

- **ATA (Air Transport Association) iSpec 2200 chapters** — 100 numbered slots (00–99) covering every aircraft system from "Standard Practices/Airframe" (Ch 20) to "Lights" (Ch 33) to "Equipment/Furnishings" (Ch 25). ATA is the **system-level** classification used universally on transport-category aircraft and increasingly on GA.
- **JASC (Joint Aircraft System/Component) codes** — the FAA's four-digit codes that subdivide ATA chapters into specific systems and components. JASC 3240 = "Wheels and Brakes" lives under ATA Chapter 32 (Landing Gear). The FAA maintains the canonical JASC table for use in the Service Difficulty Reporting System (SDRS) and AD/SB indexing.

myaircraft.us uses BOTH. Every maintenance record (work order, squawk, logbook entry, estimate line item) may be tagged with one ATA chapter (mandatory for releaseable work) and zero or more JASC codes (for component-level precision). The taxonomy drives:

- **Finding past work** — "show me every landing-gear repair on this airframe"
- **AD/SB matching** — Airworthiness Directives reference ATA chapters, so the system can suggest applicable ADs based on the work classification
- **Parts coupling** — a JASC code links a Work Order to the inventory bin for that system
- **Reporting and analytics** — annual hours per ATA chapter, cost per JASC code, mean time between failures by system
- **Compliance** — 14 CFR Part 43 record retention and clarity requirements are easier to satisfy when records are systematically classified

**Why this is a backend taxonomy, not a dropdown:** treating ATA/JASC as a free-text field would give us "engine work" on one record and "powerplant maintenance" on another — both correct, both useless for analytics. Treating it as a curated reference table with stable codes and applicability metadata makes the system work for owners (clear history), shops (consistent invoicing), regulators (FAA-aligned recordkeeping), and AI (the RAG layer can ground retrieval in canonical categories).

---

## 2. Data sources and provenance

| Source | Document | Used for |
|---|---|---|
| FAA Joint Aircraft System/Component Code Table | `JASC_Code.pdf` (last updated 2008-10-27) | Authoritative JASC code list, definitions |
| ATA iSpec 2200 chapter scheme | Industry standard | Chapter numbering and titles |
| Internal aircraft-applicability heuristics | `jasc_codes_full.csv` (547 rows) | Default visibility flags by airframe class |

The FAA JASC PDF is the legal canonical source — myaircraft.us mirrors it as a system-of-record reference table. We never alter the FAA-sourced codes or definitions; per-aircraft overrides live in a separate `aircraft_jasc_override` table.

ATA iSpec 2200 is proprietary to A4A; myaircraft.us uses chapter numbers and titles as functional reference only. Where the iSpec 2200 detail breakouts are needed, we link out to A4A or rely on per-manufacturer maintenance manuals.

**Source ledger** (stored in `taxonomy_source` table):

| Field | Example | Notes |
|---|---|---|
| `source_name` | `FAA_JASC_2008` | The canonical source identifier |
| `source_url` | `https://sdrs.faa.gov/documents/JASC_Code.pdf` | Where the data came from |
| `source_last_updated` | `2008-10-27` | The source document's date — NOT our import date |
| `imported_at` | `2026-05-14T00:00:00Z` | When this row landed in our DB |
| `imported_by` | `system-import-v1` | The script or operator |
| `notes` | … | Anything an auditor needs to know |

Every JASC row carries its source identifier so an investigator can trace any classification back to the FAA original.

---

## 3. Terminology

The product MUST use these terms consistently. Engineers and copy reviewers MUST NOT invent synonyms.

| Term | Definition |
|---|---|
| **ATA chapter** | A two-character system-level code (00–99) from the ATA iSpec 2200 scheme. Display as `ATA NN`. |
| **JASC code** | A four-digit FAA code identifying a specific system/component. Display as `JASC NNNN`. |
| **Taxonomy** | The combined ATA + JASC reference layer. |
| **Applicability** | Whether a code is relevant for a given aircraft class (single-engine piston, multi-engine piston, turboprop, business jet, transport jet, rotorcraft). |
| **Classification** | The act of assigning an ATA chapter and/or JASC code to a maintenance record. |
| **Confirmed classification** | A classification reviewed and accepted by a human (mechanic / lead / IA / admin). |
| **Suggested classification** | An AI- or rule-derived classification awaiting human confirmation. |

User-facing screens MUST display the human-readable title alongside the code:

| Wrong | Right |
|---|---|
| `JASC 3240` | `Wheels and Brakes (ATA 32 · JASC 3240)` |
| `Engine` | `Powerplant — General (ATA 71)` |
| `Avionics` | `Communications and Navigation (ATA 23)` |

---

## 4. Database schema

The taxonomy lives in three core tables plus one cross-reference per operational module.

### 4.1 `ata_chapters`

```sql
CREATE TABLE ata_chapters (
  ata_chapter        CHAR(2) PRIMARY KEY,            -- '00' .. '99'
  ata_title          TEXT NOT NULL,                  -- 'Landing Gear'
  description        TEXT,
  status             TEXT NOT NULL                   -- active | reserved | special_use | unknown
                       DEFAULT 'active',
  jasc_code_count    INTEGER NOT NULL DEFAULT 0,     -- denormalised count of JASC rows
  faa_jasc_has_codes BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE if FAA JASC populates this chapter
  source             TEXT NOT NULL,
  source_url         TEXT,
  source_version     TEXT,
  source_last_updated DATE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Why all 100 slots:** even if the FAA has zero JASC codes for ATA chapter 60, we store the slot so the UI can render a complete chapter picker without gaps. Slots with no JASC codes have `jasc_code_count=0` and `faa_jasc_has_codes=false`.

### 4.2 `jasc_codes`

```sql
CREATE TABLE jasc_codes (
  jasc_code            CHAR(4) PRIMARY KEY,                     -- '3240'
  title                TEXT NOT NULL,                           -- 'Wheels and Brakes'
  ata_chapter          CHAR(2) NOT NULL
                         REFERENCES ata_chapters(ata_chapter),
  ata_chapter_title    TEXT NOT NULL,                           -- denorm for display
  definition           TEXT,
  system_level         BOOLEAN NOT NULL DEFAULT FALSE,          -- broad system vs. specific component
  wiring_code          BOOLEAN NOT NULL DEFAULT FALSE,          -- electrical/wiring sub-class

  -- Applicability heuristics (default UI filtering; per-aircraft overrides win)
  single_engine_piston       BOOLEAN NOT NULL DEFAULT FALSE,
  multi_engine_piston        BOOLEAN NOT NULL DEFAULT FALSE,
  turboprop                  BOOLEAN NOT NULL DEFAULT FALSE,
  business_jet_transport_jet BOOLEAN NOT NULL DEFAULT FALSE,
  rotorcraft                 BOOLEAN NOT NULL DEFAULT FALSE,

  notes                TEXT,
  source               TEXT NOT NULL,                           -- 'FAA_JASC_2008'
  source_last_updated  DATE NOT NULL,
  source_url           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_jasc_codes_ata_chapter ON jasc_codes(ata_chapter);
CREATE INDEX idx_jasc_codes_title       ON jasc_codes(title);
CREATE INDEX idx_jasc_codes_search      ON jasc_codes USING GIN (to_tsvector('english', title || ' ' || COALESCE(definition, '')));
```

**Why the applicability flags:** a single-engine piston Cessna 172 owner browsing JASC codes should not see business-jet-only entries by default. The flags are UI filtering defaults only; mechanics can override per-aircraft (see §4.4).

### 4.3 `aircraft_jasc_override`

```sql
CREATE TABLE aircraft_jasc_override (
  aircraft_id      UUID NOT NULL REFERENCES aircraft(id),
  jasc_code        CHAR(4) NOT NULL REFERENCES jasc_codes(jasc_code),
  enabled          BOOLEAN NOT NULL DEFAULT TRUE,    -- TRUE = visible; FALSE = hide from this airframe
  reason           TEXT,                              -- 'STC installed' / 'Per Type Cert' / ...
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (aircraft_id, jasc_code)
);
```

**Examples:**
- A Cessna 172 with an STC for a turboprop conversion → enable `single_engine_piston=false` but explicitly enable JASC codes under ATA 76 (Engine Controls — Turboprop).
- A retired aircraft used solely for parts — disable all engine codes since no engine work will be logged.

### 4.4 `work_order_jasc_reference` (and module twins)

Every operational module that classifies work has a cross-reference table:

```sql
CREATE TABLE work_order_jasc_reference (
  work_order_id          UUID NOT NULL REFERENCES work_orders(id),
  jasc_code              CHAR(4) NOT NULL REFERENCES jasc_codes(jasc_code),
  ata_chapter            CHAR(2) NOT NULL REFERENCES ata_chapters(ata_chapter),
  classifier_confidence  NUMERIC(5,4),                 -- 0.0..1.0; NULL if human-only
  classifier_source      TEXT,                          -- 'human' | 'llm-v1' | 'rule' | 'auto-import'
  human_verified         BOOLEAN NOT NULL DEFAULT FALSE,
  human_verified_by      UUID,
  human_verified_at      TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (work_order_id, jasc_code)
);
```

Identical-shape tables exist for `squawk_jasc_reference`, `estimate_line_jasc_reference`, `logbook_entry_jasc_reference`. A single record can carry multiple JASC codes — e.g. an annual inspection touches ATA 05 (Time Limits) plus ATA 32 (Landing Gear) plus ATA 71 (Powerplant).

---

## 5. Classification workflow

### 5.1 Sources of classification

Every record can be classified by any of three sources, with humans always able to override:

| Source | When it fires | Confidence | Human verification required |
|---|---|---|---|
| **Auto-import** | Migrated legacy data | 1.0 (if explicit in source) / NULL (if missing) | Yes if NULL |
| **Rule-based** | Predefined keyword → ATA mapping (e.g. "magneto" → ATA 74) | 0.85 | Yes |
| **LLM classifier** | GPT-4o reads description and suggests ATA + JASC | 0.0–1.0 (model-reported) | Yes if confidence < 0.85 |
| **Human** | Mechanic picks from the UI | 1.0 | Already verified |

The LLM classifier is gated behind a feature flag (`TAXONOMY_LLM_CLASSIFIER=true`) and runs only when explicitly invoked from the UI ("Suggest classification" button on the work order / squawk form) or as a nightly batch over unclassified records.

### 5.2 Confirmation states

A record's classification has one of these states (stored on the cross-reference row):

- `suggested` — `classifier_source != 'human'`, `human_verified=false`
- `confirmed` — `human_verified=true` (a human accepted or originated the classification)
- `disputed` — a human flagged the classification as wrong but hasn't picked a replacement (rare; usually only seen on auto-import)

The UI MUST visually distinguish suggested vs confirmed (e.g. yellow border on suggested, no border on confirmed). Reports MUST allow filtering by `confirmed` only when accuracy matters (audit, FAA evidence).

### 5.3 Confirmation UI

When a mechanic opens a work order with a suggested classification, the JASC pill renders as:

```
⏳ Wheels and Brakes (ATA 32 · JASC 3240)   [Confirm] [Change…]
```

Clicking **Confirm** sets `human_verified=true`, stores the user id, and snapshots a verified-at timestamp.

Clicking **Change…** opens a searchable picker (titled "Re-classify this work order"). The picker shows:

1. A search box that fuzzy-matches title + definition (uses the `idx_jasc_codes_search` GIN index)
2. Recently-used JASC codes for this aircraft (top of list)
3. Common JASC codes for this airframe class (default applicability filter)
4. "Show all" toggle to disable the applicability filter

Picking a new code soft-deletes the previous cross-reference row (we keep history) and inserts a new one with `classifier_source='human'`, `human_verified=true`.

### 5.4 Multiple JASC codes per record

A single work order may touch multiple systems. The UI MUST support adding multiple JASC codes per record. Display them inline as a comma-separated list, ordered by ATA chapter:

```
ATA 05 · 0560 Annual Inspection
ATA 32 · 3240 Wheels and Brakes
ATA 71 · 7100 Powerplant — General
```

The first listed code is the **primary** ATA chapter for reporting (e.g. "this WO counts against ATA 05 hours" for the annual report). Primary is configurable via a flag on the cross-reference row.

---

## 6. UI components and patterns

### 6.1 ATA / JASC chip

A reusable component (`<TaxonomyChip>`) used everywhere a code appears.

```
┌─────────────────────────────────────────┐
│ 🛠️  Wheels and Brakes                   │
│ ATA 32 · JASC 3240   ⏳ suggested        │
└─────────────────────────────────────────┘
```

Hover/tap reveals the JASC definition. Click navigates to the JASC's reference page (read-only spec card).

### 6.2 Classification picker (`<TaxonomyPicker>`)

The shared modal used everywhere a user picks an ATA/JASC code. Behaviors:

- Defaults to applicability filter for the current aircraft's class (single-engine piston, etc.)
- Per-aircraft overrides (`aircraft_jasc_override`) win over the default filter
- Search debounced 150ms, hits the GIN index
- Keyboard navigable (arrow keys, Enter to select, Escape to close)
- Pinned section: "Recently used on this aircraft" (last 6 codes)
- Pinned section: "Common for [Cessna 172]" (heuristic by make/model)
- A small "Why am I seeing these?" link explains the applicability filter

### 6.3 ATA chapter explorer

A standalone admin page (`/admin/taxonomy`) that browses the full ATA chapter list. Each chapter row shows count of JASC codes, count of past records, and links to the chapter's JASC code list. Used by leads who want to audit classification coverage across the shop.

---

## 7. Integration points across the platform

Every operational module that touches maintenance must integrate the taxonomy. The required behaviors:

| Module | Where the code lives | What it shows |
|---|---|---|
| **Work order detail** | `app/(app)/work-orders/[id]/` | Primary ATA + multi-JASC pills in header. Picker accessible via "Edit classification" button. |
| **Squawk detail** | `app/(app)/squawks/[id]/` | Same shape as work order. |
| **Estimate line items** | `app/(app)/estimates/[id]/lines` | Per-line JASC code (optional). Aggregated estimate-level ATA roll-up shown in the summary. |
| **Logbook entry composer** | `app/(app)/logbook-entries/new` | Auto-suggests ATA + JASC based on linked work order or AD; mechanic confirms. The classification is included in the released logbook entry text and the entry's structured fields. |
| **Parts catalog** | `app/(app)/parts/` | Each part may declare which JASC codes it serves. The picker for "what part is this for?" filters by JASC. |
| **Reports** | `app/(app)/reports/` | "Maintenance hours by ATA chapter" / "Cost by JASC code" / "ADs touched in past 12 months" |
| **AD compliance** | `app/(app)/compliance/` | ADs reference ATA chapters; the compliance UI joins on `ata_chapter` to surface "applicable ADs for this aircraft" filtered by chapter. |

### 7.1 RAG integration

The maintenance taxonomy is a key signal for the AI/RAG retrieval layer (see SOP-13). Chunks carry an ATA chapter tag when the source document is structured enough to determine one. The retrieval layer can use ATA chapter as a boost / filter — e.g. "questions about landing gear retrieve ATA 32 chunks first."

---

## 8. Data import and update process

### 8.1 Initial import

From the import package at `mark downs/manuals/ata:jasc code/`:

1. Load `schema_jasc_ata.sql` via Supabase migration tooling.
2. Run `INSERT` for all 100 rows in `ata_chapters_00_99.csv` → `ata_chapters`.
3. Run `INSERT` for all 547 rows in `jasc_codes_full.csv` → `jasc_codes`. Preserve leading zeros (CSV must be imported as strings, not numbers).
4. Recompute `ata_chapters.jasc_code_count` and `faa_jasc_has_codes` from the imported JASC rows.
5. Record the import in `taxonomy_source`:

```sql
INSERT INTO taxonomy_source (source_name, source_url, source_last_updated, imported_at, imported_by, notes)
VALUES (
  'FAA_JASC_2008',
  'https://sdrs.faa.gov/documents/JASC_Code.pdf',
  '2008-10-27',
  NOW(),
  'system-import-v1',
  '547 JASC rows + 100 ATA chapter slots'
);
```

### 8.2 Updates from FAA refresh

When the FAA republishes the JASC code table:

1. New CSV lands in `mark downs/manuals/ata:jasc code/` with a fresh `source_last_updated`.
2. Run a diff script that compares the new CSV to the current `jasc_codes` table.
3. For changes:
   - **Added codes**: insert with current import source.
   - **Modified codes** (title or definition changed): update the row, append a row to `jasc_codes_history` capturing the old values.
   - **Removed codes**: do NOT delete — set `status='retired'` on the row. Historical work orders may still reference retired codes.
4. Record the import as a new `taxonomy_source` row.

**Why we never delete codes:** a work order from 2018 may reference a JASC code the FAA later retired. That reference must remain resolvable forever. Retirement is a status flag, not a deletion.

### 8.3 Manufacturer-specific overrides

Some manufacturers extend the JASC scheme with proprietary sub-codes (e.g. Cessna's "Caravan-specific" component breakouts). These live in a separate `manufacturer_taxonomy_extension` table keyed on `(make, model, jasc_code, manufacturer_subcode)`. Out of scope for v1 — documented here for future extensibility.

---

## 9. Permissions and access control

| Role | View JASC codes | Edit codes | Set per-aircraft overrides | Confirm classifications | View reports |
|---|---|---|---|---|---|
| Owner | ✅ (read-only) | ❌ | ❌ | ❌ | ❌ (only aggregated work history on their own aircraft) |
| Apprentice | ✅ | ❌ | ❌ | ❌ | ❌ |
| A&P Mechanic | ✅ | ❌ | ❌ | ✅ | ✅ |
| IA / Lead Tech | ✅ | ❌ | ✅ | ✅ | ✅ |
| Admin | ✅ | ✅ (curated edits only; FAA-sourced rows are immutable) | ✅ | ✅ | ✅ |

The FAA-sourced rows (`source='FAA_JASC_2008'`) are immutable except via the official import process. Admins can edit `notes` and `applicability` flags on FAA rows but cannot change `title` or `definition` — those are FAA canonical.

Custom rows (`source='org-custom'`) can be created by admins for unusual aircraft (experimental, restricted) where the FAA scheme doesn't cover the work. These rows are scoped to the organization and never appear on other orgs' aircraft.

---

## 10. Compliance considerations

### 10.1 14 CFR Part 43

Part 43 §43.9 and §43.11 require maintenance records to describe the work performed with enough detail that a future inspector can determine compliance. A classification is not a substitute for a written description — but it makes the description searchable and demonstrates that the work was systematically categorized.

The platform MUST NOT block a logbook entry from being signed solely because classification is missing. Classification is operational hygiene, not regulatory requirement. However, the platform SHOULD warn the mechanic at sign time if the entry has no classification and offer to suggest one.

### 10.2 AD compliance

ADs are usually scoped to one or more ATA chapters. The AD-compliance module (see SOP-13 for the broader compliance posture) uses the platform's ATA tagging to filter which ADs are applicable to which records. This is a derived view, not regulatory advice — the final determination of AD applicability is always a human's call.

### 10.3 SOC2 audit evidence

The taxonomy itself is reference data — no PII, no customer data — so it sits outside the SOC2 confidentiality boundary. However, the `*_jasc_reference` cross-reference tables ARE inside the boundary because they tie classifications to specific customer aircraft. RLS policies on those tables MUST enforce org-level isolation (see SOP-13 §4).

---

## 11. Acceptance criteria

A reasonable v1 implementation satisfies all of these.

1. `ata_chapters` table contains exactly 100 rows (chapters 00 through 99).
2. `jasc_codes` table contains all rows from the imported FAA CSV, with leading-zero codes preserved as strings.
3. Every JASC code references a valid ATA chapter (FK enforced).
4. The `<TaxonomyChip>` component renders both the human title and the code, never just the code.
5. The `<TaxonomyPicker>` modal supports keyboard navigation, debounced search (≤150ms), and applicability filtering.
6. Suggested classifications (`human_verified=false`) display visually distinct from confirmed.
7. Mechanics with role `mechanic` or higher can confirm a suggested classification with a single click.
8. Re-classifying does not delete history — the prior row remains in `*_jasc_reference` with `superseded_at` set.
9. The admin taxonomy explorer at `/admin/taxonomy` lists all 100 chapters with JASC counts.
10. The reports module produces "hours by ATA chapter" and "cost by JASC code" rollups for any aircraft.
11. A retired JASC code (`status='retired'`) still resolves on historical work orders but does not appear in pickers for new work.
12. Per-aircraft overrides win over default applicability heuristics.
13. The `taxonomy_source` table has at least one row recording the initial FAA import.
14. RLS policies prevent org A from seeing org B's `aircraft_jasc_override` rows.
15. The full JASC reference data can be exported as CSV via an admin-only endpoint.
16. The OpenAPI/JSDoc for any internal classifier function explicitly documents that LLM-derived classifications are "suggested" not "verified".
17. No FAA-sourced row's `title` or `definition` is ever modified via UI — only via the import pipeline.

---

## 12. Out-of-scope notes

The following are deliberately deferred from v1:

- **ATA iSpec 2200 sub-section detail** (e.g. ATA 32-10-00, 32-20-00). The FAA JASC scheme is enough for our use case; sub-section detail would require licensing iSpec 2200 from A4A.
- **Engine-type-specific sub-codes** (turbofan vs turbojet vs turboshaft component breakouts). Defer to manufacturer maintenance manuals.
- **Auto-classification of historical logbook entries via the LLM classifier.** Possible but expensive; do it only when the RAG layer specifically needs higher chunk-tagging coverage.
- **Per-customer taxonomy localization** (translating titles to French, Spanish, etc.). Possible via a `jasc_code_translations` table — defer until there's customer demand.

---

## 13. References

- FAA JASC code source: https://sdrs.faa.gov/documents/JASC_Code.pdf
- ATA iSpec 2200 chapter scheme: https://www.airlines.org/ (proprietary)
- 14 CFR Part 43 — Maintenance, Preventive Maintenance, Rebuilding, and Alteration: https://www.ecfr.gov/current/title-14/chapter-I/subchapter-C/part-43
- AC 43-204 — Visual Inspection for Aircraft

---

**Document control:**
- SOP ID: SOP-11
- Version: 1.0.0
- Status: active
- Last updated: 2026-05-21
- Authors: Claude (Opus 4.7) — derived from FAA JASC code package and myaircraft.us internal taxonomy spec
- Next review: 2026-08-21
