// Shared TypeScript types for myaircraft.us

export type Plan = 'starter' | 'pro' | 'fleet' | 'enterprise'
export type OrgRole = 'owner' | 'admin' | 'mechanic' | 'pilot' | 'viewer' | 'auditor'
export type ParsingStatus =
  | 'queued'
  | 'parsing'
  | 'chunking'
  | 'embedding'
  | 'completed'
  | 'failed'
  | 'needs_ocr'
  | 'ocr_processing'
export type DocumentProcessingStage =
  | 'uploaded'
  | 'native_text_probe'
  | 'document_ai_ocr'
  | 'ocr_fallback'
  | 'field_extraction'
  | 'chunking'
  | 'embedding'
  | 'completed'
  | 'needs_review'
  | 'failed'
export type DocumentProcessingStageStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
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
export type UploaderRole = 'owner' | 'mechanic' | 'admin' | 'pilot'
export type ManualAccess = 'private' | 'free' | 'paid'
export type BookAssignment = 'historical' | 'present'
export type ListingStatus = 'draft' | 'pending_review' | 'published' | 'rejected'
export type Visibility = 'private' | 'team'

export interface DocumentProcessingStageSnapshot {
  status: DocumentProcessingStageStatus
  engine?: string | null
  started_at?: string | null
  completed_at?: string | null
  message?: string | null
  current_batch?: number | null
  total_batches?: number | null
  page_count?: number | null
}

export interface DocumentProcessingState {
  current_stage: DocumentProcessingStage
  current_engine?: string | null
  page_count?: number | null
  current_batch?: number | null
  total_batches?: number | null
  last_error?: string | null
  started_at?: string | null
  updated_at?: string | null
  stages?: Partial<Record<DocumentProcessingStage, DocumentProcessingStageSnapshot>>
}

/**
 * Org persona / business type from Spec 0.1. Drives default surface choice
 * (a "shop" org defaults to mechanic persona, "owner" defaults to owner, etc.)
 * — actual persona switching still lives in `Membership.persona`.
 */
export type OrgType = 'owner' | 'shop' | 'flight-school' | 'fbo' | 'operator'

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
  /** Spec 0.1: owner | shop | flight-school | fbo | operator. */
  org_type?: OrgType | null
  /** Primary airport ICAO/IATA (e.g. "KAPA"). */
  home_base?: string | null
  /** Billing contact email. */
  billing_email?: string | null
  current_integration?: string
  integration_flags?: Record<string, unknown>
  created_at: string
  updated_at: string
}

/**
 * Location: org-scoped physical space (hangar, tie-down, ramp, shop, office).
 * Hierarchical via `parent_location_id` so an org can model: airport → hangar → bay.
 *
 * Per Spec 0.1, every primary entity (aircraft, WO, invoice, logbook, customer,
 * document) gets an optional `location_id`. Records without a location are
 * "org-wide" — list views should still show them under "All locations".
 */
export type LocationType = 'hangar' | 'tie-down' | 'ramp' | 'shop' | 'office'

export interface Location {
  id: string
  organization_id: string
  name: string
  airport_code?: string | null
  location_type: LocationType
  address?: string | null
  parent_location_id?: string | null
  created_at: string
  updated_at: string
}

export interface UserProfile {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
  job_title?: string
  phone?: string
  cert_number?: string
  persona?: 'owner' | 'mechanic'
  onboarding_completed_at?: string
  onboarding_context?: Record<string, unknown>
  is_platform_admin?: boolean
  created_at: string
  updated_at: string
}

/**
 * Persona that drives UI rendering. The same user in the same org can flip
 * between `owner` and `mechanic` — Feature 0.2 (Persona system) wires the
 * actual switcher; this column has existed since migration 047.
 *
 * `shop` is reserved for Phase 5 — the shop-wide foreman view. Not yet
 * surfaced in the persona switcher.
 *
 * `admin` was added by the Operations Hub work for the platform-admin
 * sidebar gate — see AppLayout.tsx admin section. Per-membership
 * persona switching still only exposes owner / mechanic; admin is
 * derived from `user_profiles.is_platform_admin` rather than a
 * membership column.
 */
export type Persona = 'owner' | 'mechanic' | 'shop' | 'admin'

export interface OrganizationMembership {
  id: string
  organization_id: string
  user_id: string
  role: OrgRole
  /** Persona this membership defaults to in the UI (Spec 0.1 / 0.2). */
  persona?: Persona | null
  invited_by?: string
  invited_at: string
  accepted_at?: string
}

export interface Aircraft {
  id: string
  organization_id: string
  /** Spec 0.1: optional location within the org (nullable). */
  location_id?: string | null
  /** Spec 1.1: optional meter profile driving the aircraft's time tracking. */
  meter_profile_id?: string | null
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
  operation_type?: string
  operation_types?: string[]
  operation_context?: Record<string, unknown>
  suggested_document_categories?: string[]
  notes?: string
  total_time_hours?: number
  owner_customer_id?: string
  is_archived: boolean
  created_by?: string
  created_at: string
  updated_at: string
}

export interface Document {
  id: string
  organization_id: string
  /** Spec 0.1: optional location within the org (nullable). */
  location_id?: string | null
  aircraft_id?: string
  title: string
  doc_type: DocType
  document_group_id?: string
  document_detail_id?: string
  document_subtype?: string
  record_family?: string
  document_class?: string
  truth_role?: string
  parser_strategy?: string
  review_priority?: string
  canonical_eligibility?: boolean
  reminder_relevance?: boolean
  ad_relevance?: boolean
  inspection_relevance?: boolean
  completeness_relevance?: boolean
  intelligence_tags?: string[]
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
  processing_state?: DocumentProcessingState | null
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
  uploader_role?: UploaderRole
  uploader_name?: string
  allow_download?: boolean
  community_listing?: boolean
  manual_access?: ManualAccess
  marketplace_downloadable?: boolean
  marketplace_injectable?: boolean
  marketplace_preview_available?: boolean
  book_assignment?: BookAssignment
  book_id?: string
  book_number?: string
  book_type?: string
  scan_batch_id?: string
  price_cents?: number
  attestation_accepted?: boolean
  listing_status?: ListingStatus
  visibility?: Visibility
  download_count?: number
  uploaded_at: string
  updated_at: string
  aircraft?: { id: string; tail_number: string; make?: string; model?: string; year?: number } | null
  /* ─── Document Expiration & Reminders (Spec 2.6.2) — additive ─── */
  /** Which persona this expiring document belongs to. Distinct from uploader_role. */
  target_persona?: 'owner' | 'mechanic' | 'shop' | null
  /** Persona-specific regulatory category ("Insurance Policy", "A&P Certificate", …). */
  expiration_category?: string | null
  has_expiration?: boolean
  expiration_date?: string | null
  effective_date?: string | null
  /** [{offset_days: -30, channels: ['in-app','email']}, ...] */
  reminder_offsets?: Array<{ offset_days: number; channels?: string[] }>
  expiration_status?: 'current' | 'expiring-soon' | 'expired' | null
  issued_by?: string | null
  document_number?: string | null
  renewal_tracking_id?: string | null
}

/* ─── Document Expiration helpers (Spec 2.6.2) ──────────────────────────── */

export type ExpirationPersona = 'owner' | 'mechanic' | 'shop'
export type ExpirationStatus = 'current' | 'expiring-soon' | 'expired'

export interface ReminderOffsetSpec {
  /** Negative = before, positive = after. Spec uses "30 days before" → -30. */
  offset_days: number
  channels?: string[]
}

export const OWNER_DOC_CATEGORIES = [
  'Aircraft Registration',
  'Airworthiness Certificate',
  'Insurance Policy',
  'Lease Agreement',
  'Annual Inspection Sign-off',
  'Pilot Medical',
  'Flight Review (BFR)',
  'ELT Battery Certificate',
  'Transponder Cert',
  'Pitot-Static Cert',
  'VOR Check',
  'Other',
] as const

export const MECHANIC_DOC_CATEGORIES = [
  'A&P Certificate',
  'IA Authorization',
  'Repair Station Certificate',
  'Training Record',
  'Drug & Alcohol Compliance',
  'Hangar Lease',
  'Shop Insurance',
  'Tool Calibration Certificate',
  'Vendor Approval Letter',
  'Continuing Education',
  'OSHA Training',
  'Other',
] as const

export const SHOP_DOC_CATEGORIES = [
  'Business License',
  'Tax ID Letter',
  'EPA Permit',
  'Hazmat Storage Permit',
  'Workers Comp Policy',
  'Lease Agreement',
  'Service Contract',
  'Other',
] as const

export const DOC_CATEGORIES_BY_PERSONA: Record<ExpirationPersona, readonly string[]> = {
  owner: OWNER_DOC_CATEGORIES,
  mechanic: MECHANIC_DOC_CATEGORIES,
  shop: SHOP_DOC_CATEGORIES,
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
  page_number_end?: number
  section_title?: string
  quoted_snippet: string
  quoted_text?: string
  normalized_quoted_text?: string
  match_strategy?: string
  text_anchor_start?: number
  text_anchor_end?: number
  bounding_regions?: CitationBoundingRegion[]
  is_exact_anchor?: boolean
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
  truth_role?: string
  document_group_id?: string
  document_detail_id?: string
  completeness_relevance?: boolean
  document_date?: string
  uploaded_at?: string
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

export interface CitationBoundingRegion {
  page: number
  x: number
  y: number
  width: number
  height: number
  source?: string | null
  kind?: string | null
  confidence?: number | null
}

export interface AnswerCitation {
  chunkId: string
  documentId: string
  documentTitle: string
  docType: DocType
  pageNumber: number
  pageNumberEnd?: number
  sectionTitle?: string
  snippet: string
  quotedText?: string
  normalizedQuotedText?: string
  matchStrategy?: string
  textAnchorStart?: number | null
  textAnchorEnd?: number | null
  boundingRegions?: CitationBoundingRegion[]
  isExactAnchor?: boolean
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
  title: string
  visibility: 'private' | 'team'
  notes: string
  aircraftId?: string
  docType: DocType
  documentGroupId?: string
  documentDetailId?: string
  documentSubtype?: string
  documentDate?: string
  bookAssignmentType: BookAssignment
  manualAccess: ManualAccess
  price: string
  attestation: boolean
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error'
  progress: number
  error?: string
  documentId?: string
  processingState?: DocumentProcessingState | null
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
  activation_state?: 'canonical' | 'informational_only' | 'review_required' | 'ignore'
  activation_block_reason?: string
  evidence_document_id?: string
  evidence_segment_id?: string
  canonical_record_version_id?: string
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
  /** Spec 0.1: optional location within the org (nullable). */
  location_id?: string | null
  work_order_number: string
  aircraft_id: string | null
  customer_id: string | null
  thread_id: string | null
  assigned_mechanic_id: string | null
  status: WorkOrderStatus
  customer_complaint: string | null
  discrepancy: string | null
  troubleshooting_notes: string | null
  findings: string | null
  corrective_action: string | null
  labor_total: number
  parts_total: number
  outside_services_total: number
  tax_amount: number
  total: number
  internal_notes: string | null
  customer_notes: string | null
  opened_at: string
  closed_at: string | null
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

/* ─── Meter Profiles & Aircraft Times (Spec 1.1) ─────────────────────────── */

export type MeterUnit = 'hours' | 'cycles' | 'landings' | 'minutes' | 'starts'

export type MeterReadingSource = 'manual' | 'automatic' | 'imported'

/**
 * A meter profile is a *template* — bundles one or more meter definitions
 * (Hobbs, Tach, Cycles, …) so an aircraft can be assigned the right kit
 * with one selection. Profiles are org-scoped; meters within them are
 * stored as separate rows (see `MeterDefinition`) for clean cascades.
 */
export interface MeterProfile {
  id: string
  organization_id: string
  name: string
  description?: string | null
  is_template: boolean
  created_at: string
  updated_at: string
}

/**
 * A meter inside a profile. `decimal_places` is display precision (1 for
 * Hobbs/Tach, 0 for cycles/landings). `sort_order` controls render order
 * inside the profile.
 */
export interface MeterDefinition {
  id: string
  meter_profile_id: string
  name: string
  unit: MeterUnit
  decimal_places: number
  sort_order: number
  created_at: string
  updated_at: string
}

/**
 * Time-series row: "aircraft X had meter Y at value Z on date D". The
 * "current" reading for a meter is the latest row by (reading_date,
 * created_at). See lib/meters/current.ts:getCurrentMeterReading().
 */
export interface MeterReading {
  id: string
  organization_id: string
  aircraft_id: string
  meter_definition_id: string
  value: number
  reading_date: string
  source: MeterReadingSource
  notes?: string | null
  recorded_by?: string | null
  created_at: string
  updated_at: string
}

/* ─── Compliance / Maintenance Tracking (Spec 1.2) ───────────────────────── */

export type ComplianceItemType = 'inspection' | 'component'

export type ComplianceSource = 'AD' | 'SB' | 'Manufacturer' | 'Custom' | 'Life-Limited'

/**
 * A compliance item flips between four statuses:
 * - `current`   — not in the lookahead window
 * - `due-soon`  — within the configured lookahead (calendar OR hours)
 * - `overdue`   — past the next-due date / hours / cycles, beyond tolerance
 * - `deferred`  — explicitly held (manual override, e.g. waiting on parts)
 */
export type ComplianceStatus = 'current' | 'due-soon' | 'overdue' | 'deferred'

/**
 * Spec 1.2: recurring inspection or life-limited component.
 *
 * "Whichever-comes-first" semantics: ANY combination of
 * `interval_calendar_months` / `interval_hours` / `interval_cycles` can
 * be set. The recompute helper in `lib/compliance/compute.ts` derives
 * `next_due_*` and `status` from those + the most recent meter readings
 * (Sprint 1.1). The recompute fires on item insert/edit and after every
 * meter reading insert via the cross-wire in /api/meter-readings POST.
 */
export interface ComplianceItem {
  id: string
  organization_id: string
  aircraft_id: string
  title: string
  item_type: ComplianceItemType
  source: ComplianceSource
  source_reference?: string | null

  interval_calendar_months?: number | null
  interval_hours?: number | null
  interval_cycles?: number | null

  tolerance_calendar_days?: number | null
  tolerance_hours?: number | null

  last_completed_date?: string | null
  last_completed_hours?: number | null
  last_completed_cycles?: number | null

  /** Computed by lib/compliance/compute.ts. Null when no interval is set. */
  next_due_date?: string | null
  next_due_hours?: number | null
  next_due_cycles?: number | null

  status: ComplianceStatus
  requires_rii: boolean
  notes?: string | null
  linked_work_orders: string[]

  created_by?: string | null
  created_at: string
  updated_at: string
}

/* ─── Inspections + Procedures (Spec 1.3) ────────────────────────────────── */

export type ProcedureItemInputType =
  | 'checkbox'
  | 'pass-fail'
  | 'value'
  | 'photo'
  | 'signature'

export type InspectionStatus =
  | 'draft'
  | 'in-progress'
  | 'complete'
  | 'complete-requires-attention'

/**
 * Reusable inspection template ("Cessna 172 Annual Inspection"). Sections +
 * items live in their own tables so we get clean cascades, can FK from
 * inspection_results, and can rename items without breaking history.
 */
export interface Procedure {
  id: string
  organization_id: string
  name: string
  description?: string | null
  /** Make/model strings filter — empty = applies to anything in the org. */
  applies_to: string[]
  is_archived: boolean
  created_by?: string | null
  created_at: string
  updated_at: string
}

export interface ProcedureSection {
  id: string
  procedure_id: string
  title: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ProcedureItem {
  id: string
  procedure_section_id: string
  text: string
  input_type: ProcedureItemInputType
  reference?: string | null
  requires_photo: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

/**
 * An instance of running a procedure on an aircraft. Snapshot the procedure
 * name at creation so a later rename / delete doesn't lose context.
 *
 * `linked_work_order` (FK) and `linked_compliance_items` (UUID[]) cross-link
 * to Sprint 1.2 + the WO ecosystem. Status flips from in-progress to
 * complete (or complete-requires-attention if any item failed) on the
 * completion endpoint.
 */
export interface Inspection {
  id: string
  organization_id: string
  aircraft_id: string
  procedure_id: string
  procedure_name_snapshot?: string | null
  status: InspectionStatus
  assignee?: string | null
  due_date?: string | null
  start_date?: string | null
  completed_date?: string | null
  linked_work_order?: string | null
  linked_compliance_items: string[]
  notes?: string | null
  created_by?: string | null
  created_at: string
  updated_at: string
}

/**
 * Per-item result. `value` is JSONB so we can store string | boolean | number
 * without a discriminator column — frontend reads procedure_item.input_type
 * to interpret. UPSERT on (inspection_id, procedure_item_id) so saving a row
 * twice doesn't pile up history.
 */
export interface InspectionResult {
  id: string
  inspection_id: string
  procedure_item_id: string
  value: unknown
  passed?: boolean | null
  photo_urls: string[]
  comments?: string | null
  completed_by?: string | null
  completed_at?: string | null
  created_at: string
  updated_at: string
}

/* ─── Continued Items / Deferred Maintenance (Spec 1.4) ──────────────────── */

export type ContinuedItemStatus = 'open' | 'in-progress' | 'completed' | 'wont-fix'

export type ContinuedItemPriority = 'low' | 'medium' | 'high' | 'urgent'

/**
 * Found-but-deferred maintenance work. Discovered during one work order,
 * resolved (often) on a different one. The item follows the *aircraft*,
 * not the WO — `discovered_on_work_order` and `resolved_on_work_order`
 * are both nullable FKs with ON DELETE SET NULL so deleting old WOs
 * doesn't wipe the deferred item history.
 *
 * `related_compliance_item` optionally bridges to Sprint 1.2 (e.g. a
 * deferred AD compliance item that the operator is choosing to delay).
 */
export interface ContinuedItem {
  id: string
  organization_id: string
  aircraft_id: string
  description: string
  discovered_on_work_order?: string | null
  discovered_date: string
  discovered_by?: string | null
  status: ContinuedItemStatus
  priority: ContinuedItemPriority
  resolved_on_work_order?: string | null
  resolved_at?: string | null
  resolved_by?: string | null
  related_compliance_item?: string | null
  notes?: string | null
  created_by?: string | null
  created_at: string
  updated_at: string
}

/* ─── Customer Approvals portal (Spec 1.5) ───────────────────────────────── */

export type ApprovalRequestStatus =
  | 'draft'
  | 'sent'
  | 'partially-responded'
  | 'completed'
  | 'expired'

export type ApprovalLineResponse = 'approved' | 'denied' | 'deferred'

/**
 * Customer-facing approval flow on quoted work. Operator builds an
 * `ApprovalRequest` from a WO + selected line items, gets a public
 * `public_token` to share, and the customer responds per-line via the
 * unauthenticated `/approve/[token]` route.
 *
 * Status machine (operator perspective):
 *   draft → sent → partially-responded → completed
 *                                       \→ expired
 */
export interface ApprovalRequest {
  id: string
  organization_id: string
  work_order_id?: string | null
  customer_id?: string | null
  aircraft_id?: string | null
  public_token: string
  status: ApprovalRequestStatus
  subject?: string | null
  message?: string | null
  sent_date?: string | null
  responded_date?: string | null
  expires_at?: string | null
  created_by?: string | null
  created_at: string
  updated_at: string
}

/**
 * Per-line item shown to the customer. Customer responds with
 * approved | denied | deferred per item — `deferred` items
 * automatically become `continued_items` rows for the aircraft (Spec 1.4
 * cross-wire); the resulting id is stored in
 * `resulting_continued_item` for idempotency.
 */
export interface ApprovalLineItem {
  id: string
  approval_request_id: string
  description: string
  estimated_cost: number
  labor_hours: number
  parts_cost: number
  photo_urls: string[]
  customer_response?: ApprovalLineResponse | null
  customer_comment?: string | null
  responded_at?: string | null
  resulting_continued_item?: string | null
  work_order_line_id?: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

/* ─── Parts Inventory + Purchase Orders (Spec 2.1) ───────────────────────── */

export type PartClass = 'consumable' | 'rotable' | 'serialized'

export type PurchaseOrderStatus =
  | 'draft'
  | 'open-request'
  | 'ordered'
  | 'partially-fulfilled'
  | 'fulfilled'
  | 'cancelled'

/**
 * Local org parts inventory. Distinct from external parts catalog (021
 * parts_searches / part_offers — those are Atlas Network search results).
 *
 * Auto-flows wired in Sprint 2.1:
 *   - WO line gains optional inventory_part_id (016 ALTER); consume helper
 *     decrements qty_on_hand on install.
 *   - PO fulfillment increments qty_on_hand per line.
 *   - qty_on_hand <= min_on_hand fires `low-stock` AISignal (Sprint 0c) →
 *     orchestrator card → Sprint 0d notification to alert_emails.
 */
export interface InventoryPart {
  id: string
  organization_id: string
  part_number: string
  alt_part_numbers: string[]
  description: string
  category?: string | null
  qty_on_hand: number
  min_on_hand: number
  unit_cost: number
  unit_price: number
  vendor?: string | null
  location?: string | null
  part_class: PartClass
  files: string[]
  alert_emails: string[]
  is_archived: boolean
  created_by?: string | null
  created_at: string
  updated_at: string
}

export interface PurchaseOrder {
  id: string
  organization_id: string
  /** Auto-generated by lib/inventory/po-numbers.ts (e.g. "PO-2026-0001"). */
  po_number: string
  status: PurchaseOrderStatus
  vendor: string
  requested_by?: string | null
  requested_date: string
  ordered_date?: string | null
  fulfilled_date?: string | null
  approximate_cost: number
  description?: string | null
  receipt_urls: string[]
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface PurchaseOrderLine {
  id: string
  purchase_order_id: string
  inventory_part_id: string
  qty_ordered: number
  qty_received: number
  unit_cost: number
  notes?: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

/* ─── Vendor Management (Spec 2.2) ───────────────────────────────────────── */

export type VendorType = 'parts' | 'osr' | 'service' | 'freight' | 'other'

/**
 * Vendor master. Back-references inventory_parts.vendor_id (068),
 * purchase_orders.vendor_id (068), work_order_lines.vendor_id (016).
 *
 * `approved` is the "approved-vendor-only" enforcement flag. Future WO-line
 * policy can refuse outside_service lines pointing to a non-approved vendor;
 * for now it's display-only.
 */
export interface Vendor {
  id: string
  organization_id: string
  name: string
  vendor_type: VendorType
  approved: boolean
  address?: string | null
  phone?: string | null
  website?: string | null
  contact_name?: string | null
  contact_email?: string | null
  description?: string | null
  is_archived: boolean
  created_by?: string | null
  created_at: string
  updated_at: string
}

/* ─── Live Time Clock on Work Orders (Spec 2.3) ──────────────────────────── */

export type TimeEntryWorkType = 'labor' | 'ojt' | 'warranty' | 'rework'

/**
 * Per-technician, per-WO time entry. `end_time = null` means the entry
 * is OPEN (clocked in). Partial unique index in migration 070 enforces
 * "one open entry per technician" so the running-timer chip on Topbar
 * always shows one row.
 *
 * Coexists with work_order_lines.hours/rate (016) — manual labor lines
 * still work; aggregated WO labor totals sum BOTH systems.
 */
export interface TimeEntry {
  id: string
  organization_id: string
  work_order_id: string
  work_order_line_id?: string | null
  technician_id: string
  start_time: string
  end_time?: string | null
  hourly_rate: number
  work_type: TimeEntryWorkType
  is_overtime: boolean
  notes?: string | null
  /** Sprint 2.5.3 bridge — auto-set when a tech with an open daily
   *  ClockEvent clocks into a WO. NULL if the tech is not using the
   *  daily clock. */
  clock_event_id?: string | null
  created_at: string
  updated_at: string
}

/* ─── Mechanic Scheduler — shifts (Spec 2.5.1) ───────────────────────────── */

export type ShiftStatus = 'scheduled' | 'in-progress' | 'completed' | 'missed' | 'swapped'

/**
 * Mechanic shift. Per-tech, per-org scheduled work block. Unlike TimeEntry
 * (sprint 2.3), shifts represent the PLAN — what the manager said the
 * tech should be working when. TimeEntry represents the ACTUAL.
 *
 * Shift.reminders is intentionally free-form JSONB on the DB side so the
 * cross-wire to sprint 0d's reminder_schedules can evolve (eager vs lazy
 * enqueue) without a schema change.
 */
export interface Shift {
  id: string
  organization_id: string
  /** Optional location scope (sprint 0a). NULL = anywhere in the org. */
  location_id?: string | null
  /** Display label on the calendar tile. */
  name: string
  /** Assigned tech (auth.users.id). */
  technician_id: string
  /** Optional skill tags: "IA", "Avionics", "Engine". */
  roles: string[]
  start_time: string
  end_time: string
  status: ShiftStatus
  /** Sprint 0d reminder spec list. Free-form per spec. */
  reminders: Array<Record<string, unknown>>
  /** Pre-shift / post-shift checklist items. */
  checklist: ShiftChecklistItem[]
  notes?: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface ShiftChecklistItem {
  id: string
  text: string
  completed: boolean
  completed_at?: string | null
}

export type ShiftCoverStatus = 'open' | 'claimed' | 'approved' | 'rejected'

/**
 * Shift swap request — tech can't make a shift, asks if anyone can cover.
 * Workflow:
 *   1. Tech POSTs /api/shifts/[id]/request-cover  → row inserted, status='open'
 *   2. Teammate sees it on /scheduler ShiftCovers tab → PATCH covering_tech_id +
 *      status='claimed'
 *   3. Manager approves/rejects → status flips to 'approved' (also flips the
 *      original Shift.status to 'swapped' + reassigns) or 'rejected'.
 */
/* ─── Tool Management & Calibration (Spec 2.6.1) ─────────────────────────── */

export type ToolCategory = 'torque' | 'measuring' | 'test-equipment' | 'jig' | 'lift' | 'borescope' | 'other'
export type ToolStatus = 'in-use' | 'available' | 'out-for-calibration' | 'out-of-service' | 'lost' | 'retired'
export type CalibrationResult = 'pass' | 'fail' | 'adjusted'
export type ToolReturnCondition = 'ok' | 'damaged' | 'needs-recalibration'

export interface Tool {
  id: string
  organization_id: string
  location_id?: string | null
  serial_number: string
  name: string
  category: ToolCategory
  manufacturer?: string | null
  model?: string | null
  purchase_date?: string | null
  purchase_cost?: number | null
  storage_location?: string | null
  status: ToolStatus
  calibration_required: boolean
  calibration_interval_months?: number | null
  calibration_interval_uses?: number | null
  tolerance_days: number
  last_calibration_date?: string | null
  last_calibration_by?: string | null
  last_calibration_cert_number?: string | null
  next_calibration_date?: string | null
  checked_out_by?: string | null
  checked_out_at?: string | null
  checked_out_to_work_order?: string | null
  certificate_urls: string[]
  manual_url?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface CalibrationEvent {
  id: string
  organization_id: string
  tool_id: string
  performed_at: string
  performed_by: string
  certificate_number?: string | null
  result: CalibrationResult
  cost?: number | null
  notes?: string | null
  certificate_url?: string | null
  next_due_date: string
  logged_by: string
  created_at: string
}

export interface ToolCheckout {
  id: string
  organization_id: string
  tool_id: string
  user_id: string
  work_order_id?: string | null
  checked_out_at: string
  returned_at?: string | null
  condition_at_return?: ToolReturnCondition | null
  notes?: string | null
  created_at: string
}

export interface WorkOrderToolUse {
  id: string
  organization_id: string
  work_order_id: string
  tool_id: string
  was_overdue: boolean
  used_at: string
  used_by: string
  notes?: string | null
  created_at: string
}

/* ─── Daily Clock In/Out (Spec 2.5.3) ─────────────────────────────────────── */

export type ClockEventStatus = 'clocked-in' | 'on-break' | 'clocked-out'

export interface BreakInterval {
  start: string                       // ISO datetime
  end?: string | null
  reason?: string | null              // "Lunch", "Smoke", etc.
}

/**
 * Daily ClockEvent — tech's whole-day clock in/out, with embedded breaks.
 * Distinct from sprint 2.3's TimeEntry (per-WO labor); per-WO entries
 * roll up INSIDE a ClockEvent via time_entries.clock_event_id.
 *
 * Partial UNIQUE on (employee_id) WHERE clock_out_at IS NULL guarantees
 * one open clock-event per employee at the DB level.
 */
export interface ClockEvent {
  id: string
  organization_id: string
  employee_id: string
  status: ClockEventStatus
  clock_in_at: string
  clock_out_at?: string | null
  breaks: BreakInterval[]
  total_hours?: number | null
  shift_id?: string | null
  notes?: string | null
  image_url?: string | null
  created_at: string
  updated_at: string
}

/* ─── Time Off Requests (Spec 2.5.2) ──────────────────────────────────────── */

export type TimeOffStatus = 'draft' | 'pending' | 'approved' | 'denied' | 'cancelled'
export type TimeOffType = 'Holiday' | 'Medical' | 'Personal' | 'Bereavement' | 'Jury Duty'

/**
 * Employee PTO request with manager approval. Approved blocks render as
 * gray bars on the Scheduler calendar and flag conflicts in the WO
 * assignee picker. Coexists with Shift (2.5.1) — a tech can have shifts
 * AND PTO; the assignment-conflict check treats approved PTO as a hard
 * block.
 */
export interface TimeOffRequest {
  id: string
  organization_id: string
  employee_id: string
  request_type: TimeOffType
  start_date: string                 // ISO date (YYYY-MM-DD)
  end_date: string                   // ISO date, inclusive
  status: TimeOffStatus
  notify_user_ids: string[]
  reason?: string | null
  manager_comment?: string | null
  decided_by?: string | null
  decided_at?: string | null
  created_at: string
  updated_at: string
}

export interface ShiftCover {
  id: string
  organization_id: string
  original_shift_id: string
  requested_by: string
  covering_tech_id?: string | null
  status: ShiftCoverStatus
  reason?: string | null
  created_at: string
  updated_at: string
}

/* ─── Multi-view system per module (Spec 2.4) ────────────────────────────── */

/**
 * Module keys for the multi-view system. Open string at the DB layer; the
 * MODULE_CONFIGS map in lib/views/configs.ts decides what fields, group
 * options, and date keys each module exposes.
 */
export type SavedViewModule =
  | 'work-orders'
  | 'invoices'
  | 'logbook'
  | 'compliance'
  | 'inspections'
  | 'parts'
  | 'purchase-orders'
  | 'vendors'
  | 'continued'
  | 'approvals'
  | 'shifts'

export type SavedViewType = 'list' | 'calendar' | 'table' | 'board'

/**
 * Saved view config. Per-user by default; user_id=null means org-shared
 * (only owner/admin can create/edit those — enforced at the API layer).
 *
 * `filters` shape is per-module (frontend defines via ModuleViewConfig).
 * `sort` is `{field, direction}`. `group_by` is the column key for board
 * grouping. `display_config` carries column order, primary date field for
 * calendar, status field for board, etc.
 */
export interface SavedView {
  id: string
  organization_id: string
  user_id?: string | null
  module: SavedViewModule
  name: string
  view_type: SavedViewType
  filters: Record<string, unknown>
  sort?: { field: string; direction: 'asc' | 'desc' } | null
  group_by?: string | null
  display_config: Record<string, unknown>
  is_default: boolean
  is_seeded: boolean
  sort_order: number
  created_at: string
  updated_at: string
}
