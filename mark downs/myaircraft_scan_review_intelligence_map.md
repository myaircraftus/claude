# MYAIRCRAFT.US — SCAN-TIME, REVIEW-TIME, AND INTELLIGENCE-TIME CLASSIFICATION MAP
## Scanner UX + Reviewer Precision + System Intelligence

This document defines how classification should work across the three operating layers of the platform:

1. **Scan-time classification** — fast, simple, operator-friendly  
2. **Review-time classification** — precise, exact, aviation-grade  
3. **Intelligence-time classification** — normalized system ontology for reminders, compliance, search, and aircraft intelligence

---

# 1. SCAN-TIME CLASSIFICATION

## Goal
The scanner should move quickly without facing a giant taxonomy.

The scanner UI must use **simple batch-level required classification** plus **optional page/item-level refinement** when useful.

## Batch-level scan classes
Use only these primary options:

- Airframe Logbook
- Engine Logbook
- Propeller Logbook
- Avionics Logbook
- Inspection Records
- AD / SB / Compliance
- FAA Forms / Tags / Certifications
- Work Orders / Shop Records
- Legal / Registration / Ownership
- Flight Manual / Checklist / Reference
- Parts / Traceability / Inventory
- Correspondence / Letters
- Insurance / Finance / Commercial
- Summary / Packet / Derived
- Unknown

## Evidence mode item classes
For one-off capture or evidence uploads:
- Logbook Entry
- Work Order
- Estimate
- Invoice
- Squawk / Discrepancy
- Annual Inspection
- 100-Hour Inspection
- 50-Hour Inspection
- AD Record
- Service Bulletin
- FAA Form 337
- FAA Form 8130-3
- Yellow Tag / Return to Service Tag
- Weight and Balance
- POH / AFM / Supplement
- Part Trace / 8130 / Conformity
- Photo Evidence
- Unknown

## Scan-time behavior rules
- Batch-level classification is required
- Page-level classification is optional
- Unknown must always be available
- “Same as previous page” shortcut should exist
- Scanner can mark page as unreadable
- Scanner does not decide canonical truth
- Scan-time classification is advisory input to the downstream classifier

---

# 2. REVIEW-TIME CLASSIFICATION

## Goal
Reviewers and admins refine documents into exact classes and truth roles.

## Review-time fields
For each document/page/segment, reviewer can refine:
- record family
- exact document class
- subtype
- truth role
- parser strategy
- aircraft scope
- component scope
- operation overlay
- canonical eligibility
- reminder relevance
- AD relevance
- inspection relevance

## Review-time decisions
Reviewer can:
- reclassify batch
- reclassify page
- reclassify segment
- split one page into multiple classes
- mark documents as source/supporting/reference/ignore
- mark a document as evidence for AD / reminder / inspection
- mark a document as non-canonical

## Review-time priority rules
Reviewer attention should be highest for:
- logbooks
- signed inspection records
- AD compliance evidence
- major repair/alteration forms
- weight and balance
- recurring compliance records
- component time tracking
- parts traceability supporting installed components
- work order + signoff combinations
- anything that can activate reminders or compliance state

---

# 3. INTELLIGENCE-TIME CLASSIFICATION

## Goal
The platform should use a normalized ontology for system behavior.

This is the internal layer used by:
- reminders engine
- AD engine
- completeness engine
- aircraft intelligence modules
- search and AI answers
- permissions
- packet generation

## Internal normalized buckets
Every document should map to one or more intelligence tags such as:
- identity_ownership
- certification_configuration
- permanent_maintenance_history
- inspection_history
- ad_compliance
- service_information
- operational_reference
- component_lifecycle
- avionics_compliance
- repair_alteration_damage
- parts_traceability
- shop_execution
- recurring_compliance
- usage_time_tracking
- finance_insurance
- authority_correspondence
- oem_support
- emergency_equipment
- checklist_reference
- specialized_ops
- derived_intelligence
- summary_meta

## Intelligence flags
For each class, set:
- `is_canonical_candidate`
- `is_supporting_evidence`
- `is_reference_only`
- `can_activate_reminder`
- `can_satisfy_ad_requirement`
- `can_satisfy_inspection_requirement`
- `can_change_aircraft_status`
- `can_change_component_status`
- `can_change_document_completeness`
- `should_be_hidden_from_basic_owner_ui`
- `should_be_visible_to_mechanic`
- `should_be_visible_to_auditor`
- `needs_segmentation`
- `needs_cross_page_linking`

---

# 4. CLASSIFICATION FLOW

## Required flow
1. Scanner chooses simple batch class
2. System stores scan metadata
3. Downstream classifier predicts exact family/class/subtype
4. OCR/HTR/VLM + validators extract fields
5. Reviewer refines classification if needed
6. Intelligence layer maps the reviewed class to machine-readable behavior

This is the intended pipeline.

---

# 5. QUICK MAPPING TABLE

## Airframe Logbook (scan-time)
May map to review-time exact classes:
- airframe_logbook
- historical_logbook_scan
- return_to_service_record
- maintenance_release_record

Intelligence tags:
- permanent_maintenance_history
- inspection_history
- component_lifecycle
- ad_compliance (if matching evidence exists)

## FAA Forms / Tags / Certifications (scan-time)
May map to:
- faa_form_337
- faa_8130_document
- faa_8130_3
- conformity_document
- yellow_tag
- return_to_service_tag

Intelligence tags:
- certification_configuration
- parts_traceability
- repair_alteration_damage
- canonical_evidence (if validated)

## AD / SB / Compliance (scan-time)
May map to:
- ad_compliance_list
- ad_method_of_compliance_record
- ad_supporting_signoff
- service_bulletin
- mandatory_service_bulletin
- saib_notice

Intelligence tags:
- ad_compliance
- service_information
- recurring_compliance

## Work Orders / Shop Records (scan-time)
May map to:
- maintenance_work_order
- task_card
- labor_record
- shop_visit_report
- squawk_list
- discrepancy_list
- corrective_action_record

Intelligence tags:
- shop_execution
- supporting_evidence
- maybe canonical signoff only if approved and linked

## Summary / Packet / Derived (scan-time)
May map to:
- audit_packet
- insurance_lender_packet
- searchable_maintenance_history
- aircraft_status_summary
- ad_due_list

Intelligence tags:
- derived_intelligence
- summary_meta
- non_canonical unless explicitly produced and versioned by system logic

---

# 6. SCANNER UX CONSTRAINTS

The scanner UI should not expose the full master taxonomy.
It should expose:
- simple batch classes
- simple evidence classes
- optional page/item refinements
- unknown option
- fast repeat actions

This keeps field workflows fast while preserving downstream precision.

---

# 7. REVIEWER UX CONSTRAINTS

The reviewer UI should expose:
- exact class
- subtype
- truth role
- evidence flags
- parser mode
- canonical eligibility
- reminder/AD relevance

The reviewer is where precision increases.

---

# 8. SYSTEM RULE

The final truth model must come from:
- reviewed classification
- validated extraction
- source precedence
- canonicalization rules

Never let scan-time labels alone determine compliance or reminder truth.
