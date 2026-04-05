// Scanner system shared types

export type BatchType = 'historical_logbook' | 'work_order' | 'discrepancy' | 'general_records' | 'unknown'
export type BatchSourceMode = 'batch' | 'evidence'
export type BatchStatus =
  | 'capturing'
  | 'submitted'
  | 'processing'
  | 'processed'
  | 'review_required'
  | 'processing_failed'
  | 'archived'
export type PageUploadStatus = 'pending' | 'uploading' | 'uploaded' | 'failed'
export type PageProcessingStatus = 'queued' | 'processing' | 'processed' | 'failed' | 'skipped'

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
