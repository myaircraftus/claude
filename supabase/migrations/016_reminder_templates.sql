-- Reminder template catalog: seeded with 70 standard aviation reminder templates
-- Templates are inactive by default until evidence activates them per aircraft

CREATE TABLE IF NOT EXISTS reminder_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('inspection','ad','registration','avionics','elt_safety','engine_prop','maintenance','operational','custom')),
  subcategory TEXT,
  description TEXT,
  due_basis_type TEXT NOT NULL CHECK (due_basis_type IN ('date','tach','hobbs','hybrid','document_event','ad_based','sync_health','review_required')),
  activation_rule_type TEXT NOT NULL,
  completion_rule_type TEXT,
  recurrence_rule_type TEXT,
  default_lead_days INTEGER,
  default_lead_hours NUMERIC,
  severity_default TEXT NOT NULL DEFAULT 'normal' CHECK (severity_default IN ('low','normal','high','critical')),
  requires_review_on_activation BOOLEAN DEFAULT FALSE,
  requires_review_on_completion BOOLEAN DEFAULT FALSE,
  compliance_critical BOOLEAN DEFAULT FALSE,
  regulatory_reference TEXT,
  sort_order INTEGER DEFAULT 0,
  is_seeded BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS reminder_templates_category_idx ON reminder_templates(category);
CREATE INDEX IF NOT EXISTS reminder_templates_code_idx ON reminder_templates(code);
CREATE INDEX IF NOT EXISTS reminder_templates_compliance_critical_idx ON reminder_templates(compliance_critical);

-- Seed the master template catalog

-- A. INSPECTION REMINDERS
INSERT INTO reminder_templates (code, title, category, due_basis_type, activation_rule_type, completion_rule_type, recurrence_rule_type, default_lead_days, severity_default, compliance_critical, regulatory_reference, sort_order) VALUES
('annual_inspection_due', 'Annual Inspection Due', 'inspection', 'date', 'document_or_manual', 'newer_annual_evidence', 'annual', 30, 'high', TRUE, '14 CFR 91.409', 1),
('annual_inspection_overdue', 'Annual Inspection Overdue', 'inspection', 'date', 'date_overdue', 'newer_annual_evidence', NULL, 0, 'critical', TRUE, '14 CFR 91.409', 2),
('hundred_hour_inspection_due', '100-Hour Inspection Due', 'inspection', 'tach', 'tach_threshold', 'newer_100hr_evidence', 'recurring_tach', 10, 'high', TRUE, '14 CFR 91.409', 3),
('hundred_hour_inspection_overdue', '100-Hour Inspection Overdue', 'inspection', 'tach', 'tach_overdue', 'newer_100hr_evidence', NULL, 0, 'critical', TRUE, '14 CFR 91.409', 4),
('progressive_inspection_phase_due', 'Progressive Inspection Phase Due', 'inspection', 'date', 'document_or_manual', 'phase_completion_evidence', NULL, 14, 'high', TRUE, '14 CFR 91.409(d)', 5),
('prebuy_records_review', 'Prebuy Records Review Pending', 'inspection', 'review_required', 'manual', 'manual_close', NULL, 0, 'normal', FALSE, NULL, 6),
('return_to_service_document_review', 'Return to Service Document Review', 'inspection', 'review_required', 'document_event', 'manual_close', NULL, 0, 'high', TRUE, '14 CFR 43.9', 7),

-- B. AD REMINDERS
('ad_applicability_review_required', 'AD Applicability Review Required', 'ad', 'review_required', 'ad_based', 'ad_compliance_confirmed', NULL, 0, 'high', TRUE, '14 CFR 39', 10),
('ad_unknown_compliance', 'AD Compliance Status Unknown', 'ad', 'review_required', 'ad_based', 'ad_compliance_confirmed', NULL, 0, 'high', TRUE, '14 CFR 39', 11),
('ad_due_soon', 'Airworthiness Directive Due Soon', 'ad', 'hybrid', 'ad_based', 'ad_compliance_evidence', NULL, 30, 'high', TRUE, '14 CFR 39', 12),
('ad_overdue', 'Airworthiness Directive Overdue', 'ad', 'hybrid', 'ad_overdue', 'ad_compliance_evidence', NULL, 0, 'critical', TRUE, '14 CFR 39', 13),
('recurring_ad_reinspection_due', 'Recurring AD Reinspection Due', 'ad', 'hybrid', 'ad_based', 'ad_compliance_evidence', 'recurring_per_ad', 14, 'high', TRUE, '14 CFR 39', 14),
('ad_evidence_conflict_review', 'AD Evidence Conflict — Review Required', 'ad', 'review_required', 'evidence_conflict', 'manual_close', NULL, 0, 'critical', TRUE, '14 CFR 39', 15),

-- C. REGISTRATION / CERTIFICATE / DOCUMENT REMINDERS
('registration_expiration_due', 'Aircraft Registration Expiring', 'registration', 'date', 'document_or_faa_registry', 'newer_registration_evidence', 'triennial', 60, 'high', FALSE, '14 CFR 47.40', 18),
('registration_expiration_overdue', 'Aircraft Registration Expired', 'registration', 'date', 'date_overdue', 'newer_registration_evidence', NULL, 0, 'critical', TRUE, '14 CFR 47.40', 19),
('airworthiness_document_review', 'Airworthiness Document Review', 'registration', 'review_required', 'manual', 'manual_close', NULL, 0, 'high', TRUE, '14 CFR 91.203', 20),
('insurance_expiration_due', 'Aircraft Insurance Expiring', 'registration', 'date', 'document_or_manual', 'newer_insurance_evidence', 'annual', 30, 'normal', FALSE, NULL, 21),
('weight_and_balance_review_due', 'Weight and Balance Review Due', 'registration', 'review_required', 'document_event', 'manual_close', NULL, 0, 'normal', TRUE, '14 CFR 23.25', 22),

-- D. AVIONICS / IFR / CHECK REMINDERS
('transponder_inspection_due', 'Transponder Inspection Due', 'avionics', 'date', 'document_or_manual', 'newer_transponder_inspection', 'biennial', 30, 'high', TRUE, '14 CFR 91.413', 25),
('transponder_inspection_overdue', 'Transponder Inspection Overdue', 'avionics', 'date', 'date_overdue', 'newer_transponder_inspection', NULL, 0, 'critical', TRUE, '14 CFR 91.413', 26),
('static_system_inspection_due', 'Static System Inspection Due', 'avionics', 'date', 'document_or_manual', 'newer_static_inspection', 'biennial', 30, 'high', TRUE, '14 CFR 91.411', 27),
('static_system_inspection_overdue', 'Static System Inspection Overdue', 'avionics', 'date', 'date_overdue', 'newer_static_inspection', NULL, 0, 'critical', TRUE, '14 CFR 91.411', 28),
('altimeter_inspection_due', 'Altimeter Inspection Due', 'avionics', 'date', 'document_or_manual', 'newer_altimeter_inspection', 'biennial', 30, 'high', TRUE, '14 CFR 91.411', 29),
('vor_check_due', 'VOR Check Due', 'avionics', 'date', 'document_or_manual', 'newer_vor_check', 'recurring_30d', 7, 'normal', FALSE, '14 CFR 91.171', 30),

-- E. ELT / SAFETY EQUIPMENT REMINDERS
('elt_battery_due', 'ELT Battery Replacement Due', 'elt_safety', 'date', 'document_or_manual', 'newer_elt_battery_evidence', 'annual', 30, 'high', TRUE, '14 CFR 91.207', 34),
('elt_battery_overdue', 'ELT Battery Replacement Overdue', 'elt_safety', 'date', 'date_overdue', 'newer_elt_battery_evidence', NULL, 0, 'critical', TRUE, '14 CFR 91.207', 35),
('elt_inspection_due', 'ELT Annual Inspection Due', 'elt_safety', 'date', 'document_or_manual', 'newer_elt_inspection', 'annual', 30, 'high', TRUE, '14 CFR 91.207', 36),
('fire_extinguisher_service_due', 'Fire Extinguisher Service Due', 'elt_safety', 'date', 'document_or_manual', 'newer_extinguisher_service', 'annual', 30, 'normal', FALSE, NULL, 38),
('oxygen_bottle_inspection_due', 'Oxygen Bottle Inspection Due', 'elt_safety', 'date', 'document_or_manual', 'manual_close', NULL, 30, 'normal', FALSE, NULL, 40),

-- F. ENGINE / PROP / COMPONENT TIME REMINDERS
('engine_overhaul_review_due', 'Engine Overhaul Review Due', 'engine_prop', 'tach', 'tach_threshold', 'newer_overhaul_evidence', NULL, 50, 'high', FALSE, NULL, 41),
('propeller_overhaul_review_due', 'Propeller Overhaul Review Due', 'engine_prop', 'tach', 'tach_threshold', 'newer_prop_overhaul_evidence', NULL, 25, 'high', FALSE, NULL, 42),
('oil_change_due', 'Oil Change Due', 'engine_prop', 'hybrid', 'tach_threshold', 'newer_oil_change_evidence', 'recurring_tach', 5, 'normal', FALSE, NULL, 46),
('oil_change_overdue', 'Oil Change Overdue', 'engine_prop', 'hybrid', 'tach_overdue', 'newer_oil_change_evidence', NULL, 0, 'high', FALSE, NULL, 47),
('magneto_inspection_due', 'Magneto Inspection Due', 'engine_prop', 'tach', 'tach_threshold', 'newer_mag_inspection', 'recurring_tach', 10, 'normal', FALSE, NULL, 48),
('spark_plug_service_due', 'Spark Plug Service Due', 'engine_prop', 'tach', 'tach_threshold', 'newer_plug_service', 'recurring_tach', 10, 'normal', FALSE, NULL, 49),
('hose_ageout_due', 'Engine Hose Age-Out Due', 'engine_prop', 'date', 'document_or_manual', 'newer_hose_replacement', NULL, 60, 'normal', FALSE, NULL, 50),

-- G. MAINTENANCE / DISCREPANCY / SQUAWK REMINDERS
('open_discrepancy_followup', 'Open Discrepancy Follow-Up Required', 'maintenance', 'review_required', 'document_event', 'discrepancy_resolved', NULL, 0, 'high', TRUE, NULL, 51),
('deferred_maintenance_review', 'Deferred Maintenance Review Required', 'maintenance', 'review_required', 'document_event', 'maintenance_completed', NULL, 0, 'high', FALSE, NULL, 52),
('unresolved_squawk_review', 'Unresolved Squawk Review', 'maintenance', 'review_required', 'document_event', 'squawk_resolved', NULL, 0, 'high', FALSE, NULL, 53),
('missing_signoff_review', 'Missing Signoff — Review Required', 'maintenance', 'review_required', 'extraction_incomplete', 'manual_close', NULL, 0, 'critical', TRUE, '14 CFR 43.9', 56),
('missing_ap_ia_cert_review', 'Missing A&P/IA Certificate Info', 'maintenance', 'review_required', 'extraction_incomplete', 'manual_close', NULL, 0, 'high', TRUE, '14 CFR 43.9', 57),

-- H. OPERATIONAL / USAGE-BASED REMINDERS
('tach_sync_stale', 'Tach Time Not Synced Recently', 'operational', 'sync_health', 'sync_health_based', 'sync_restored', NULL, 0, 'normal', FALSE, NULL, 58),
('hobbs_sync_stale', 'Hobbs Time Not Synced Recently', 'operational', 'sync_health', 'sync_health_based', 'sync_restored', NULL, 0, 'normal', FALSE, NULL, 59),
('provider_connection_failed', 'Integration Provider Connection Failed', 'operational', 'sync_health', 'sync_health_based', 'connection_restored', NULL, 0, 'normal', FALSE, NULL, 64),
('provider_sync_stale', 'Integration Sync Overdue', 'operational', 'sync_health', 'sync_health_based', 'sync_restored', NULL, 0, 'normal', FALSE, NULL, 65),

-- I. CUSTOM / ORG CONFIGURABLE REMINDERS
('org_custom_date_due', 'Custom Date-Based Reminder', 'custom', 'date', 'manual', 'manual_close', NULL, 14, 'normal', FALSE, NULL, 66),
('org_custom_tach_due', 'Custom Tach-Based Reminder', 'custom', 'tach', 'manual', 'manual_close', NULL, 0, 'normal', FALSE, NULL, 67),
('org_custom_hobbs_due', 'Custom Hobbs-Based Reminder', 'custom', 'hobbs', 'manual', 'manual_close', NULL, 0, 'normal', FALSE, NULL, 68),
('org_custom_document_review', 'Custom Document Review', 'custom', 'review_required', 'manual', 'manual_close', NULL, 0, 'normal', FALSE, NULL, 69),
('org_custom_compliance_check', 'Custom Compliance Check', 'custom', 'review_required', 'manual', 'manual_close', NULL, 0, 'normal', FALSE, NULL, 70);
