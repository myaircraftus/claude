/**
 * Direct-chunking OCR — Option 3.
 *
 * One vision-model call per page that simultaneously emits:
 *   - raw_text       (full page transcription)
 *   - chunks[]       (family-shaped semantic chunks — one per maintenance entry,
 *                     signoff block, parts line, AD clause, manual subsection, etc.)
 *   - events[]       (structured maintenance events linked back to chunks via
 *                     source_chunk_index)
 *
 * Replaces the legacy three-pass chain (OCR text → GPT-4o annotation →
 * heuristic segmentation → canonical promotion) for documents where the
 * direct-chunking flag is on and the vision-model backend is available.
 *
 * Provider-agnostic at the public API surface. v1 backend is Gemini 3 Flash
 * Preview (its OpenAPI-3.0-subset responseSchema is verified — see
 * `.tmp/gemini-schema-test-output/`). A future provider swap (e.g. to an
 * OpenAI vision model) only touches `runDirectChunkingPage`'s internals; no
 * caller needs to change.
 *
 * Default behavior (production): direct-chunking is ON. The kill-switch
 * `OCR_DIRECT_CHUNKING=false` is the ONLY thing that turns it off; any
 * other value (including unset) keeps it enabled.
 *
 * Provider auto-detect mirrors the legacy OCR cascade: prefer Gemini when
 * `GEMINI_API_KEY` is set (8.8/10 on handwritten per the bake-off), else
 * fall back to OpenAI GPT-4o (6.4/10 on handwritten but always available
 * when an OpenAI key is configured). Operators can pin a specific provider
 * via `OCR_DIRECT_CHUNKING_PROVIDER`.
 *
 * Family gate: `OCR_DIRECT_CHUNKING_FAMILIES=logbook,work_order,inspection,ad_sb`
 *              (default — keeps manuals on the legacy chain since Document AI
 *               handles printed-text manuals well at fractions of a cent per
 *               page, vs vision-model cost of ~$0.006/page).
 */
import OpenAI from 'openai'
import { PDFDocument } from 'pdf-lib'
import { inferDocumentFamily, type DocumentFamily } from '@/lib/ocr/segments'
import type {
  NativeExtractedEvent,
  NativeIngestResponse,
  NativeParsedChunk,
  NativeParsedPage,
  OcrProgressUpdate,
} from '@/lib/ingestion/native-pdf'

// ─── Constants ────────────────────────────────────────────────────────────

/** Tag written into canonical_document_chunks.metadata_json.source so
 *  downstream consumers (Wave 2 contextualization, admin inspector,
 *  retrieval analytics) can distinguish direct-chunking output from
 *  legacy text-native / OCR-segment-promoted chunks. */
export const DIRECT_CHUNKING_SOURCE_TAG = 'direct_chunking'

/** Default families allowed under direct-chunking — ALL 6, after per-family
 *  verification (see WORKLOG entry on the cross-family verification harness).
 *  Override with the OCR_DIRECT_CHUNKING_FAMILIES env var if a specific
 *  family needs to revert to the legacy chain (e.g. for cost control on
 *  massive scanned-manual binders, set to
 *  `logbook,work_order,inspection,ad_sb`). */
const DEFAULT_FAMILIES: readonly DocumentFamily[] = [
  'logbook',
  'work_order',
  'inspection',
  'ad_sb',
  'manual_reference',
  'general',
] as const

/** Match the existing Gemini-OCR concurrency and timeout knobs — the
 *  per-page work isn't materially different in cost or latency. */
const PER_PAGE_TIMEOUT_MS = 90_000
const PAGE_CONCURRENCY = 4
const MIN_SUCCESS_RATIO = 0.5
/** Output budget. Empirically: a 4-up handwritten airframe page with 5
 *  chunks + 2 events fits in ~1983 candidate tokens; 8192 leaves headroom
 *  for the densest real pages we've seen without truncation. */
const MAX_OUTPUT_TOKENS = 8192

/** Defaults reuse the same Gemini config that the bake-off proved out
 *  (temperature 0.4 + topP/topK breaks the form-template repetition loop;
 *  thinkingBudget 0 is required so the thinking model doesn't burn the
 *  output budget on internal reasoning tokens). */
const PROVIDER_DEFAULTS = {
  temperature: 0.4,
  topP: 0.9,
  topK: 40,
}

// ─── Types ────────────────────────────────────────────────────────────────

/** One semantic chunk emitted by the vision model for a single page. The
 *  `chunk_kind` enum is family-specific (see RESPONSE_SCHEMAS below) but
 *  the surrounding shape is uniform across families. */
export interface DirectChunk {
  /** 0-based within the page. The document-level canonical index is computed
   *  server-side as `page_number * 1000 + chunk_index`. */
  chunk_index: number
  /** Family-specific enum value (e.g. logbook → 'maintenance_entry'). */
  chunk_kind: string
  /** Verbatim slice of the page that this chunk represents. */
  text: string
  /** Optional human-readable section name (e.g. "1981-1985 entries"). */
  section_title: string | null
  /** Per-chunk confidence 0-1 — replaces the legacy per-page confidence
   *  inheritance that caused good entries on partially-garbled pages to
   *  get demoted to review_required. */
  confidence: number
  /** Whether this chunk should land in the canonical retrieval layer.
   *  Set by the model based on whether the chunk represents real
   *  retrievable content vs form template / boilerplate noise. */
  is_canonical_candidate: boolean
  /** Family-specific metadata object (e.g. logbook → entry_date_iso,
   *  mechanic_cert; work_order → work_order_number, part_quantity).
   *  Persisted into canonical_document_chunks.metadata_json.family_metadata. */
  family_metadata: Record<string, unknown>
}

/** Structured maintenance event linked back to a chunk via source_chunk_index.
 *  Shape mirrors the existing NativeExtractedEvent (so downstream
 *  ocr_extracted_events → maintenance_events promotion is unchanged) plus
 *  the back-reference. */
export interface DirectChunkEvent {
  source_chunk_index: number
  event_type: string | null
  logbook_type: string | null
  event_date: string | null
  tach_time: string | null
  airframe_tt: string | null
  tsmoh: string | null
  work_description: string | null
  mechanic_name: string | null
  mechanic_cert_number: string | null
  ia_number: string | null
  ad_references: string[]
  part_numbers: string[]
  return_to_service: boolean | null
  confidence_overall: number | null
}

/** Full per-page result. `page_number` is always the SOURCE page number,
 *  server-stamped after the call (the model only sees a 1-page PDF and
 *  defaults its own page_number to 1). */
export interface DirectChunkPageResult {
  page_number: number
  page_classification: string | null
  raw_text: string
  overall_confidence: number
  tail_number_visible: string | null
  aircraft_make_visible: string | null
  aircraft_model_visible: string | null
  chunks: DirectChunk[]
  events: DirectChunkEvent[]
  family: DocumentFamily
  ocr_engine: string
}

// ─── Feature-flag helpers ────────────────────────────────────────────────

function getEnabledFamilies(): Set<DocumentFamily> {
  const raw = process.env.OCR_DIRECT_CHUNKING_FAMILIES?.trim()
  if (!raw) return new Set(DEFAULT_FAMILIES)
  const families = raw
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean) as DocumentFamily[]
  return new Set(families.length > 0 ? families : DEFAULT_FAMILIES)
}

/** Master kill-switch. ON by default — the cleaner pipeline is the
 *  intended production behavior. Only the literal string `'false'` (or
 *  `'0'` / `'off'` / `'disabled'`) turns it off; anything else (unset,
 *  empty string, `'true'`) keeps it enabled. */
export function isDirectChunkingEnabled(): boolean {
  const raw = process.env.OCR_DIRECT_CHUNKING?.trim().toLowerCase()
  if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'disabled') {
    return false
  }
  return true
}

/** Per-document decision: the flag must be on, AND the document's family
 *  must be in the allow-list. Used by the OCR cascade to decide whether
 *  the Gemini attempt routes to the new path or the legacy one. */
export function shouldUseDirectChunkingFor(docType: string): boolean {
  if (!isDirectChunkingEnabled()) return false
  const family = inferDocumentFamily(docType)
  return getEnabledFamilies().has(family)
}

/** Pick the direct-chunking backend.
 *
 *  Explicit override wins: `OCR_DIRECT_CHUNKING_PROVIDER=openai` or `=gemini`.
 *
 *  Otherwise auto-detect mirrors the legacy OCR cascade — prefer Gemini
 *  if `GEMINI_API_KEY` is set (highest handwriting accuracy per the
 *  bake-off), else fall back to OpenAI GPT-4o (always available when an
 *  OpenAI key is configured). With neither key present the cascade will
 *  skip the direct-chunking attempt entirely (see
 *  `directChunkingProviderHasKey` and the cascade gate in
 *  parseScannedPdfWithFallbacks). */
export function getDirectChunkingProvider(): 'gemini' | 'openai' {
  const explicit = process.env.OCR_DIRECT_CHUNKING_PROVIDER?.trim().toLowerCase()
  if (explicit === 'openai' || explicit === 'gemini') return explicit
  if (process.env.GEMINI_API_KEY?.trim()) return 'gemini'
  return 'openai'
}

function getProvider(): 'gemini' | 'openai' {
  return getDirectChunkingProvider()
}

/** Whether the API key for the currently-configured direct-chunking
 *  provider is present in env. The OCR cascade uses this to decide whether
 *  the direct-chunking attempt is eligible to run. */
export function directChunkingProviderHasKey(): boolean {
  const provider = getDirectChunkingProvider()
  if (provider === 'openai') return Boolean(process.env.OPENAI_API_KEY)
  return Boolean(process.env.GEMINI_API_KEY)
}

function getModelForProvider(provider: 'gemini' | 'openai'): string {
  const override = process.env.OCR_DIRECT_CHUNKING_MODEL?.trim()
  if (override) return override
  if (provider === 'openai') {
    return (
      process.env.OPENAI_OCR_MODEL?.trim() ||
      process.env.OPENAI_CHAT_MODEL?.trim() ||
      'gpt-4o'
    )
  }
  return process.env.GEMINI_OCR_MODEL?.trim() || 'gemini-3-flash-preview'
}

/** The provider model identifier — used in DB rows so cost / quality
 *  analytics can attribute output to the actual engine. The engine string
 *  is intentionally model-specific (e.g. "gemini_3_flash_preview_direct",
 *  "gpt_4o_direct") even though the calling code is provider-agnostic. */
function getEngineId(): string {
  const provider = getProvider()
  const model = getModelForProvider(provider)
  return `${model.replace(/[^a-zA-Z0-9]+/g, '_')}_direct`
}

// ─── responseSchema builders (one per family) ────────────────────────────
//
// Six schemas sharing one envelope. The only per-family differences are:
//   1. The chunk_kind enum (semantic chunk types specific to the family)
//   2. The family_metadata object's properties
//   3. Whether events[] items are populated or always empty
//
// Schema dialect: OpenAPI 3.0 subset (Gemini's responseSchema constraint).
// - Nullable scalars use `nullable: true` (NOT JSON-Schema's `type: ['string','null']`).
// - Optional vs required: object-level `required: [...]` array.
// - Enum + nullable coexist (verified on real pages — see design doc §2).

function buildSharedEnvelope(args: {
  chunkItem: object
  eventItem: object | null
}): object {
  const properties: Record<string, unknown> = {
    page_classification: {
      type: 'string',
      enum: [
        'engine_log',
        'airframe_log',
        'prop_log',
        'maintenance_entry',
        'work_order',
        'ad_compliance',
        'inspection_report',
        'manual_reference',
        'cover',
        'blank',
        'unknown',
      ],
      nullable: true,
    },
    raw_text: { type: 'string' },
    overall_confidence: { type: 'number' },
    tail_number_visible: { type: 'string', nullable: true },
    aircraft_make_visible: { type: 'string', nullable: true },
    aircraft_model_visible: { type: 'string', nullable: true },
    chunks: { type: 'array', items: args.chunkItem },
    events: {
      type: 'array',
      // Even for families with no semantic events, the response includes the
      // events array (empty). Keeping the field in every schema avoids a
      // null/undefined distinction at parse time.
      items: args.eventItem ?? buildEmptyEventItem(),
    },
  }
  return {
    type: 'object',
    properties,
    required: [
      'page_classification',
      'raw_text',
      'overall_confidence',
      'chunks',
      'events',
    ],
  }
}

/** Logbook-family event item — mirrors NativeExtractedEvent. Reused for
 *  work_order and inspection families because signoffs in those families
 *  are semantically the same as maintenance events (return-to-service by
 *  a named mechanic with optional dates / tach / ADs / parts). */
function buildMaintenanceEventItem(): object {
  return {
    type: 'object',
    properties: {
      source_chunk_index: { type: 'integer' },
      event_type: { type: 'string', nullable: true },
      logbook_type: { type: 'string', nullable: true },
      event_date: { type: 'string', nullable: true },
      tach_time: { type: 'string', nullable: true },
      airframe_tt: { type: 'string', nullable: true },
      tsmoh: { type: 'string', nullable: true },
      work_description: { type: 'string', nullable: true },
      mechanic_name: { type: 'string', nullable: true },
      mechanic_cert_number: { type: 'string', nullable: true },
      ia_number: { type: 'string', nullable: true },
      ad_references: { type: 'array', items: { type: 'string' } },
      part_numbers: { type: 'array', items: { type: 'string' } },
      return_to_service: { type: 'boolean', nullable: true },
      confidence_overall: { type: 'number' },
    },
    required: ['source_chunk_index', 'confidence_overall'],
  }
}

/** Placeholder event item for families that don't have semantic events
 *  (ad_sb / manual_reference / general). The schema still requires events
 *  to be an array; we constrain its items minimally and instruct the model
 *  in the prompt to leave it empty. */
function buildEmptyEventItem(): object {
  return {
    type: 'object',
    properties: { source_chunk_index: { type: 'integer' } },
    required: ['source_chunk_index'],
  }
}

function buildChunkItem(args: {
  kindEnum: readonly string[]
  familyMetadata: object
}): object {
  return {
    type: 'object',
    properties: {
      chunk_index: { type: 'integer' },
      chunk_kind: { type: 'string', enum: [...args.kindEnum] },
      text: { type: 'string' },
      section_title: { type: 'string', nullable: true },
      confidence: { type: 'number' },
      is_canonical_candidate: { type: 'boolean' },
      family_metadata: args.familyMetadata,
    },
    required: [
      'chunk_index',
      'chunk_kind',
      'text',
      'confidence',
      'is_canonical_candidate',
    ],
  }
}

// ── Per-family chunk_kind enums ────────────────────────────────────────────

const LOGBOOK_KINDS = [
  'maintenance_entry',
  'entry_continuation',
  'signoff_block',
  'attached_tag',
  'inserted_form',
  'header_template_block',
  'ignore_block',
] as const

const WORK_ORDER_KINDS = [
  'header_block',
  'labor_entry',
  'parts_line',
  'discrepancy_finding',
  'corrective_action',
  'signoff_block',
  'ignore_block',
] as const

const AD_SB_KINDS = [
  'header_block',
  'applicability_clause',
  'compliance_instruction',
  'effectivity_table',
  'alternative_means',
  'reference_block',
  'ignore_block',
] as const

const INSPECTION_KINDS = [
  'header_block',
  'checklist_section',
  'finding',
  'corrective_action',
  'signoff_block',
  'ignore_block',
] as const

const MANUAL_REFERENCE_KINDS = [
  'subsection',
  'table_block',
  'diagram_caption',
  'safety_warning',
  'parts_list',
  'procedural_step_block',
  'appendix',
  'ignore_block',
] as const

const GENERAL_KINDS = [
  'section',
  'table_block',
  'signature_block',
  'ignore_block',
] as const

// ── Per-family family_metadata objects ─────────────────────────────────────

function buildLogbookMetadata(): object {
  return {
    type: 'object',
    properties: {
      entry_date_iso: { type: 'string', nullable: true },
      tach_time_text: { type: 'string', nullable: true },
      airframe_tt_text: { type: 'string', nullable: true },
      tsmoh_text: { type: 'string', nullable: true },
      mechanic_name: { type: 'string', nullable: true },
      mechanic_cert: { type: 'string', nullable: true },
      ia_number: { type: 'string', nullable: true },
      ad_references: { type: 'array', items: { type: 'string' } },
      part_numbers: { type: 'array', items: { type: 'string' } },
      continuation_from_previous_page: { type: 'boolean' },
      continuation_to_next_page: { type: 'boolean' },
    },
  }
}

function buildWorkOrderMetadata(): object {
  return {
    type: 'object',
    properties: {
      work_order_number: { type: 'string', nullable: true },
      customer_name: { type: 'string', nullable: true },
      tail_number: { type: 'string', nullable: true },
      open_date_iso: { type: 'string', nullable: true },
      close_date_iso: { type: 'string', nullable: true },
      part_number: { type: 'string', nullable: true },
      part_quantity: { type: 'number', nullable: true },
      labor_hours: { type: 'number', nullable: true },
      labor_mechanic: { type: 'string', nullable: true },
      labor_cert: { type: 'string', nullable: true },
    },
  }
}

function buildAdSbMetadata(): object {
  return {
    type: 'object',
    properties: {
      ad_number: { type: 'string', nullable: true },
      sb_number: { type: 'string', nullable: true },
      subject: { type: 'string', nullable: true },
      effective_date_iso: { type: 'string', nullable: true },
      compliance_date_iso: { type: 'string', nullable: true },
      affected_makes: { type: 'array', items: { type: 'string' } },
      affected_models: { type: 'array', items: { type: 'string' } },
      serial_range: { type: 'string', nullable: true },
      compliance_method: { type: 'string', nullable: true },
      referenced_far: { type: 'array', items: { type: 'string' } },
    },
  }
}

function buildInspectionMetadata(): object {
  return {
    type: 'object',
    properties: {
      inspection_type: { type: 'string', nullable: true },
      inspection_date_iso: { type: 'string', nullable: true },
      hours_at_inspection: { type: 'number', nullable: true },
      cycles_at_inspection: { type: 'integer', nullable: true },
      finding_severity: {
        type: 'string',
        enum: ['info', 'minor', 'major', 'airworthiness', 'deferred'],
        nullable: true,
      },
      part_number: { type: 'string', nullable: true },
      mechanic_name: { type: 'string', nullable: true },
      mechanic_cert: { type: 'string', nullable: true },
      ia_number: { type: 'string', nullable: true },
    },
  }
}

function buildManualReferenceMetadata(): object {
  return {
    type: 'object',
    properties: {
      chapter: { type: 'string', nullable: true },
      section: { type: 'string', nullable: true },
      subsection: { type: 'string', nullable: true },
      ata_chapter: { type: 'string', nullable: true },
      revision: { type: 'string', nullable: true },
      table_preserved_as: {
        type: 'string',
        enum: ['pipe_delimited', 'fixed_width', 'prose', 'not_a_table'],
        nullable: true,
      },
      warning_class: {
        type: 'string',
        enum: ['warning', 'caution', 'note', 'danger'],
        nullable: true,
      },
      part_numbers: { type: 'array', items: { type: 'string' } },
    },
  }
}

function buildGeneralMetadata(): object {
  return {
    type: 'object',
    properties: {
      approx_target_tokens: { type: 'integer' },
    },
  }
}

// ── Per-family response schema (combines chunk item + event item + envelope) ──

function buildResponseSchema(family: DocumentFamily): object {
  switch (family) {
    case 'logbook':
      return buildSharedEnvelope({
        chunkItem: buildChunkItem({
          kindEnum: LOGBOOK_KINDS,
          familyMetadata: buildLogbookMetadata(),
        }),
        eventItem: buildMaintenanceEventItem(),
      })
    case 'work_order':
      return buildSharedEnvelope({
        chunkItem: buildChunkItem({
          kindEnum: WORK_ORDER_KINDS,
          familyMetadata: buildWorkOrderMetadata(),
        }),
        eventItem: buildMaintenanceEventItem(),
      })
    case 'ad_sb':
      return buildSharedEnvelope({
        chunkItem: buildChunkItem({
          kindEnum: AD_SB_KINDS,
          familyMetadata: buildAdSbMetadata(),
        }),
        eventItem: null,
      })
    case 'inspection':
      return buildSharedEnvelope({
        chunkItem: buildChunkItem({
          kindEnum: INSPECTION_KINDS,
          familyMetadata: buildInspectionMetadata(),
        }),
        eventItem: buildMaintenanceEventItem(),
      })
    case 'manual_reference':
      return buildSharedEnvelope({
        chunkItem: buildChunkItem({
          kindEnum: MANUAL_REFERENCE_KINDS,
          familyMetadata: buildManualReferenceMetadata(),
        }),
        eventItem: null,
      })
    case 'general':
    default:
      return buildSharedEnvelope({
        chunkItem: buildChunkItem({
          kindEnum: GENERAL_KINDS,
          familyMetadata: buildGeneralMetadata(),
        }),
        eventItem: null,
      })
  }
}

// ─── Prompts (one per family) ────────────────────────────────────────────

const SHARED_CLOSER =
  'For unreadable / ambiguous text, write [illegible] rather than guessing. ' +
  'Do NOT summarize or paraphrase any chunk text — it must be the verbatim ' +
  'page slice. Transcribe the page from TOP to BOTTOM — a single page may ' +
  'have multiple stacked sections; transcribe all of them. The raw_text ' +
  'field must be the COMPLETE page transcription (including all sections).'

const LOGBOOK_GUIDANCE =
  'CHUNKING: A pre-printed aircraft logbook page (ASA-SP-L / Jeppesen) ' +
  'typically has a 4-up grid where each cell is an independent maintenance ' +
  'entry — its OWN date, tach/Hobbs, work description, and mechanic ' +
  'signature. Emit ONE chunk per cell with chunk_kind=maintenance_entry. ' +
  'Mechanic signoff certifications ("I certify...", "Returned to service", ' +
  'A&P / IA certificate numbers as standalone blocks) → SEPARATE chunk with ' +
  'chunk_kind=signoff_block. 8130 / yellow-tag photocopies → chunk_kind=attached_tag. ' +
  'FAA Form 337 inserts → chunk_kind=inserted_form. Pre-printed form ' +
  'boilerplate with no real entry content ("FACTORY BULLETINS" headers, ' +
  '"NOTES" sections, repeated column headers) → chunk_kind=header_template_block ' +
  'with is_canonical_candidate=false. If an entry visibly wraps from a ' +
  'previous page or to the next page, mark family_metadata.continuation_from_previous_page ' +
  'or continuation_to_next_page accordingly. Each chunk\'s text MUST be the ' +
  'verbatim page slice — do not paraphrase.\n\n' +
  'EVENTS: For each maintenance_entry chunk that names a real maintenance ' +
  'event, emit ONE events[] item with source_chunk_index pointing back to ' +
  'that chunk. Fill known structured fields (event_date in YYYY-MM-DD, ' +
  'tach_time, mechanic_name, mechanic_cert_number, ad_references[], part_numbers[]); ' +
  'use null for unknown.'

const WORK_ORDER_GUIDANCE =
  'CHUNKING: A work order page has multiple distinct sections — header ' +
  '(customer, aircraft tail, WO number, open/close dates), labor entries ' +
  '(per line: hours + mechanic + description), parts list (per row: part ' +
  'number + qty + description + price), discrepancy findings + corrective ' +
  'actions, return-to-service signoff. Emit ONE chunk per logical section. ' +
  'chunk_kind values: header_block, labor_entry (one per labor line), ' +
  'parts_line (one per parts row), discrepancy_finding, corrective_action, ' +
  'signoff_block, ignore_block. Each chunk\'s text MUST be the verbatim page ' +
  'slice. For parts_line and labor_entry chunks, populate family_metadata ' +
  '(part_number, part_quantity, labor_hours, labor_mechanic, labor_cert).\n\n' +
  'CANONICAL: Most work-order chunks ARE canonical content (the WO is what ' +
  'a maintainer would search for later). Default is_canonical_candidate=true ' +
  'for: labor_entry, parts_line, discrepancy_finding, corrective_action, ' +
  'signoff_block — ALWAYS true regardless of content. For header_block: ' +
  'true if it contains work-order-specific data (WO number, customer name, ' +
  'aircraft tail, open/close dates, repair-station number); false ONLY if ' +
  'the header is pure company letterhead (name + address with no WO context) ' +
  'or repeated form labels with no values. For ignore_block: ALWAYS false. ' +
  'When in doubt between true and false on a content-bearing chunk, pick true.\n\n' +
  'EVENTS: For each signoff_block chunk that represents a return-to-service ' +
  'action, emit ONE events[] item with source_chunk_index. Capture the ' +
  'mechanic_name, mechanic_cert_number, ia_number, return_to_service=true, ' +
  'and a brief work_description summarizing the work-order scope.'

const AD_SB_GUIDANCE =
  'CHUNKING: An Airworthiness Directive / Service Bulletin page has these ' +
  'sections: header (AD/SB number, subject, effective date), applicability ' +
  'clauses (often tables listing make/model/serial-range), compliance ' +
  'instructions (numbered steps, often verbatim regulatory language), ' +
  'effectivity tables, alternative means of compliance, reference blocks ' +
  '(FAR citations, contact info). Emit ONE chunk per logical section with ' +
  'chunk_kind matching: header_block, applicability_clause, compliance_instruction, ' +
  'effectivity_table, alternative_means, reference_block, or ignore_block. ' +
  'For tables, preserve row/column structure with pipe (|) delimiters in the ' +
  'chunk text. Transcribe regulatory language verbatim — do NOT paraphrase ' +
  'legal phrasing. Populate family_metadata (ad_number, sb_number, ' +
  'effective_date_iso, affected_makes[], affected_models[], serial_range, ' +
  'referenced_far[]) on every chunk where the values are visible.\n\n' +
  'EVENTS: events[] MUST BE EMPTY for AD/SB pages — the regulatory content ' +
  'lives in the chunks themselves with family_metadata populated.'

const INSPECTION_GUIDANCE =
  'CHUNKING: An inspection report page has: header (inspection type — annual ' +
  '/ 100-hour / progressive / pre-buy, inspection date, hours/cycles at ' +
  'inspection), checklist sections, individual findings (each with its own ' +
  'severity), corrective actions, return-to-service signoff. Emit ONE chunk ' +
  'per section with chunk_kind matching: header_block, checklist_section, ' +
  'finding (one per finding), corrective_action, signoff_block, ignore_block. ' +
  'For findings, set family_metadata.finding_severity in ' +
  '{info, minor, major, airworthiness, deferred}.\n\n' +
  'CANONICAL: Most inspection chunks ARE canonical content. Default ' +
  'is_canonical_candidate=true for: finding, checklist_section, ' +
  'corrective_action, signoff_block — ALWAYS true regardless of content. ' +
  'For header_block: true if it contains inspection-specific data ' +
  '(inspection type, date, hours/cycles, aircraft identification); false ' +
  'ONLY if the header is pure binder/cover title or page-number boilerplate ' +
  'with no inspection context. For ignore_block: ALWAYS false. When in doubt ' +
  'between true and false on a content-bearing chunk, pick true.\n\n' +
  'EVENTS: For each signoff_block chunk, emit ONE events[] item capturing ' +
  'the mechanic_name, mechanic_cert_number, ia_number, return_to_service, ' +
  'and event_type set to the inspection type (e.g. "annual_inspection").'

const MANUAL_REFERENCE_GUIDANCE =
  'CHUNKING: A technical manual / POH / AFM / service manual / parts ' +
  'catalog page has subsections, tables, diagrams (caption text only), ' +
  'safety warnings/cautions/notes (verbatim — safety-critical), parts ' +
  'lists, procedural steps, appendix entries. Emit ONE chunk per logical ' +
  'subsection with chunk_kind matching: subsection, table_block, ' +
  'diagram_caption, safety_warning (warnings/cautions/notes — preserve the ' +
  'warning_class), parts_list, procedural_step_block, appendix, ignore_block. ' +
  'For tables, preserve row/column structure with pipe (|) delimiters and ' +
  'set family_metadata.table_preserved_as=\'pipe_delimited\'. For warnings, ' +
  'set family_metadata.warning_class to the verbatim header word ' +
  '(warning/caution/note/danger). Set is_canonical_candidate=true for ' +
  'substantive reference content (subsections with real text, tables with ' +
  'specifications, safety warnings, parts lists), false for running ' +
  'headers/footers/page-numbers/blank-page text.\n\n' +
  'EVENTS: events[] MUST BE EMPTY for manual_reference pages — the ' +
  'informational content lives entirely in the chunks.'

const GENERAL_GUIDANCE =
  'CHUNKING: Emit chunks at natural section boundaries, aiming for roughly ' +
  '600 tokens each where possible. chunk_kind values: section, table_block ' +
  '(preserve row/column structure with pipes), signature_block (signed/' +
  'stamped blocks), ignore_block (boilerplate, running headers/footers). ' +
  'is_canonical_candidate=true for substantive content; false for ' +
  'boilerplate.\n\n' +
  'EVENTS: events[] MUST BE EMPTY for the general family.'

function getFamilyGuidance(family: DocumentFamily): string {
  switch (family) {
    case 'logbook':
      return LOGBOOK_GUIDANCE
    case 'work_order':
      return WORK_ORDER_GUIDANCE
    case 'ad_sb':
      return AD_SB_GUIDANCE
    case 'inspection':
      return INSPECTION_GUIDANCE
    case 'manual_reference':
      return MANUAL_REFERENCE_GUIDANCE
    case 'general':
    default:
      return GENERAL_GUIDANCE
  }
}

function buildPrompt(args: {
  family: DocumentFamily
  docType: string
  title: string
  make?: string | null
  model?: string | null
}): string {
  const aircraftContext =
    [args.make, args.model].filter(Boolean).join(' ').trim() || 'Unknown'

  return (
    `You perform OCR and family-aware chunking + structured-event extraction ` +
    `for an aircraft ${args.family.replace(/_/g, ' ')} page in ONE call. ` +
    `Output STRICT JSON matching the supplied responseSchema.\n\n` +
    `Document type: ${args.docType}\n` +
    `Document title: ${args.title}\n` +
    `Aircraft context: ${aircraftContext}\n\n` +
    `OCR: Transcribe ALL visible text exactly as written into raw_text — ` +
    `handwritten cursive, printed form labels, signatures, dates, ` +
    `tach/Hobbs/total-time readings, mechanic certificate numbers, AD ` +
    `references, part numbers, stamps. Preserve layout via line breaks. ` +
    `The raw_text MUST be the complete page transcription.\n\n` +
    `${getFamilyGuidance(args.family)}\n\n` +
    `${SHARED_CLOSER}`
  )
}

// ─── Provider implementations ────────────────────────────────────────────
//
// Two backends today: Gemini 3 Flash Preview (vision PDF input via
// inline_data + OpenAPI 3.0 responseSchema) and OpenAI GPT-4o (vision PDF
// input via input_file/file_data + JSON Schema strict mode). Selected at
// call time via OCR_DIRECT_CHUNKING_PROVIDER.
//
// Schemas are AUTHORED in the Gemini dialect (because that's what the
// design doc + bake-off proved out); the OpenAI path converts at call time
// via `geminiSchemaToOpenAi`. This keeps one source of truth and avoids
// the drift risk of maintaining two parallel schema trees.

/** Convert a Gemini-dialect schema (OpenAPI 3.0 subset with
 *  `nullable: true`) into an OpenAI strict-mode JSON Schema:
 *   - `nullable: true` is folded into a `type: ['X', 'null']` union.
 *   - Every object property is added to `required: [...]` (OpenAI strict
 *     mode mandates this; "optional" is expressed as nullable instead).
 *   - Properties not in the original `required` AND not already nullable
 *     get their `type` promoted to include `'null'` so they remain
 *     semantically optional.
 *   - For nullable enums, `null` is added to the enum array.
 *   - Every object gets `additionalProperties: false`.
 *
 *  Pure / recursive. Walks arrays + nested objects. Safe to call on
 *  schemas already in OpenAI form (idempotent for the conversion-target
 *  shape — though we only ever feed it Gemini-form input). */
function geminiSchemaToOpenAi(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map((entry) => geminiSchemaToOpenAi(entry))
  }
  if (!input || typeof input !== 'object') return input

  const src = input as Record<string, unknown>
  const wasNullable = src.nullable === true
  const out: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(src)) {
    if (key === 'nullable') continue
    out[key] = geminiSchemaToOpenAi(value)
  }

  // Apply nullable conversion at this node.
  if (wasNullable) {
    if (typeof out.type === 'string') {
      out.type = [out.type, 'null']
    } else if (Array.isArray(out.type) && !out.type.includes('null')) {
      out.type = [...out.type, 'null']
    }
    if (Array.isArray(out.enum) && !out.enum.includes(null)) {
      out.enum = [...out.enum, null]
    }
  }

  // OpenAI strict-mode object rules.
  if (
    out.type === 'object' ||
    (Array.isArray(out.type) && out.type.includes('object'))
  ) {
    if (out.properties && typeof out.properties === 'object') {
      out.additionalProperties = false
      const props = out.properties as Record<string, Record<string, unknown>>
      const allProps = Object.keys(props)
      const originallyRequired = new Set(
        Array.isArray(out.required) ? (out.required as string[]) : [],
      )

      // Properties not in `required` and not already nullable become
      // nullable-required (OpenAI strict mode allows no truly-optional
      // properties). For enums, add `null` to the enum array too.
      for (const propName of allProps) {
        if (originallyRequired.has(propName)) continue
        const propSchema = props[propName]
        if (!propSchema || typeof propSchema !== 'object') continue
        if (typeof propSchema.type === 'string' && propSchema.type !== 'null') {
          propSchema.type = [propSchema.type, 'null']
        } else if (
          Array.isArray(propSchema.type) &&
          !propSchema.type.includes('null')
        ) {
          propSchema.type = [...(propSchema.type as string[]), 'null']
        }
        if (Array.isArray(propSchema.enum) && !propSchema.enum.includes(null)) {
          propSchema.enum = [...(propSchema.enum as unknown[]), null]
        }
      }

      out.required = allProps
    }
  }

  return out
}

async function callGeminiForPage(args: {
  pageBase64: string
  prompt: string
  schema: object
  timeoutMs: number
  model: string
}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error(
      'OCR_DIRECT_CHUNKING_PROVIDER=gemini requires GEMINI_API_KEY.',
    )
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${args.model}` +
    `:generateContent?key=${apiKey}`

  const body = {
    contents: [
      {
        parts: [
          { text: args.prompt },
          {
            inline_data: {
              mime_type: 'application/pdf',
              data: args.pageBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      ...PROVIDER_DEFAULTS,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: args.schema,
    },
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), args.timeoutMs)
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '(no body)')
      throw new Error(
        `direct-chunking gemini HTTP ${resp.status}: ${errText.slice(0, 400)}`,
      )
    }
    const json = (await resp.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> }
        finishReason?: string
      }>
    }
    const finishReason = json?.candidates?.[0]?.finishReason
    if (finishReason && finishReason !== 'STOP') {
      console.warn(
        `[direct-chunking] gemini non-STOP finishReason=${finishReason} — output may be truncated`,
      )
    }
    return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  } finally {
    clearTimeout(timer)
  }
}

async function callOpenAiForPage(args: {
  pageBase64: string
  prompt: string
  schema: object
  timeoutMs: number
  model: string
}): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      'OCR_DIRECT_CHUNKING_PROVIDER=openai requires OPENAI_API_KEY.',
    )
  }

  // OpenAI strict-mode JSON Schema differs from Gemini's OpenAPI 3.0 subset.
  // Convert at call time so the source-of-truth schemas can stay in one
  // dialect (see geminiSchemaToOpenAi above for the rules).
  const openAiSchema = geminiSchemaToOpenAi(args.schema) as Record<string, unknown>

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  // input_file with file_data lets us pass the PDF inline (data URL) so we
  // don't have to upload + delete via the Files API for every per-page call
  // — same pattern Gemini uses with inline_data.
  const dataUrl = `data:application/pdf;base64,${args.pageBase64}`

  const response = await Promise.race([
    client.responses.create({
      model: args.model,
      temperature: PROVIDER_DEFAULTS.temperature,
      top_p: PROVIDER_DEFAULTS.topP,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      text: {
        format: {
          type: 'json_schema',
          name: 'direct_chunking_page',
          strict: true,
          schema: openAiSchema,
        },
      },
      input: [
        {
          role: 'developer',
          content: [
            {
              type: 'input_text',
              text:
                'You perform OCR + family-aware chunking + structured-event ' +
                'extraction in ONE step. Return STRICT JSON matching the ' +
                'supplied schema. Treat the attached PDF as the page to process.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_file',
              filename: 'page.pdf',
              file_data: dataUrl,
            } as unknown as { type: 'input_file' },
            { type: 'input_text', text: args.prompt },
          ],
        },
      ],
    }),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`direct-chunking openai timeout ${args.timeoutMs}ms`)),
        args.timeoutMs,
      ),
    ),
  ])

  return response.output_text ?? ''
}

async function callProviderForPage(args: {
  pageBase64: string
  prompt: string
  schema: object
  timeoutMs: number
}): Promise<string> {
  const provider = getProvider()
  const model = getModelForProvider(provider)
  if (provider === 'openai') {
    return callOpenAiForPage({ ...args, model })
  }
  return callGeminiForPage({ ...args, model })
}

// ─── Response parsing + validation ───────────────────────────────────────

function safeNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(1, Math.max(0, n))
}

function safeString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
}

function safeBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  return null
}

function safeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function parseChunk(value: unknown, fallbackIndex: number): DirectChunk | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const text = typeof raw.text === 'string' ? raw.text : ''
  if (!text.trim()) return null
  const chunkIndex =
    typeof raw.chunk_index === 'number' && Number.isFinite(raw.chunk_index)
      ? raw.chunk_index
      : fallbackIndex
  return {
    chunk_index: chunkIndex,
    chunk_kind:
      typeof raw.chunk_kind === 'string' && raw.chunk_kind.trim()
        ? raw.chunk_kind.trim()
        : 'ignore_block',
    text,
    section_title: safeString(raw.section_title),
    confidence: safeNumber(raw.confidence, 0.7),
    is_canonical_candidate:
      typeof raw.is_canonical_candidate === 'boolean'
        ? raw.is_canonical_candidate
        : false,
    family_metadata: safeMetadata(raw.family_metadata),
  }
}

function parseEvent(value: unknown): DirectChunkEvent | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw.source_chunk_index !== 'number') return null
  return {
    source_chunk_index: raw.source_chunk_index,
    event_type: safeString(raw.event_type),
    logbook_type: safeString(raw.logbook_type),
    event_date: safeString(raw.event_date),
    tach_time: safeString(raw.tach_time),
    airframe_tt: safeString(raw.airframe_tt),
    tsmoh: safeString(raw.tsmoh),
    work_description: safeString(raw.work_description),
    mechanic_name: safeString(raw.mechanic_name),
    mechanic_cert_number: safeString(raw.mechanic_cert_number),
    ia_number: safeString(raw.ia_number),
    ad_references: safeStringArray(raw.ad_references),
    part_numbers: safeStringArray(raw.part_numbers),
    return_to_service: safeBoolean(raw.return_to_service),
    confidence_overall:
      typeof raw.confidence_overall === 'number'
        ? safeNumber(raw.confidence_overall, 0.7)
        : null,
  }
}

function parsePageResponse(args: {
  text: string
  pageNumber: number
  family: DocumentFamily
  engine: string
}): DirectChunkPageResult {
  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(args.text) as Record<string, unknown>
  } catch {
    // Provider returned non-JSON despite responseMimeType: 'application/json'.
    // Treat as a failed page — return an empty stub so the doc-level
    // success-ratio check can fire correctly.
    return {
      page_number: args.pageNumber,
      page_classification: null,
      raw_text: '',
      overall_confidence: 0,
      tail_number_visible: null,
      aircraft_make_visible: null,
      aircraft_model_visible: null,
      chunks: [],
      events: [],
      family: args.family,
      ocr_engine: args.engine,
    }
  }

  const chunksRaw = Array.isArray(parsed.chunks) ? parsed.chunks : []
  const chunks = chunksRaw
    .map((chunk, idx) => parseChunk(chunk, idx))
    .filter((c): c is DirectChunk => Boolean(c))
    // Re-index sequentially in case the model emitted non-monotonic indices.
    .map((chunk, idx) => ({ ...chunk, chunk_index: idx }))

  // Re-point events whose source_chunk_index referenced a now-renumbered
  // chunk — we trust the original ordering, so the event's source is
  // simply the chunk at the same position in the original array.
  const eventsRaw = Array.isArray(parsed.events) ? parsed.events : []
  const events = eventsRaw
    .map((event) => parseEvent(event))
    .filter((e): e is DirectChunkEvent => Boolean(e))
    .map((event) => {
      if (event.source_chunk_index < 0 || event.source_chunk_index >= chunks.length) {
        // The model named a chunk that didn't survive parsing (e.g. empty
        // text was dropped). Best-effort: clamp to the last chunk so the
        // event isn't orphaned.
        return {
          ...event,
          source_chunk_index: chunks.length > 0 ? chunks.length - 1 : 0,
        }
      }
      return event
    })

  const rawText = typeof parsed.raw_text === 'string' ? parsed.raw_text : ''
  const overallConfidence =
    typeof parsed.overall_confidence === 'number'
      ? safeNumber(parsed.overall_confidence, 0.7)
      : rawText.length > 0
        ? 0.88
        : 0.2

  return {
    page_number: args.pageNumber,
    page_classification:
      typeof parsed.page_classification === 'string'
        ? parsed.page_classification
        : null,
    raw_text: rawText,
    overall_confidence: overallConfidence,
    tail_number_visible: safeString(parsed.tail_number_visible),
    aircraft_make_visible: safeString(parsed.aircraft_make_visible),
    aircraft_model_visible: safeString(parsed.aircraft_model_visible),
    chunks,
    events,
    family: args.family,
    ocr_engine: args.engine,
  }
}

// ─── Per-page runner ─────────────────────────────────────────────────────

/** Runs the direct-chunking call on a single page of an already-loaded
 *  PDFDocument. Extracts that page as a 1-page PDF (matches the bake-off
 *  setup), calls the provider, parses + validates, server-stamps the page
 *  number (the provider always thinks the input is "page 1 of 1"). */
export async function runDirectChunkingPage(args: {
  pdfDoc: PDFDocument
  pageNumber: number
  family: DocumentFamily
  docType: string
  title: string
  make?: string | null
  model?: string | null
}): Promise<DirectChunkPageResult> {
  const singleDoc = await PDFDocument.create()
  const [copied] = await singleDoc.copyPages(args.pdfDoc, [args.pageNumber - 1])
  singleDoc.addPage(copied)
  const singleBytes = await singleDoc.save()
  const base64 = Buffer.from(singleBytes).toString('base64')

  const prompt = buildPrompt({
    family: args.family,
    docType: args.docType,
    title: args.title,
    make: args.make,
    model: args.model,
  })
  const schema = buildResponseSchema(args.family)
  const engine = getEngineId()

  const text = await callProviderForPage({
    pageBase64: base64,
    prompt,
    schema,
    timeoutMs: PER_PAGE_TIMEOUT_MS,
  })

  return parsePageResponse({
    text,
    pageNumber: args.pageNumber,
    family: args.family,
    engine,
  })
}

// ─── Document-level orchestrator ─────────────────────────────────────────

async function downloadPdfBytes(fileUrl: string): Promise<Uint8Array> {
  const response = await fetch(fileUrl)
  if (!response.ok) {
    throw new Error(`Failed to download PDF for direct-chunking: ${response.status}`)
  }
  return new Uint8Array(await response.arrayBuffer())
}

function buildEmptyPageStub(args: {
  pageNumber: number
  family: DocumentFamily
  engine: string
}): DirectChunkPageResult {
  return {
    page_number: args.pageNumber,
    page_classification: null,
    raw_text: '',
    overall_confidence: 0,
    tail_number_visible: null,
    aircraft_make_visible: null,
    aircraft_model_visible: null,
    chunks: [],
    events: [],
    family: args.family,
    ocr_engine: args.engine,
  }
}

/** Build the legacy NativeParsedPage shape for backward compatibility with
 *  every existing consumer (document_pages writer, vision-retranscribe,
 *  metadata extractor, etc.). The direct-chunking-specific data also flows
 *  separately via NativeIngestResponse.direct_chunking_pages so the new
 *  persistence path can consume the full structured payload. */
function toLegacyParsedPage(result: DirectChunkPageResult): NativeParsedPage {
  return {
    page_number: result.page_number,
    text: result.raw_text,
    ocr_confidence: result.overall_confidence,
    word_count: result.raw_text ? result.raw_text.split(/\s+/).filter(Boolean).length : 0,
    char_count: result.raw_text.length,
    ocr_engine: result.ocr_engine,
    page_classification: result.page_classification,
    extracted_events: result.events.map(toLegacyEvent),
    geometry_regions: [],
  }
}

function toLegacyEvent(event: DirectChunkEvent): NativeExtractedEvent {
  return {
    event_type: event.event_type,
    logbook_type: event.logbook_type,
    event_date: event.event_date,
    tach_time: event.tach_time,
    airframe_tt: event.airframe_tt,
    tsmoh: event.tsmoh,
    work_description: event.work_description,
    mechanic_name: event.mechanic_name,
    mechanic_cert_number: event.mechanic_cert_number,
    ia_number: event.ia_number,
    ad_references: event.ad_references,
    part_numbers: event.part_numbers,
    return_to_service: event.return_to_service,
    confidence_overall: event.confidence_overall,
  }
}

/** Build pass-through chunks for document_chunks. Tree-builder
 *  (page_tree_nodes) and the vision retriever both read document_chunks;
 *  the canonical layer alone would orphan those retrievers for direct-
 *  chunking docs. Uses the same page*1000+i index scheme that the OCR-
 *  segment promotion path uses, so chunk-id stability is preserved. */
function toLegacyParsedChunks(
  pages: DirectChunkPageResult[],
  metadata: { docType: string; title: string; make?: string | null; model?: string | null },
): NativeParsedChunk[] {
  const chunks: NativeParsedChunk[] = []
  const aircraft = [metadata.make, metadata.model].filter(Boolean).join(' ').trim() || 'Unknown'

  for (const page of pages) {
    for (const chunk of page.chunks) {
      const display = chunk.text
      const section = chunk.section_title ?? 'General'
      const header =
        `Aircraft: ${aircraft}\n` +
        `Document: ${metadata.docType} - ${metadata.title}\n` +
        `Section: ${section}\n` +
        `Pages: ${page.page_number}-${page.page_number}\n---\n`
      chunks.push({
        chunk_index: page.page_number * 1000 + chunk.chunk_index,
        page_number: page.page_number,
        page_number_end: page.page_number,
        section_title: chunk.section_title ?? undefined,
        text_for_embedding: `${header}${display}`,
        display_text: display,
        token_count: Math.max(1, Math.ceil((`${header}${display}`).length / 4)),
      })
    }
  }
  return chunks
}

/** Full-document direct-chunking. Returns a NativeIngestResponse shaped
 *  identically to the legacy OCR engines (so existing orchestrator code
 *  that reads pages[] / chunks[] keeps working), with two additional
 *  fields (`direct_chunking` + `direct_chunking_pages`) that the new
 *  persistence path consumes. */
export async function parseScannedPdfWithDirectChunking(args: {
  fileUrl: string
  docType: string
  title: string
  pageCount: number
  make?: string | null
  model?: string | null
  onProgressUpdate?: (update: OcrProgressUpdate) => Promise<void> | void
}): Promise<NativeIngestResponse> {
  const family = inferDocumentFamily(args.docType)
  const engine = getEngineId()

  const pdfBytes = await downloadPdfBytes(args.fileUrl)
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const actualPageCount = pdfDoc.getPageCount()
  const pageCount = Math.min(args.pageCount, actualPageCount)

  await args.onProgressUpdate?.({
    stage: 'ocr_fallback',
    status: 'running',
    engine,
    pageCount,
    currentBatch: 1,
    totalBatches: 1,
    message: 'direct-chunking pipeline',
  })

  const results: DirectChunkPageResult[] = new Array(pageCount)
  let nextIndex = 0

  async function worker() {
    while (true) {
      const i = nextIndex++
      if (i >= pageCount) return
      const pageNumber = i + 1
      try {
        results[i] = await runDirectChunkingPage({
          pdfDoc,
          pageNumber,
          family,
          docType: args.docType,
          title: args.title,
          make: args.make,
          model: args.model,
        })
      } catch (err) {
        // Per-page failure is non-fatal. The doc-level success-ratio gate
        // below fires the cascade to the next OCR engine if too many pages
        // failed.
        console.warn(
          `[direct-chunking] page ${pageNumber} failed (continuing):`,
          err instanceof Error ? err.message : err,
        )
        results[i] = buildEmptyPageStub({ pageNumber, family, engine })
      }
    }
  }

  await Promise.all(Array.from({ length: PAGE_CONCURRENCY }, worker))

  // Cascade trigger: if too many pages produced no text, throw so the
  // surrounding parseScannedPdfWithFallbacks loop falls through to the
  // next engine.
  const successCount = results.filter((p) => p.raw_text.length > 0).length
  if (successCount < Math.ceil(pageCount * MIN_SUCCESS_RATIO)) {
    throw new Error(
      `direct-chunking produced text on only ${successCount}/${pageCount} pages — ` +
        `below ${MIN_SUCCESS_RATIO * 100}% threshold; falling back`,
    )
  }

  await args.onProgressUpdate?.({
    stage: 'ocr_fallback',
    status: 'completed',
    engine,
    pageCount,
    currentBatch: 1,
    totalBatches: 1,
  })

  return {
    is_text_native: false,
    page_count: pageCount,
    pages: results.map(toLegacyParsedPage),
    chunks: toLegacyParsedChunks(results, {
      docType: args.docType,
      title: args.title,
      make: args.make,
      model: args.model,
    }),
    direct_chunking: true,
    direct_chunking_pages: results,
  }
}
