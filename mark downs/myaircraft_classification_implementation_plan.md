# MYAIRCRAFT.US — CLASSIFICATION IMPLEMENTATION PLAN
## Phased Rollout for Taxonomy, Scanner UX, Review Precision, and Intelligence Mapping

This is the implementation plan for the full classification system.

The classification framework must be rolled out in phases so the product improves safely without blocking current progress.

---

# PHASE 1 — CORE TAXONOMY FOUNDATION

## Goal
Define the full taxonomy and make it usable by code, database, and UI.

## Deliverables
- master record families
- full document class registry
- subtype registry
- truth role registry
- parser strategy registry
- operation overlay registry
- machine-readable flags per class

## Data structures to build
- `document_class_registry`
- `document_subtype_registry`
- `truth_role_registry`
- `parser_strategy_registry`
- `operation_overlay_registry`
- `document_class_flags`

## Required outputs
For each class:
- family
- class code
- label
- subtype options
- default truth role
- parser strategy
- canonical eligibility
- reminder relevance
- AD relevance
- inspection relevance
- permission visibility
- operation overlays

## Acceptance criteria
- every known aircraft document class has a normalized entry
- no flat unlabeled giant list remains
- downstream systems can consume the registry

---

# PHASE 2 — SCANNER-TIME CLASSIFICATION

## Goal
Build a fast scanner-facing classification layer.

## Deliverables
- batch-level scanner classes
- evidence-mode item classes
- scanner-friendly labels
- unknown fallback
- “same as previous page” shortcuts
- storage of scan-time class metadata

## UI requirements
Scanner chooses:
- org/customer
- aircraft
- batch type or evidence type
- optional page/item classification

## Technical requirements
Store:
- scan-time class
- selected aircraft
- selected logbook/evidence destination
- scan metadata
- quality warnings

## Acceptance criteria
- scanner workflow remains simple
- scan-time classification improves routing
- scanner is not burdened with full taxonomy complexity

---

# PHASE 3 — REVIEW-TIME PRECISION

## Goal
Add reviewer/admin precision classification.

## Deliverables
- exact review-time class picker
- subtype picker
- truth role picker
- parser strategy override
- evidence flags
- canonical/non-canonical markers
- review audit trail

## Reviewer powers
Reviewer can:
- refine exact class
- split one page into multiple classes
- mark documents as source/supporting/reference/ignore
- link component scope
- mark reminder-driving or AD-driving relevance

## Acceptance criteria
- high-risk docs can be precisely classified
- review decisions are durable and auditable
- low-confidence docs no longer drift into truth without exact classing

---

# PHASE 4 — INTELLIGENCE MAPPING

## Goal
Connect classification to system behavior.

## Deliverables
Mapping from each class to:
- reminder engine behavior
- AD engine behavior
- completeness engine behavior
- search filters
- intelligence widgets
- permission visibility
- export packet inclusion rules

## Example mappings
- annual_inspection_record -> can satisfy annual reminder
- ad_supporting_signoff -> can satisfy AD evidence if canonical
- poh -> reference-only, completeness-relevant, not reminder-driving
- aircraft_status_summary -> derived only, not canonical source
- faa_form_337 -> can affect configuration/compliance, review priority high

## Acceptance criteria
- reminders only activate from allowed classes/roles
- completeness reflects real missing categories
- search filters become meaningful
- intelligence modules know what to show

---

# PHASE 5 — OPERATION OVERLAYS

## Goal
Support operation-specific expectations without breaking core taxonomy.

## Deliverables
Overlay rules for:
- part_91
- part_135
- part_141
- part_61
- flight_school
- charter
- private_owner
- lease_managed
- corporate_operation
- maintenance_shop_managed

## Overlay effects
- expected documents
- reminder templates
- completeness weighting
- role visibility
- intelligence modules
- export packet contents

## Acceptance criteria
- a Part 135 aircraft looks different from a simple Part 91 owner aircraft
- overlays reuse the same core taxonomy
- the system does not fork into separate products

---

# PHASE 6 — PARSER ROUTING AND SEGMENTATION

## Goal
Use classification to drive OCR/HTR/VLM routing and segmentation.

## Deliverables
- family/class-to-parser mapping
- segmentation priority flags
- cross-page continuation rules
- component-linking requirements

## Examples
- airframe_logbook -> handwritten_logbook or mixed_handwritten_typed, segmentation required
- yellow_tag -> certificate_tag_form
- work_order -> mixed_handwritten_typed
- checklist -> checklist_reference
- packet -> packet_bundle
- ocr_text_extract -> digital_derived_file

## Acceptance criteria
- parser strategy is no longer generic
- review burden drops because routing improves
- evidence precision improves

---

# PHASE 7 — PERMISSIONS AND VISIBILITY

## Goal
Make classification drive who sees what.

## Deliverables
Visibility rules by role:
- owner
- operator
- pilot
- instructor
- mechanic
- lead_mechanic
- ia
- maintenance_manager
- operations_director
- auditor
- lender
- insurance_reviewer
- external_readonly

## Examples
- insurance docs visible to owner/admin, maybe not general mechanic
- shop labor records visible to mechanic/admin
- compliance summaries visible to owner/operator/auditor
- raw OCR extracts hidden from basic owner UI
- reference manuals visible where operationally appropriate

## Acceptance criteria
- permissions feel intentional
- aircraft-centered access is clear
- not every document is visible to everyone

---

# PHASE 8 — SEARCH, REMINDERS, AND INTELLIGENCE HARDENING

## Goal
Finish the system so classification truly powers the product.

## Deliverables
- search filters by family/class/subtype/role
- reminder activation rules by class
- AD evidence rules by class
- completeness dashboards by family
- intelligence modules by class mix
- packet generation by class inclusion rules

## Acceptance criteria
- search is precise
- reminders are safer
- AD logic is evidence-based
- aircraft intelligence becomes structured and trustworthy

---

# FINAL BUILD POSTURE

Do not attempt to ship everything as one giant unstructured list.

Roll out in this order:
1. taxonomy
2. scanner layer
3. review layer
4. intelligence mapping
5. operation overlays
6. parser routing
7. permissions
8. downstream hardening

This is the cleanest way to make the classification system complete, scalable, and aviation-grade.
