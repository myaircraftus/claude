# MYAIRCRAFT.US — MASTER AIRCRAFT RECORDS CLASSIFICATION SYSTEM
## Core Taxonomy + Document Classes + Truth Roles + Parser Strategies + Operation Overlays

You are extending the existing **myaircraft.us** product.  
Do **not** build a flat document list only.  
Build a complete aircraft-centered classification framework that works across:
- scanner capture
- review workflow
- OCR/HTR/VLM routing
- canonicalization
- reminders
- AD/service tracking
- aircraft completeness
- permissions
- intelligence summaries
- export/audit/lender/insurance packets

The **aircraft is the source of truth**.  
Every document must ultimately map back to one aircraft record, one or more components, one or more compliance/maintenance states, and one or more evidence roles.

---

# 1. SYSTEM DESIGN PRINCIPLE

Build classification in **five connected layers**:

1. **Record Family**  
   Small and stable top-level bucket.

2. **Document Class**  
   Specific document type the user, reviewer, and system recognize.

3. **Subtype / Operational Subtype**  
   Extra detail needed for routing, parsing, reminders, ADs, and intelligence.

4. **Truth Role**  
   Whether the document is canonical, supporting, informational, derived, temporary, etc.

5. **Parser Strategy**  
   Which extraction/routing path the ingestion system should use.

This is the required architecture.

---

# 2. GLOBAL CLASSIFICATION MODEL

Each document or segment should support the following normalized fields:

- `record_family`
- `document_class`
- `document_subtype`
- `operation_overlay`
- `aircraft_scope`
- `component_scope`
- `truth_role`
- `canonical_eligibility`
- `reminder_relevance`
- `ad_relevance`
- `inspection_relevance`
- `completeness_relevance`
- `permission_group`
- `parser_strategy`
- `review_priority`
- `confidence_policy`
- `retention_priority`

---

# 3. RECORD FAMILIES

Use these as the stable top-level families.

## A. Legal / Ownership
## B. Airworthiness / Certification / Configuration
## C. Logbooks / Permanent Records
## D. Maintenance Program / Inspection
## E. AD / SB / Service Information
## F. Flight / Operations / Crew References
## G. Engine / Prop / Components
## H. Avionics / Electrical
## I. Repairs / Alterations / Damage
## J. Parts / Traceability / Inventory
## K. Work Orders / Shop Execution
## L. Recurring Compliance
## M. Usage / Time Tracking / Utilization
## N. Insurance / Finance / Commercial
## O. Government / FAA / Authority / Stakeholder Correspondence
## P. Manufacturer / OEM / Support
## Q. Emergency / Safety Equipment
## R. Checklists / Cockpit References
## S. Specialized Ops / Aircraft-Type Specific
## T. Digital / Derived Intelligence
## U. Summary / Packet / Meta Documents

---

# 4. TRUTH ROLES

Every document must be assigned one truth role.

## Allowed truth roles
- `source_of_truth`
- `canonical_evidence`
- `supporting_evidence`
- `reference_only`
- `derived_summary`
- `regulatory_reference`
- `operational_support`
- `financial_commercial`
- `historical_archive`
- `temporary_working`
- `non_canonical_evidence`
- `needs_review`
- `ignore`

## General role guidance
- Logbooks, signed maintenance releases, approved forms, and certain compliance records may become `source_of_truth` or `canonical_evidence`.
- Work orders, estimates, shop notes, photos, and invoices are usually `supporting_evidence` or `financial_commercial`.
- Manuals, POH/AFM, checklists, reference pages, service letters, and correspondence are usually `reference_only` or `regulatory_reference`.
- OCR extracts, trackers, summaries, and packets are `derived_summary`.
- Blank scans, duplicate pages, irrelevant inserts, and unreadable pages may be `ignore` or `needs_review`.

---

# 5. PARSER STRATEGIES

Each class must map to one parser strategy.

## Allowed parser strategies
- `native_text_document`
- `typed_scanned_form`
- `handwritten_logbook`
- `mixed_handwritten_typed`
- `table_heavy`
- `certificate_tag_form`
- `letter_correspondence`
- `checklist_reference`
- `photo_evidence`
- `packet_bundle`
- `digital_derived_file`
- `manual_review_only`
- `ignore`

---

# 6. SCOPES

## Aircraft scope
Allowed:
- `aircraft`
- `airframe`
- `engine`
- `propeller`
- `apu`
- `avionics`
- `component`
- `flight_ops`
- `ownership`
- `commercial`
- `multi_scope`

## Component scope examples
- engine
- engine_accessory
- propeller
- governor
- magneto
- turbocharger
- starter
- alternator
- battery
- landing_gear
- wheel_brake
- hose
- elt
- oxygen
- fire_extinguisher
- vacuum_pump
- autopilot
- transponder
- encoder
- altimeter
- pitot_static
- antenna
- adsb
- rotor
- gearbox
- float_ski
- cargo_hook
- pressurization
- anti_ice

---

# 7. MASTER TAXONOMY BY FAMILY

## A. LEGAL / OWNERSHIP

### Document classes
- certificate_of_aircraft_registration
- temporary_registration
- registration_history
- bill_of_sale
- prior_bill_of_sale
- ownership_chain_record
- purchase_agreement
- delivery_acceptance_document
- lease_agreement
- trust_ownership_document
- lien_document
- lien_release_document
- security_agreement
- lender_document
- import_document
- export_document
- customs_clearance_record
- state_tax_record
- use_tax_record

### Truth role defaults
- source_of_truth
- supporting_evidence
- financial_commercial

### Parser strategy defaults
- typed_scanned_form
- letter_correspondence
- native_text_document
- packet_bundle

---

## B. AIRWORTHINESS / CERTIFICATION / CONFIGURATION

### Document classes
- standard_airworthiness_certificate
- special_airworthiness_certificate
- export_certificate_of_airworthiness
- conformity_document
- faa_8130_document
- type_certificate_data_sheet
- supplemental_type_certificate
- stc_ica
- field_approval
- faa_form_337
- approved_flight_manual_supplement
- equipment_list
- weight_and_balance_report
- weight_and_balance_amendment
- aircraft_status_sheet
- noise_certificate
- radio_station_license

### Subtypes
- certification
- modification
- equipment_configuration
- weight_balance
- authority_approval

### Truth role defaults
- canonical_evidence
- regulatory_reference
- source_of_truth
- derived_summary (status sheet only if system-generated)

### Parser strategy defaults
- typed_scanned_form
- certificate_tag_form
- native_text_document
- table_heavy

---

## C. LOGBOOKS / PERMANENT RECORDS

### Document classes
- airframe_logbook
- engine_logbook
- propeller_logbook
- apu_logbook
- rotorcraft_component_logbook
- avionics_logbook
- appliance_accessory_logbook
- component_history_card
- serialized_component_card
- journey_log
- tech_log
- flight_log
- maintenance_release_record
- return_to_service_record
- historical_logbook_scan
- lost_logbook_affidavit
- reconstruction_record

### Subtypes
- permanent_record
- maintenance_history
- signoff_record
- operational_journey_record
- reconstructed_record

### Truth role defaults
- source_of_truth
- canonical_evidence
- supporting_evidence
- historical_archive

### Parser strategy defaults
- handwritten_logbook
- mixed_handwritten_typed
- table_heavy
- native_text_document

---

## D. MAINTENANCE PROGRAM / INSPECTION

### Document classes
- approved_maintenance_program
- manufacturer_maintenance_manual
- service_manual
- overhaul_manual
- structural_repair_manual
- illustrated_parts_catalog
- parts_catalog
- wiring_diagram_manual
- troubleshooting_manual
- fault_isolation_manual
- component_maintenance_manual
- inspection_program_document
- annual_inspection_record
- hundred_hour_inspection_record
- fifty_hour_inspection_record
- progressive_inspection_record
- phase_inspection_record
- camp_record
- corrosion_inspection_record
- structural_inspection_record
- special_inspection_record
- non_routine_inspection_record

### Truth role defaults
- source_of_truth (inspection records)
- regulatory_reference
- reference_only
- canonical_evidence (approved signoff records)

### Parser strategy defaults
- native_text_document
- typed_scanned_form
- mixed_handwritten_typed
- table_heavy
- checklist_reference

---

## E. AD / SB / SERVICE INFORMATION

### Document classes
- ad_compliance_list
- ad_recurring_compliance_status
- ad_method_of_compliance_record
- ad_supporting_signoff
- service_bulletin
- mandatory_service_bulletin
- service_letter
- service_instruction
- service_kit_notice
- service_change_notice
- vendor_bulletin
- ica_revision
- saib_notice
- oem_technical_correspondence

### Subtypes
- ad_one_time
- ad_recurring
- ad_moc
- sb_mandatory
- sb_recommended
- service_notice
- technical_guidance

### Truth role defaults
- canonical_evidence
- regulatory_reference
- reference_only
- supporting_evidence

### Parser strategy defaults
- native_text_document
- typed_scanned_form
- letter_correspondence
- packet_bundle

---

## F. FLIGHT / OPERATIONS / CREW REFERENCES

### Document classes
- poh
- afm
- rotorcraft_flight_manual
- approved_flight_manual_supplement
- quick_reference_handbook
- normal_procedures_checklist
- emergency_procedures_checklist
- abnormal_procedures_checklist
- performance_chart
- limitations_section
- placard_reference
- mel
- cdl
- koel

### Truth role defaults
- reference_only
- operational_support
- regulatory_reference

### Parser strategy defaults
- native_text_document
- checklist_reference
- table_heavy
- packet_bundle

---

## G. ENGINE / PROP / COMPONENTS

### Document classes
- engine_installation_record
- engine_overhaul_record
- engine_teardown_report
- compression_test_record
- borescope_report
- oil_analysis_report
- trend_monitoring_record
- propeller_overhaul_record
- propeller_balancing_record
- governor_record
- magneto_record
- turbocharger_record
- starter_record
- alternator_record
- generator_record
- landing_gear_overhaul_record
- shock_strut_service_record
- brake_record
- wheel_record
- battery_record
- elt_record
- elt_battery_expiry_record
- oxygen_system_record
- fire_extinguisher_record
- vacuum_pump_record
- fuel_system_component_record
- hose_replacement_record
- lifed_component_tracking_sheet

### Truth role defaults
- canonical_evidence
- source_of_truth
- supporting_evidence
- derived_summary (tracking sheets)

### Parser strategy defaults
- mixed_handwritten_typed
- typed_scanned_form
- table_heavy
- native_text_document

---

## H. AVIONICS / ELECTRICAL

### Document classes
- avionics_installation_record
- wiring_modification_record
- avionics_manual
- navigation_database_update_record
- software_firmware_update_record
- avionics_stc_record
- antenna_installation_record
- transponder_certification_test
- altimeter_pitot_static_test_record
- ifr_certification_record
- elt_test_record
- adsb_compliance_record
- autopilot_calibration_record

### Truth role defaults
- canonical_evidence
- reference_only
- regulatory_reference
- supporting_evidence

### Parser strategy defaults
- typed_scanned_form
- certificate_tag_form
- native_text_document
- table_heavy

---

## I. REPAIRS / ALTERATIONS / DAMAGE

### Document classes
- major_repair_record
- minor_repair_record
- major_alteration_record
- form_337
- damage_repair_record
- incident_repair_record
- accident_repair_record
- structural_repair_approval
- corrosion_treatment_record
- composite_repair_record
- paint_refurbishment_record
- interior_refurbishment_record
- modification_package
- engineering_order
- der_approval
- repair_station_release
- repair_photograph
- insurance_repair_documentation

### Truth role defaults
- canonical_evidence
- supporting_evidence
- source_of_truth (approved records/forms)
- non_canonical_evidence (photos until linked and reviewed)

### Parser strategy defaults
- typed_scanned_form
- photo_evidence
- native_text_document
- packet_bundle
- mixed_handwritten_typed

---

## J. PARTS / TRACEABILITY / INVENTORY

### Document classes
- illustrated_parts_catalog
- parts_manual
- parts_purchase_invoice
- vendor_invoice
- packing_slip
- traceability_document
- faa_8130_3
- easa_form_1
- certificate_of_conformity
- yellow_tag
- return_to_service_tag
- shelf_life_tracking_record
- serialized_parts_inventory_record
- rotable_pool_record
- loaner_component_record
- removed_part_record
- scrap_tag

### Truth role defaults
- supporting_evidence
- canonical_evidence
- financial_commercial
- reference_only

### Parser strategy defaults
- certificate_tag_form
- typed_scanned_form
- table_heavy
- native_text_document

---

## K. WORK ORDERS / SHOP EXECUTION

### Document classes
- maintenance_work_order
- internal_shop_work_card
- task_card
- work_scope
- squawk_list
- discrepancy_list
- corrective_action_record
- deferred_maintenance_record
- labor_record
- inspection_signoff_sheet
- contractor_work_order
- repair_station_work_order
- shop_visit_report
- maintenance_release_certificate
- service_center_report

### Truth role defaults
- supporting_evidence
- canonical_evidence (signed release/signoff portions)
- temporary_working
- operational_support

### Parser strategy defaults
- mixed_handwritten_typed
- typed_scanned_form
- table_heavy
- native_text_document
- photo_evidence

---

## L. RECURRING COMPLIANCE

### Document classes
- elt_inspection_record
- elt_battery_replacement_record
- pitot_static_check_record
- altimeter_check_record
- transponder_inspection_record
- ifr_certification_check
- vor_check_log
- emergency_equipment_inspection_record
- oxygen_bottle_hydrostatic_record
- fire_bottle_service_record
- compass_swing_record
- weight_balance_update_after_mod
- corrosion_aging_aircraft_inspection_record
- time_limited_component_replacement_record

### Truth role defaults
- canonical_evidence
- source_of_truth
- supporting_evidence

### Parser strategy defaults
- typed_scanned_form
- certificate_tag_form
- mixed_handwritten_typed
- table_heavy

---

## M. USAGE / TIME TRACKING / UTILIZATION

### Document classes
- hobbs_time_record
- tach_time_record
- flight_time_summary
- airframe_total_time_record
- engine_total_time_record
- engine_smoh_record
- prop_total_time_record
- prop_spoh_record
- cycle_count_record
- landing_count_record
- apu_hours_record
- apu_cycles_record
- mission_record
- utilization_report
- dispatch_reliability_record

### Truth role defaults
- canonical_evidence
- derived_summary
- supporting_evidence

### Parser strategy defaults
- table_heavy
- native_text_document
- typed_scanned_form
- digital_derived_file

---

## N. INSURANCE / FINANCE / COMMERCIAL

### Document classes
- insurance_policy
- certificate_of_insurance
- loss_history_record
- claim_record
- appraisal
- valuation_report
- lender_inspection_report
- financing_agreement
- lease_return_condition_report
- prebuy_inspection_report
- buyer_due_diligence_packet
- auditor_summary
- asset_management_report

### Truth role defaults
- financial_commercial
- supporting_evidence
- derived_summary

### Parser strategy defaults
- native_text_document
- packet_bundle
- typed_scanned_form
- table_heavy

---

## O. GOVERNMENT / FAA / AUTHORITY / STAKEHOLDER CORRESPONDENCE

### Document classes
- faa_registration_correspondence
- registration_renewal_notice
- faa_letter
- faa_deficiency_letter
- faa_compliance_letter
- faa_approval_letter
- field_approval_correspondence
- faa_enforcement_inquiry_correspondence
- n_number_reservation_record
- registration_cancellation_letter
- registration_transfer_letter
- export_import_authority_letter
- airworthiness_authority_correspondence
- manufacturer_letter
- dealer_letter
- lessor_letter
- legal_notice

### Truth role defaults
- supporting_evidence
- regulatory_reference
- legal_commercial
- reference_only

### Parser strategy defaults
- letter_correspondence
- native_text_document
- typed_scanned_form

---

## P. MANUFACTURER / OEM / SUPPORT

### Document classes
- oem_delivery_document
- factory_build_sheet
- equipment_options_list
- original_delivery_inventory
- warranty_record
- warranty_claim
- oem_support_letter
- service_difficulty_communication
- product_improvement_program_document
- continued_operational_safety_notice
- interior_completion_record

### Truth role defaults
- supporting_evidence
- reference_only
- regulatory_reference

### Parser strategy defaults
- native_text_document
- letter_correspondence
- table_heavy
- packet_bundle

---

## Q. EMERGENCY / SAFETY EQUIPMENT

### Document classes
- survival_equipment_inspection_record
- raft_inspection_record
- life_vest_inspection_record
- first_aid_kit_record
- emergency_locator_transmitter_record
- oxygen_mask_record
- portable_oxygen_record
- fire_extinguisher_record
- emergency_equipment_location_list

### Truth role defaults
- canonical_evidence
- operational_support
- supporting_evidence

### Parser strategy defaults
- typed_scanned_form
- table_heavy
- native_text_document

---

## R. CHECKLISTS / COCKPIT REFERENCES

### Document classes
- normal_checklist
- before_start_checklist
- start_checklist
- taxi_checklist
- runup_checklist
- takeoff_checklist
- cruise_checklist
- descent_checklist
- before_landing_checklist
- after_landing_checklist
- shutdown_checklist
- emergency_checklist
- abnormal_checklist
- winter_operations_checklist
- ferry_special_flight_checklist
- ground_handling_checklist

### Truth role defaults
- operational_support
- reference_only

### Parser strategy defaults
- checklist_reference
- native_text_document

---

## S. SPECIALIZED OPS / AIRCRAFT-TYPE SPECIFIC

### Document classes
- rotor_blade_record
- tail_rotor_record
- gearbox_record
- life_limited_parts_list
- cargo_hook_record
- float_ski_record
- agricultural_spray_system_record
- charter_part135_compliance_record
- flight_school_rental_record
- part_91_manual
- part_135_manual
- part_145_manual
- part_141_manual
- rvsm_approval_record
- etops_special_ops_approval
- pressurization_system_record
- deice_antiice_record

### Truth role defaults
- canonical_evidence
- regulatory_reference
- operational_support
- source_of_truth
- reference_only

### Parser strategy defaults
- native_text_document
- typed_scanned_form
- table_heavy
- mixed_handwritten_typed

---

## T. DIGITAL / DERIVED INTELLIGENCE

### Document classes
- scanned_log_copy
- ocr_text_extract
- searchable_maintenance_history
- missing_document_list
- missing_log_gap_analysis
- component_time_tracking_sheet
- ad_sb_master_tracker
- inspection_due_tracker
- maintenance_forecast
- aircraft_records_index
- master_document_register
- naming_convention_sheet
- prebuy_summary_packet
- insurance_lender_packet
- audit_packet
- export_packet
- backup_archive_copy

### Truth role defaults
- derived_summary
- non_canonical_evidence
- historical_archive
- reference_only

### Parser strategy defaults
- digital_derived_file
- packet_bundle
- native_text_document

---

## U. SUMMARY / PACKET / META DOCUMENTS

### Document classes
- aircraft_document_checklist
- aircraft_status_summary
- airworthiness_summary
- registration_summary
- ownership_summary
- damage_history_summary
- modification_summary
- engine_status_summary
- propeller_status_summary
- component_due_list
- inspection_due_list
- ad_due_list
- sb_action_list
- record_gap_summary

### Truth role defaults
- derived_summary
- non_canonical_evidence
- reference_only

### Parser strategy defaults
- digital_derived_file
- packet_bundle
- native_text_document

---

# 8. OPERATION-TYPE OVERLAYS

The system must support a **core taxonomy for all aircraft** plus **operation overlays**.

## Supported operation overlays
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

## Overlay behavior
Each overlay can affect:
- expected document classes
- reminder templates
- completeness scoring
- role permissions
- intelligence modules
- compliance/risk emphasis

### Example overlays

#### Part 91
Focus:
- registration
- airworthiness
- logbooks
- inspections
- recurring compliance
- major component history
- manuals/checklists

#### Part 135 / charter
Add stronger emphasis on:
- operations manuals
- MEL/CDL/KOEL
- charter compliance records
- dispatch/utilization reliability
- added recurrent compliance
- audit/lender/insurance readiness

#### Part 141 / flight school
Add emphasis on:
- school/rental records
- 100-hour relevance
- training/checklist documents
- dispatch/utilization and tach/hobbs integration

#### Maintenance / shop-managed aircraft
Add emphasis on:
- work orders
- task cards
- shop reports
- estimates / invoices
- mechanic assignment / signoff trail

---

# 9. CLASSIFICATION OUTPUT FLAGS

For each document class, support machine-readable flags:

- `can_be_canonical`
- `can_drive_reminders`
- `can_satisfy_ad_evidence`
- `can_satisfy_inspection_evidence`
- `can_affect_completeness`
- `requires_component_linking`
- `requires_cross_page_segmentation`
- `requires_manual_review_if_low_confidence`
- `owner_visible`
- `mechanic_visible`
- `auditor_visible`
- `external_readonly_visible`

---

# 10. FINAL POSTURE

Do not implement classification as a single dropdown only.

Implement classification as:
- core taxonomy
- operation overlay
- truth role
- parser strategy
- machine-readable evidence flags

This is what allows the system to stay consistent across:
- scanning
- OCR/HTR/VLM routing
- review
- reminders
- AD logic
- completeness
- search
- aircraft intelligence
- owner/mechanic permissions
