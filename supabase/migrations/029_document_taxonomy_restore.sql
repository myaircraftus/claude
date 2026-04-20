-- Migration 029: Restore structured aircraft document taxonomy metadata

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS document_group_id TEXT,
  ADD COLUMN IF NOT EXISTS document_detail_id TEXT,
  ADD COLUMN IF NOT EXISTS document_subtype TEXT;

CREATE INDEX IF NOT EXISTS idx_documents_group_detail
  ON documents(organization_id, document_group_id, document_detail_id);

UPDATE documents
SET
  document_group_id = CASE doc_type
    WHEN 'logbook' THEN 'aircraft_logbooks_and_permanent_records'
    WHEN 'poh' THEN 'flight_crew_and_operating_documents'
    WHEN 'afm' THEN 'flight_crew_and_operating_documents'
    WHEN 'afm_supplement' THEN 'flight_crew_and_operating_documents'
    WHEN 'maintenance_manual' THEN 'maintenance_program_and_inspection_records'
    WHEN 'service_manual' THEN 'maintenance_program_and_inspection_records'
    WHEN 'parts_catalog' THEN 'maintenance_program_and_inspection_records'
    WHEN 'service_bulletin' THEN 'ad_sb_and_service_information'
    WHEN 'airworthiness_directive' THEN 'ad_sb_and_service_information'
    WHEN 'work_order' THEN 'work_orders_and_shop_records'
    WHEN 'inspection_report' THEN 'maintenance_program_and_inspection_records'
    WHEN 'form_337' THEN 'airworthiness_and_certification'
    WHEN 'form_8130' THEN 'airworthiness_and_certification'
    WHEN 'lease_ownership' THEN 'legal_and_ownership'
    WHEN 'insurance' THEN 'insurance_finance_and_commercial_records'
    WHEN 'compliance' THEN 'recurring_compliance_and_required_checks'
    ELSE 'digital_records_ai_and_internal_intelligence_files'
  END,
  document_detail_id = CASE doc_type
    WHEN 'logbook' THEN 'historical_logbook_scans'
    WHEN 'poh' THEN 'pilot_s_operating_handbook_poh'
    WHEN 'afm' THEN 'airplane_flight_manual_afm'
    WHEN 'afm_supplement' THEN 'approved_flight_manual_supplements'
    WHEN 'maintenance_manual' THEN 'maintenance_manual'
    WHEN 'service_manual' THEN 'service_manual'
    WHEN 'parts_catalog' THEN 'parts_catalog'
    WHEN 'service_bulletin' THEN 'service_bulletins'
    WHEN 'airworthiness_directive' THEN 'ad_compliance_records'
    WHEN 'work_order' THEN 'maintenance_work_orders'
    WHEN 'inspection_report' THEN 'inspection_program_documents'
    WHEN 'form_337' THEN 'faa_form_337_records'
    WHEN 'form_8130' THEN 'faa_form_8130_documents'
    WHEN 'lease_ownership' THEN 'certificate_of_aircraft_registration'
    WHEN 'insurance' THEN 'insurance_policies'
    WHEN 'compliance' THEN 'updated_weight_and_balance_records'
    ELSE 'master_document_register'
  END
WHERE document_group_id IS NULL
   OR document_detail_id IS NULL;

ALTER TABLE scan_batches
  ADD COLUMN IF NOT EXISTS document_group_id TEXT,
  ADD COLUMN IF NOT EXISTS document_detail_id TEXT,
  ADD COLUMN IF NOT EXISTS document_subtype TEXT;

CREATE INDEX IF NOT EXISTS idx_scan_batches_group_detail
  ON scan_batches(organization_id, document_group_id, document_detail_id);

UPDATE scan_batches
SET
  document_group_id = CASE batch_type
    WHEN 'airframe_logbook' THEN 'aircraft_logbooks_and_permanent_records'
    WHEN 'engine_logbook' THEN 'aircraft_logbooks_and_permanent_records'
    WHEN 'prop_logbook' THEN 'aircraft_logbooks_and_permanent_records'
    WHEN 'avionics_logbook' THEN 'aircraft_logbooks_and_permanent_records'
    WHEN 'work_order_batch' THEN 'work_orders_and_shop_records'
    WHEN 'discrepancy_batch' THEN 'work_orders_and_shop_records'
    ELSE document_group_id
  END,
  document_detail_id = CASE batch_type
    WHEN 'airframe_logbook' THEN 'airframe_logbooks'
    WHEN 'engine_logbook' THEN 'engine_logbooks'
    WHEN 'prop_logbook' THEN 'propeller_logbooks'
    WHEN 'avionics_logbook' THEN 'avionics_logbooks'
    WHEN 'work_order_batch' THEN 'maintenance_work_orders'
    WHEN 'discrepancy_batch' THEN 'discrepancy_lists'
    ELSE document_detail_id
  END
WHERE (document_group_id IS NULL OR document_detail_id IS NULL)
  AND batch_type IN (
    'airframe_logbook',
    'engine_logbook',
    'prop_logbook',
    'avionics_logbook',
    'work_order_batch',
    'discrepancy_batch'
  );
