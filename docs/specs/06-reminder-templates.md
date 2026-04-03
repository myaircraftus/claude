# Spec 6 — Reminder Template Catalog + Activation Rules

## Mission
Create a complete, seeded reminder template registry so the product already knows the universe of common aircraft maintenance/compliance reminders, even before all aircraft-specific evidence is fully ingested.

The reminder engine must automatically activate, update, suppress, escalate, and close reminder instances based on:
- Aircraft registry data
- Connected scheduling/provider integrations
- Tach / hobbs / airframe time sync
- Uploaded native-text and scanned logbooks
- OCR / structured extraction
- FAA AD applicability + compliance evidence
- Recurring compliance schedules
- Dates and expiration rules
- Manual admin overrides where allowed

## Core Design Rules
1. Templates define what kinds of reminders can exist
2. Reminder instances are aircraft-specific realizations of templates
3. Templates may exist in a seeded inactive state until evidence or applicability activates them
4. LLM may extract evidence, but reminder activation/due logic must be **deterministic**
5. Every reminder instance must have: aircraft_id, org_id, template_id, status, source_basis, due_basis, evidence_links, last_evaluated_timestamp
6. Compliance-critical reminders must never rely on hallucinated facts
7. Conflicting evidence must surface review tasks rather than silently overwrite truth

## Data Model

### reminder_templates
id, code, title, category, subcategory, description, applicable_to_aircraft_classes, applicable_to_operation_types, source_modes, due_basis_type, activation_rule_type, completion_rule_type, recurrence_rule_type, default_lead_days, default_lead_hours, severity_default, requires_review_on_activation, requires_review_on_completion, compliance_critical, regulatory_reference, sort_order, is_seeded, is_active, metadata, created_at, updated_at

### reminder_instances
id, org_id, aircraft_id, template_id, status, activation_state, due_date, due_tach, due_hobbs, due_airframe_time, source_kind, source_ref, evidence_ref, confidence, severity, title_override, description_override, notes, auto_created, auto_closed, manual_override, snoozed_until, last_evaluated_at, next_evaluation_at, created_at, updated_at

### reminder_evidence
id, reminder_instance_id, evidence_type, document_id, page_number, maintenance_entry_id, integration_provider, integration_payload_ref, ad_status_id, snippet, confidence, created_at

### reminder_rule_runs
id, aircraft_id, template_id, run_reason, result_state, result_summary, payload, created_at

## Master Template Catalog (70 templates)

### A. Inspection Reminders (1-9)
1. annual_inspection_due
2. annual_inspection_overdue
3. hundred_hour_inspection_due
4. hundred_hour_inspection_overdue
5. progressive_inspection_phase_due
6. progressive_inspection_phase_overdue
7. prebuy_records_review
8. conformity_records_review
9. return_to_service_document_review

### B. AD Reminders (10-17)
10. ad_applicability_review_required
11. ad_unknown_compliance
12. ad_due_soon
13. ad_overdue
14. recurring_ad_reinspection_due
15. recurring_ad_reinspection_overdue
16. ad_supersedure_review
17. ad_evidence_conflict_review

### C. Registration / Certificate / Document Reminders (18-24)
18. registration_expiration_due
19. registration_expiration_overdue
20. airworthiness_document_review
21. insurance_expiration_due
22. operating_limitations_review
23. poh_afm_revision_review
24. weight_and_balance_review_due

### D. Avionics / IFR / Check Reminders (25-33)
25. transponder_inspection_due — 14 CFR 91.413, biennial
26. transponder_inspection_overdue
27. static_system_inspection_due — 14 CFR 91.411, biennial
28. static_system_inspection_overdue
29. altimeter_inspection_due — 14 CFR 91.411, biennial
30. altimeter_inspection_overdue
31. ifr_certification_review
32. vor_check_due — 14 CFR 91.171, 30 days
33. vor_check_recent_missing

### E. ELT / Safety Equipment Reminders (34-40)
34. elt_battery_due — 14 CFR 91.207, annual
35. elt_battery_overdue
36. elt_inspection_due
37. elt_inspection_overdue
38. fire_extinguisher_service_due
39. life_vest_equipment_review
40. oxygen_bottle_inspection_due

### F. Engine / Prop / Component Time Reminders (41-50)
41. engine_overhaul_review_due
42. propeller_overhaul_review_due
43. engine_time_limit_due
44. prop_time_limit_due
45. component_replacement_due
46. oil_change_due
47. oil_change_overdue
48. magneto_inspection_due
49. spark_plug_service_due
50. hose_ageout_due

### G. Maintenance / Discrepancy / Squawk Reminders (51-57)
51. open_discrepancy_followup
52. deferred_maintenance_review
53. unresolved_squawk_review
54. maintenance_grounding_status
55. return_to_service_missing
56. missing_signoff_review
57. missing_ap_ia_cert_review

### H. Operational / Usage-Based Reminders (58-65)
58. tach_sync_stale
59. hobbs_sync_stale
60. aircraft_usage_conflict_review
61. inspection_due_by_tach
62. inspection_due_by_hobbs
63. recurring_event_due_by_usage
64. provider_connection_failed
65. provider_sync_stale

### I. Custom / Org Configurable Reminders (66-70)
66. org_custom_date_due
67. org_custom_tach_due
68. org_custom_hobbs_due
69. org_custom_document_review
70. org_custom_compliance_check

## Activation Rule Families
- **date_based:** activate when known due date approaches lead threshold
- **tach_based:** activate when remaining hours <= configured lead window
- **hobbs_based:** same as tach-based but from hobbs source
- **recurring_document_event:** activate when recognized event exists and next due can be derived
- **ad_based:** activate when AD is applicable and compliance state is unknown/due/overdue/recurring
- **sync_health_based:** activate when provider connection fails or no sync received within stale threshold
- **review_required:** activate when evidence conflict exists, signoff incomplete, missing cert data

## Completion / Closure Rules
A reminder can only auto-close when deterministic evidence supports closure:
- Annual inspection reminder closes when newer annual inspection evidence is found
- 100-hour reminder closes when newer 100-hour signoff evidence is found
- AD reminder closes only when compliance evidence is matched
- ELT battery reminder closes when battery replacement evidence with next due basis is found

If evidence is ambiguous: do NOT auto-close → create review task → keep reminder in uncertain state

## Due Calculation Logic
- **Date calculators:** annual recurrence, fixed expiration date, lead-day windows, overdue windows
- **Usage calculators:** due at tach threshold, due at hobbs threshold, rolling interval from last evidence
- **Hybrid calculators:** whichever comes first (date or usage), org-specific preference if configured

## Rule Engine Requirements
- Idempotent, re-runnable, event-triggered, batch-capable, explainable
- Triggers: aircraft created/updated, document uploaded/processed, maintenance entry created, integration sync completed, FAA AD sync completed, nightly scheduled recompute
- Every rule run must log: why it ran, inputs used, result, reminder ids created/updated/closed, uncertainty flags

## Aircraft Page Experience
Show reminder summary cards grouped by:
- due soon | overdue | review required | completed recently | inactive/suppressed
- Sections: inspections | ADs | registration/docs | avionics/IFR | ELT/safety | engine/prop | sync/integration health | custom

Each reminder shows: why it exists, what source triggered it, due date/tach/hobbs, evidence snippet, source document/provider, confidence, link to underlying page
