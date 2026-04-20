// Scanner system shared types

export type BatchType =
  | 'engine_logbook'
  | 'prop_logbook'
  | 'airframe_logbook'
  | 'avionics_logbook'
  | 'work_order_batch'
  | 'discrepancy_batch'
  | 'general_records'
  | 'evidence_batch'
  | 'unknown'

export type BatchSourceMode = 'batch' | 'evidence'

export type BatchStatus =
  | 'capturing'
  | 'submitted'
  | 'uploading'
  | 'assembled'
  | 'processing'
  | 'review'
  | 'completed'
  | 'failed'
  | 'abandoned'

export type PageUploadStatus = 'pending' | 'uploading' | 'uploaded' | 'failed'

export type PageProcessingStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'review_required'

export type PageCaptureClassification =
  | 'logbook_entry'
  | 'work_order'
  | 'estimate'
  | 'annual_inspection'
  | '50hr_inspection'
  | '100hr_inspection'
  | 'ad_record'
  | 'service_bulletin'
  | 'yellow_tag'
  | 'form_337'
  | 'form_8130'
  | 'squawk_discrepancy'
  | 'discrepancy_sheet'
  | 'invoice'
  | 'weight_balance'
  | 'poh_afm_supplement'
  | 'part_trace_conformity'
  | 'photo_evidence'
  | 'stc_reference'
  | 'informational'
  | 'unknown'

export type EvidenceType =
  | 'work_order'
  | 'handwritten_entry'
  | 'yellow_tag'
  | 'form_337'
  | 'form_8130'
  | 'discrepancy_sheet'
  | 'invoice'
  | 'signed_statement'
  | 'general'

export type EvidenceStorageTarget =
  | 'airframe_log'
  | 'engine_log'
  | 'prop_log'
  | 'avionics_log'
  | 'work_order'
  | 'discrepancy'
  | 'invoice_support'
  | 'general_records'
  | 'unknown_review'

export type EvidenceSuggestedAction =
  | 'generate_logbook_entry'
  | 'attach_to_work_order'
  | 'create_invoice_draft'
  | 'create_reminder'
  | 'informational_only'

export interface CaptureWarning {
  kind: 'blur' | 'glare' | 'skew' | 'low_light' | 'cropped' | 'unknown'
  detail?: string
}

export interface QualityResult {
  score: number        // 0..1 (higher is better)
  warnings: string[]   // e.g. ['blur','glare']
}

export interface ScanBatch {
  id: string
  organization_id: string
  aircraft_id: string | null
  scanner_user_id: string | null
  session_id: string | null
  batch_type: BatchType
  source_mode: BatchSourceMode
  document_group_id: string | null
  document_detail_id: string | null
  document_subtype: string | null
  record_family: string | null
  document_class: string | null
  truth_role: string | null
  parser_strategy: string | null
  review_priority: string | null
  canonical_eligibility: boolean | null
  reminder_relevance: boolean | null
  ad_relevance: boolean | null
  inspection_relevance: boolean | null
  completeness_relevance: boolean | null
  intelligence_tags: string[] | null
  title: string | null
  notes: string | null
  page_count: number
  batch_pdf_path: string | null
  document_id: string | null
  status: BatchStatus
  submitted_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}
