// Shared TypeScript types for myaircraft.us

export type Plan = 'starter' | 'pro' | 'fleet' | 'enterprise'
export type OrgRole = 'owner' | 'admin' | 'mechanic' | 'viewer' | 'auditor'
export type ParsingStatus =
  | 'queued'
  | 'parsing'
  | 'chunking'
  | 'embedding'
  | 'completed'
  | 'failed'
  | 'needs_ocr'
  | 'ocr_processing'
export type DocType =
  | 'logbook'
  | 'poh'
  | 'afm'
  | 'afm_supplement'
  | 'maintenance_manual'
  | 'service_manual'
  | 'parts_catalog'
  | 'service_bulletin'
  | 'airworthiness_directive'
  | 'work_order'
  | 'inspection_report'
  | 'form_337'
  | 'form_8130'
  | 'lease_ownership'
  | 'insurance'
  | 'compliance'
  | 'miscellaneous'
export type QueryConfidence = 'high' | 'medium' | 'low' | 'insufficient_evidence'
export type SourceProvider = 'direct_upload' | 'google_drive'

export interface Organization {
  id: string
  name: string
  slug: string
  plan: Plan
  plan_aircraft_limit: number
  plan_storage_gb: number
  plan_queries_monthly: number
  queries_used_this_month: number
  queries_reset_at: string
  stripe_customer_id?: string
  stripe_subscription_id?: string
  logo_url?: string
  created_at: string
  updated_at: string
}

export interface UserProfile {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
  job_title?: string
  is_platform_admin?: boolean
  created_at: string
  updated_at: string
}

export interface OrganizationMembership {
  id: string
  organization_id: string
  user_id: string
  role: OrgRole
  invited_by?: string
  invited_at: string
  accepted_at?: string
}

export interface Aircraft {
  id: string
  organization_id: string
  tail_number: string
  serial_number?: string
  make: string
  model: string
  year?: number
  engine_make?: string
  engine_model?: string
  engine_serial?: string
  prop_make?: string
  prop_model?: string
  prop_serial?: string
  avionics_notes?: string
  base_airport?: string
  operator_name?: string
  notes?: string
  total_time_hours?: number
  is_archived: boolean
  created_by?: string
  created_at: string
  updated_at: string
}

export interface Document {
  id: string
  organization_id: string
  aircraft_id?: string
  title: string
  doc_type: DocType
  description?: string
  file_path: string
  file_name: string
  file_size_bytes?: number
  mime_type: string
  checksum_sha256?: string
  page_count?: number
  parsing_status: ParsingStatus
  parse_error?: string
  parse_started_at?: string
  parse_completed_at?: string
  is_text_native?: boolean
  ocr_required: boolean
  source_provider: SourceProvider
  gdrive_file_id?: string
  gdrive_file_url?: string
  gdrive_parent_folder?: string
  document_date?: string
  revision?: string
  version_number: number
  supersedes_id?: string
  uploaded_by?: string
  uploaded_at: string
  updated_at: string
}

export interface DocumentChunk {
  id: string
  document_id: string
  organization_id: string
  aircraft_id?: string
  page_number: number
  page_number_end?: number
  chunk_index: number
  section_title?: string
  parent_section?: string
  chunk_text: string
  token_count?: number
  char_count?: number
  parser_confidence?: number
  metadata_json: Record<string, unknown>
  created_at: string
}

export interface Query {
  id: string
  organization_id: string
  aircraft_id?: string
  user_id?: string
  question: string
  answer?: string
  confidence: QueryConfidence
  confidence_score?: number
  doc_types_searched?: DocType[]
  chunks_retrieved?: number
  chunks_used?: number
  model_used?: string
  tokens_prompt?: number
  tokens_completion?: number
  latency_ms?: number
  warning_flags?: string[]
  follow_up_questions?: string[]
  is_bookmarked: boolean
  user_feedback?: 'helpful' | 'not_helpful' | 'partially_helpful'
  created_at: string
}

export interface Citation {
  id: string
  query_id: string
  organization_id: string
  document_id: string
  chunk_id?: string
  page_number: number
  section_title?: string
  quoted_snippet: string
  relevance_score?: number
  citation_index: number
  created_at: string
}

export interface MaintenanceEvent {
  id: string
  organization_id: string
  aircraft_id: string
  document_id?: string
  source_page?: number
  event_date?: string
  event_type?: string
  description?: string
  mechanic_name?: string
  mechanic_cert?: string
  shop_name?: string
  airframe_tt?: number
  tach_time?: number
  parts_replaced?: Record<string, unknown>
  ad_reference?: string
  sb_reference?: string
  raw_text?: string
  confidence?: number
  is_verified: boolean
  created_at: string
}

export interface GdriveConnection {
  id: string
  organization_id: string
  user_id: string
  google_email?: string
  scopes?: string[]
  is_active: boolean
  created_at: string
  updated_at: string
}

// RAG types
export interface RetrievedChunk {
  chunk_id: string
  document_id: string
  document_title: string
  doc_type: DocType
  aircraft_id?: string
  aircraft_tail?: string
  page_number: number
  page_number_end?: number
  section_title?: string
  chunk_text: string
  metadata_json: Record<string, unknown>
  vector_score: number
  keyword_score: number
  combined_score: number
}

export interface AnswerCitation {
  chunkId: string
  documentId: string
  documentTitle: string
  docType: DocType
  pageNumber: number
  sectionTitle?: string
  snippet: string
  relevanceScore: number
}

export interface AnswerResult {
  answer: string
  confidence: QueryConfidence
  confidenceScore: number
  citations: AnswerCitation[]
  citedChunkIds: string[]
  warningFlags: string[]
  followUpQuestions: string[]
  tokensPrompt: number
  tokensCompletion: number
}

// UI types
export interface NavItem {
  label: string
  href: string
  icon?: React.ComponentType<{ className?: string }>
  badge?: string | number
}

export interface FileUploadItem {
  file: File
  id: string
  aircraftId?: string
  docType: DocType
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error'
  progress: number
  error?: string
  documentId?: string
}

export type ReminderType = 'annual' | '100hr' | 'transponder' | 'elt' | 'static_pitot' | 'vor' | 'ad_compliance' | 'ad_due' | 'ad_overdue' | 'custom'
export type ReminderStatus = 'active' | 'snoozed' | 'dismissed' | 'completed'
export type ReminderPriority = 'low' | 'normal' | 'high' | 'critical'
export type ADComplianceStatus = 'compliant' | 'non_compliant' | 'unknown' | 'overdue'
export type IntegrationProvider = 'flight_schedule_pro' | 'flight_circle' | 'myfbo' | 'avianis' | 'fl3xx' | 'leon' | 'talon'
export type ExtractionStatus = 'pending' | 'processing' | 'extracted' | 'needs_review' | 'approved' | 'rejected'
export type PageClassification = 'engine_log' | 'airframe_log' | 'prop_log' | 'maintenance_entry' | 'work_order' | 'ad_compliance' | 'cover' | 'blank' | 'unknown'

export interface Reminder {
  id: string
  organization_id: string
  aircraft_id: string
  reminder_type: ReminderType
  title: string
  description?: string
  status: ReminderStatus
  priority: ReminderPriority
  due_date?: string
  due_hours?: number
  current_hours?: number
  hours_remaining?: number
  days_remaining?: number
  auto_generated: boolean
  created_at: string
  updated_at: string
}

export interface FAADirective {
  id: string
  ad_number: string
  title?: string
  aircraft_make?: string
  aircraft_model?: string
  effective_date?: string
  compliance_date?: string
  compliance_description?: string
  recurring: boolean
  recurring_interval_hours?: number
  source_url?: string
}

export interface AircraftADApplicability {
  id: string
  aircraft_id: string
  ad_number: string
  applicability_status: string
  compliance_status: ADComplianceStatus
  last_compliance_date?: string
  next_due_date?: string
  manually_overridden: boolean
  faa_airworthiness_directives?: FAADirective
}

export interface Integration {
  id: string
  organization_id: string
  provider: IntegrationProvider
  display_name: string
  status: string
  last_sync_at?: string
  last_sync_status?: string
  aircraft_count_synced: number
  created_at: string
}

export interface MaintenanceEntryDraft {
  id: string
  organization_id: string
  aircraft_id: string
  created_by: string
  title?: string
  entry_type?: string
  logbook_type?: string
  ai_prompt?: string
  ai_generated_text?: string
  edited_text?: string
  structured_fields?: Record<string, unknown>
  status: string
  signed_by?: string
  signed_at?: string
  created_at: string
  updated_at: string
}

export interface OCRPageJob {
  id: string
  document_id: string
  organization_id: string
  aircraft_id?: string
  page_number: number
  page_classification?: PageClassification
  classification_confidence?: number
  ocr_raw_text?: string
  ocr_confidence?: number
  extraction_status: ExtractionStatus
  needs_human_review: boolean
  review_reason?: string
  created_at: string
}

export interface OCRExtractedEvent {
  id: string
  document_id: string
  aircraft_id?: string
  page_number: number
  event_type?: string
  logbook_type?: string
  event_date?: string
  tach_time?: number
  airframe_tt?: number
  work_description?: string
  mechanic_name?: string
  mechanic_cert_number?: string
  ad_references?: string[]
  confidence_overall?: number
  review_status: string
  created_at: string
}

// ─── Work Order types ─────────────────────────────────────────────────────────

export type WorkOrderStatus =
  | 'draft'
  | 'open'
  | 'awaiting_approval'
  | 'awaiting_parts'
  | 'in_progress'
  | 'waiting_on_customer'
  | 'ready_for_signoff'
  | 'closed'
  | 'invoiced'
  | 'paid'
  | 'archived'

export type WorkOrderLineType = 'labor' | 'part' | 'outside_service' | 'discrepancy' | 'note'

export interface WorkOrder {
  id: string
  organization_id: string
  work_order_number: string
  aircraft_id: string | null
  customer_id: string | null
  thread_id: string | null
  assigned_mechanic_id: string | null
  status: WorkOrderStatus
  complaint: string | null
  discrepancy: string | null
  troubleshooting_notes: string | null
  findings: string | null
  corrective_action: string | null
  labor_total: number
  parts_total: number
  outside_services_total: number
  tax_amount: number
  total_amount: number
  internal_notes: string | null
  customer_visible_notes: string | null
  opened_at: string
  closed_at: string | null
  invoiced_at: string | null
  linked_invoice_id: string | null
  linked_logbook_entry_id: string | null
  created_at: string
  updated_at: string
  aircraft?: any
  customer?: any
  lines?: WorkOrderLine[]
}

export interface WorkOrderLine {
  id: string
  work_order_id: string
  line_type: WorkOrderLineType
  description: string
  quantity: number
  unit_price: number
  line_total: number
  part_number: string | null
  serial_number_removed: string | null
  serial_number_installed: string | null
  vendor: string | null
  condition: string | null
  status: string
  mechanic_id: string | null
  hours: number | null
  rate: number | null
  notes: string | null
  sort_order: number
  created_at: string
}
