import { slugify } from '@/lib/utils'
import {
  DOCUMENT_TAXONOMY_GROUPS,
  findDocumentSelection,
  getDocumentItem,
  inferLegacyClassification,
  resolveStoredDocumentClassification,
} from '@/lib/documents/taxonomy'
import { AIRCRAFT_OPERATION_TYPES, type AircraftOperationType } from '@/lib/aircraft/operations'
import type { DocType, Document } from '@/types'

export type RecordFamily =
  | 'legal_ownership'
  | 'airworthiness_certification_configuration'
  | 'logbooks_permanent_records'
  | 'maintenance_program_inspection'
  | 'ad_sb_service_information'
  | 'flight_operations_crew_references'
  | 'engine_prop_components'
  | 'avionics_electrical'
  | 'repairs_alterations_damage'
  | 'parts_traceability_inventory'
  | 'work_orders_shop_execution'
  | 'recurring_compliance'
  | 'usage_time_tracking'
  | 'insurance_finance_commercial'
  | 'authority_correspondence'
  | 'manufacturer_oem_support'
  | 'emergency_safety_equipment'
  | 'checklists_cockpit_references'
  | 'specialized_ops'
  | 'digital_derived_intelligence'
  | 'summary_meta'

export type TruthRole =
  | 'source_of_truth'
  | 'canonical_evidence'
  | 'supporting_evidence'
  | 'reference_only'
  | 'derived_summary'
  | 'regulatory_reference'
  | 'operational_support'
  | 'financial_commercial'
  | 'historical_archive'
  | 'temporary_working'
  | 'non_canonical_evidence'
  | 'needs_review'
  | 'ignore'

export type ParserStrategy =
  | 'native_text_document'
  | 'typed_scanned_form'
  | 'handwritten_logbook'
  | 'mixed_handwritten_typed'
  | 'table_heavy'
  | 'certificate_tag_form'
  | 'letter_correspondence'
  | 'checklist_reference'
  | 'photo_evidence'
  | 'packet_bundle'
  | 'digital_derived_file'
  | 'manual_review_only'
  | 'ignore'

export type ReviewPriority = 'critical' | 'high' | 'normal' | 'low'
export type ClassificationAudience =
  | 'owner'
  | 'operator'
  | 'mechanic'
  | 'lead_mechanic'
  | 'auditor'
  | 'insurance_reviewer'

export const RECORD_FAMILY_LABELS: Record<RecordFamily, string> = {
  legal_ownership: 'Legal & ownership',
  airworthiness_certification_configuration: 'Airworthiness & certification',
  logbooks_permanent_records: 'Logbooks & permanent records',
  maintenance_program_inspection: 'Maintenance program & inspections',
  ad_sb_service_information: 'AD / SB / service information',
  flight_operations_crew_references: 'Flight operations & references',
  engine_prop_components: 'Engines, props & components',
  avionics_electrical: 'Avionics & electrical',
  repairs_alterations_damage: 'Repairs, alterations & damage',
  parts_traceability_inventory: 'Parts & traceability',
  work_orders_shop_execution: 'Work orders & shop execution',
  recurring_compliance: 'Recurring compliance',
  usage_time_tracking: 'Usage & time tracking',
  insurance_finance_commercial: 'Insurance, finance & commercial',
  authority_correspondence: 'Authority correspondence',
  manufacturer_oem_support: 'Manufacturer / OEM support',
  emergency_safety_equipment: 'Emergency & safety equipment',
  checklists_cockpit_references: 'Checklists & cockpit references',
  specialized_ops: 'Specialized operations',
  digital_derived_intelligence: 'Digital / derived intelligence',
  summary_meta: 'Summaries & metadata',
}

export const TRUTH_ROLE_LABELS: Record<TruthRole, string> = {
  source_of_truth: 'Source of truth',
  canonical_evidence: 'Canonical evidence',
  supporting_evidence: 'Supporting evidence',
  reference_only: 'Reference only',
  derived_summary: 'Derived summary',
  regulatory_reference: 'Regulatory reference',
  operational_support: 'Operational support',
  financial_commercial: 'Financial / commercial',
  historical_archive: 'Historical archive',
  temporary_working: 'Temporary working',
  non_canonical_evidence: 'Non-canonical evidence',
  needs_review: 'Needs review',
  ignore: 'Ignore',
}

export interface DocumentClassificationProfile {
  groupId: string
  groupLabel: string
  detailId: string
  detailLabel: string
  docType: DocType
  recordFamily: RecordFamily
  documentClass: string
  truthRole: TruthRole
  parserStrategy: ParserStrategy
  intelligenceTags: string[]
  reviewPriority: ReviewPriority
  isCanonicalCandidate: boolean
  canActivateReminder: boolean
  canSatisfyAdRequirement: boolean
  canSatisfyInspectionRequirement: boolean
  canChangeAircraftStatus: boolean
  canChangeDocumentCompleteness: boolean
  operationOverlays: AircraftOperationType[]
  visibleTo: ClassificationAudience[]
  shouldBeHiddenFromBasicOwnerUi: boolean
  shouldBeVisibleToMechanic: boolean
  shouldBeVisibleToAuditor: boolean
  needsSegmentation: boolean
  needsCrossPageLinking: boolean
}

export interface TaxonomySearchResult {
  groupId: string
  groupLabel: string
  detailId: string
  detailLabel: string
  docType: DocType
  profile: DocumentClassificationProfile
  score: number
  matchedOn: string[]
}

export interface ScanTimeBatchClassOption {
  id: string
  label: string
  groupId: string
  detailId: string
}

export interface ClassificationStorageFields {
  document_group_id: string
  document_detail_id: string
  record_family: RecordFamily
  document_class: string
  truth_role: TruthRole
  parser_strategy: ParserStrategy
  review_priority: ReviewPriority
  canonical_eligibility: boolean
  reminder_relevance: boolean
  ad_relevance: boolean
  inspection_relevance: boolean
  completeness_relevance: boolean
  intelligence_tags: string[]
}

const GROUP_METADATA: Record<
  string,
  {
    recordFamily: RecordFamily
    intelligenceTags: string[]
    defaultTruthRole: TruthRole
    defaultParserStrategy: ParserStrategy
    reviewPriority: ReviewPriority
    canActivateReminder?: boolean
    canSatisfyAdRequirement?: boolean
    canSatisfyInspectionRequirement?: boolean
    canChangeAircraftStatus?: boolean
    canChangeDocumentCompleteness?: boolean
  }
> = {
  legal_and_ownership: {
    recordFamily: 'legal_ownership',
    intelligenceTags: ['identity_ownership'],
    defaultTruthRole: 'source_of_truth',
    defaultParserStrategy: 'typed_scanned_form',
    reviewPriority: 'high',
    canChangeAircraftStatus: true,
    canChangeDocumentCompleteness: true,
  },
  airworthiness_and_certification: {
    recordFamily: 'airworthiness_certification_configuration',
    intelligenceTags: ['certification_configuration'],
    defaultTruthRole: 'canonical_evidence',
    defaultParserStrategy: 'typed_scanned_form',
    reviewPriority: 'critical',
    canChangeAircraftStatus: true,
    canChangeDocumentCompleteness: true,
  },
  aircraft_logbooks_and_permanent_records: {
    recordFamily: 'logbooks_permanent_records',
    intelligenceTags: ['permanent_maintenance_history', 'inspection_history'],
    defaultTruthRole: 'source_of_truth',
    defaultParserStrategy: 'handwritten_logbook',
    reviewPriority: 'critical',
    canActivateReminder: true,
    canSatisfyAdRequirement: true,
    canSatisfyInspectionRequirement: true,
    canChangeAircraftStatus: true,
    canChangeDocumentCompleteness: true,
  },
  maintenance_program_and_inspection_records: {
    recordFamily: 'maintenance_program_inspection',
    intelligenceTags: ['inspection_history', 'operational_reference'],
    defaultTruthRole: 'reference_only',
    defaultParserStrategy: 'native_text_document',
    reviewPriority: 'high',
    canActivateReminder: true,
    canSatisfyInspectionRequirement: true,
    canChangeDocumentCompleteness: true,
  },
  ad_sb_and_service_information: {
    recordFamily: 'ad_sb_service_information',
    intelligenceTags: ['ad_compliance', 'service_information', 'recurring_compliance'],
    defaultTruthRole: 'regulatory_reference',
    defaultParserStrategy: 'native_text_document',
    reviewPriority: 'critical',
    canActivateReminder: true,
    canSatisfyAdRequirement: true,
    canChangeAircraftStatus: true,
    canChangeDocumentCompleteness: true,
  },
  flight_crew_and_operating_documents: {
    recordFamily: 'flight_operations_crew_references',
    intelligenceTags: ['operational_reference'],
    defaultTruthRole: 'reference_only',
    defaultParserStrategy: 'native_text_document',
    reviewPriority: 'normal',
    canChangeDocumentCompleteness: true,
  },
  engines_propellers_apu_and_major_components: {
    recordFamily: 'engine_prop_components',
    intelligenceTags: ['component_lifecycle'],
    defaultTruthRole: 'supporting_evidence',
    defaultParserStrategy: 'typed_scanned_form',
    reviewPriority: 'high',
    canActivateReminder: true,
    canChangeAircraftStatus: true,
    canChangeDocumentCompleteness: true,
  },
  avionics_and_electrical: {
    recordFamily: 'avionics_electrical',
    intelligenceTags: ['avionics_compliance', 'component_lifecycle'],
    defaultTruthRole: 'supporting_evidence',
    defaultParserStrategy: 'typed_scanned_form',
    reviewPriority: 'high',
    canActivateReminder: true,
    canChangeAircraftStatus: true,
    canChangeDocumentCompleteness: true,
  },
  repairs_alterations_and_damage_history: {
    recordFamily: 'repairs_alterations_damage',
    intelligenceTags: ['repair_alteration_damage'],
    defaultTruthRole: 'canonical_evidence',
    defaultParserStrategy: 'typed_scanned_form',
    reviewPriority: 'critical',
    canChangeAircraftStatus: true,
    canChangeDocumentCompleteness: true,
  },
  parts_inventory_and_traceability: {
    recordFamily: 'parts_traceability_inventory',
    intelligenceTags: ['parts_traceability', 'component_lifecycle'],
    defaultTruthRole: 'supporting_evidence',
    defaultParserStrategy: 'certificate_tag_form',
    reviewPriority: 'high',
    canChangeDocumentCompleteness: true,
  },
  work_orders_and_shop_records: {
    recordFamily: 'work_orders_shop_execution',
    intelligenceTags: ['shop_execution'],
    defaultTruthRole: 'supporting_evidence',
    defaultParserStrategy: 'typed_scanned_form',
    reviewPriority: 'high',
    canActivateReminder: true,
    canChangeDocumentCompleteness: true,
  },
  recurring_compliance_and_required_checks: {
    recordFamily: 'recurring_compliance',
    intelligenceTags: ['recurring_compliance'],
    defaultTruthRole: 'canonical_evidence',
    defaultParserStrategy: 'typed_scanned_form',
    reviewPriority: 'critical',
    canActivateReminder: true,
    canSatisfyInspectionRequirement: true,
    canChangeAircraftStatus: true,
    canChangeDocumentCompleteness: true,
  },
  flight_and_usage_records: {
    recordFamily: 'usage_time_tracking',
    intelligenceTags: ['usage_time_tracking'],
    defaultTruthRole: 'supporting_evidence',
    defaultParserStrategy: 'table_heavy',
    reviewPriority: 'high',
    canActivateReminder: true,
    canChangeAircraftStatus: true,
  },
  insurance_finance_and_commercial_records: {
    recordFamily: 'insurance_finance_commercial',
    intelligenceTags: ['finance_insurance'],
    defaultTruthRole: 'financial_commercial',
    defaultParserStrategy: 'typed_scanned_form',
    reviewPriority: 'normal',
    canChangeDocumentCompleteness: true,
  },
  faa_government_authority_correspondence: {
    recordFamily: 'authority_correspondence',
    intelligenceTags: ['authority_correspondence'],
    defaultTruthRole: 'regulatory_reference',
    defaultParserStrategy: 'letter_correspondence',
    reviewPriority: 'high',
    canChangeDocumentCompleteness: true,
  },
  manufacturer_oem_and_delivery_documents: {
    recordFamily: 'manufacturer_oem_support',
    intelligenceTags: ['oem_support'],
    defaultTruthRole: 'supporting_evidence',
    defaultParserStrategy: 'native_text_document',
    reviewPriority: 'normal',
    canChangeDocumentCompleteness: true,
  },
  operational_and_emergency_equipment_records: {
    recordFamily: 'emergency_safety_equipment',
    intelligenceTags: ['emergency_equipment'],
    defaultTruthRole: 'canonical_evidence',
    defaultParserStrategy: 'typed_scanned_form',
    reviewPriority: 'high',
    canActivateReminder: true,
    canChangeAircraftStatus: true,
    canChangeDocumentCompleteness: true,
  },
  checklists_and_cockpit_references: {
    recordFamily: 'checklists_cockpit_references',
    intelligenceTags: ['checklist_reference', 'operational_reference'],
    defaultTruthRole: 'reference_only',
    defaultParserStrategy: 'checklist_reference',
    reviewPriority: 'low',
    canChangeDocumentCompleteness: true,
  },
  specialized_aircraft_type_and_mission_specific_records: {
    recordFamily: 'specialized_ops',
    intelligenceTags: ['specialized_ops', 'component_lifecycle'],
    defaultTruthRole: 'supporting_evidence',
    defaultParserStrategy: 'typed_scanned_form',
    reviewPriority: 'high',
    canActivateReminder: true,
    canChangeAircraftStatus: true,
    canChangeDocumentCompleteness: true,
  },
  digital_records_ai_and_internal_intelligence_files: {
    recordFamily: 'digital_derived_intelligence',
    intelligenceTags: ['derived_intelligence', 'summary_meta'],
    defaultTruthRole: 'derived_summary',
    defaultParserStrategy: 'digital_derived_file',
    reviewPriority: 'low',
    canChangeDocumentCompleteness: true,
  },
  master_summaries_and_status_sheets: {
    recordFamily: 'summary_meta',
    intelligenceTags: ['summary_meta', 'derived_intelligence'],
    defaultTruthRole: 'derived_summary',
    defaultParserStrategy: 'digital_derived_file',
    reviewPriority: 'normal',
    canChangeDocumentCompleteness: true,
  },
}

const DETAIL_ALIASES: Record<string, string[]> = {
  airframe_logbooks: ['airframe logbook', 'airframe logs', 'logbook'],
  engine_logbooks: ['engine logbook', 'engine logs'],
  propeller_logbooks: ['prop logbook', 'propeller logbook'],
  avionics_logbooks: ['avionics logbook'],
  annual_inspection_records: ['annual inspection', 'annual'],
  '100_hour_inspection_records': ['100 hour', '100-hour', 'hundred hour'],
  faa_form_337_records: ['337', 'faa 337', 'form 337'],
  faa_form_8130_documents: ['8130', '8130 document', 'faa 8130'],
  faa_form_8130_3: ['8130-3', 'faa 8130-3', 'yellow tag', 'return to service tag'],
  pilot_s_operating_handbook_poh: ['poh', 'operating handbook', 'pilot handbook'],
  airplane_flight_manual_afm: ['afm', 'flight manual'],
  approved_flight_manual_supplements: ['afm supplement', 'flight manual supplement'],
  service_bulletins: ['service bulletin', 'sb', 'mandatory sb'],
  ad_compliance_records: ['ad', 'airworthiness directive', 'ad compliance'],
  maintenance_work_orders: ['work order', 'shop order'],
  discrepancy_lists: ['discrepancy', 'squawk', 'squawk list'],
  weight_and_balance_report: ['weight and balance', 'weight balance'],
  maintenance_manual: ['maintenance manual', 'mx manual'],
  service_manual: ['service manual', 'overhaul manual'],
  parts_catalog: ['ipc', 'parts catalog', 'illustrated parts catalog'],
  insurance_policies: ['insurance'],
  certificate_of_aircraft_registration: ['registration', 'certificate of registration'],
}

export const SCAN_TIME_BATCH_CLASSES: ScanTimeBatchClassOption[] = [
  { id: 'airframe_logbook', label: 'Airframe Logbook', groupId: 'aircraft_logbooks_and_permanent_records', detailId: 'airframe_logbooks' },
  { id: 'engine_logbook', label: 'Engine Logbook', groupId: 'aircraft_logbooks_and_permanent_records', detailId: 'engine_logbooks' },
  { id: 'propeller_logbook', label: 'Propeller Logbook', groupId: 'aircraft_logbooks_and_permanent_records', detailId: 'propeller_logbooks' },
  { id: 'avionics_logbook', label: 'Avionics Logbook', groupId: 'aircraft_logbooks_and_permanent_records', detailId: 'avionics_logbooks' },
  { id: 'inspection_records', label: 'Inspection Records', groupId: 'maintenance_program_and_inspection_records', detailId: 'inspection_program_documents' },
  { id: 'ad_sb_compliance', label: 'AD / SB / Compliance', groupId: 'ad_sb_and_service_information', detailId: 'ad_compliance_records' },
  { id: 'faa_forms_tags_certifications', label: 'FAA Forms / Tags / Certifications', groupId: 'airworthiness_and_certification', detailId: 'faa_form_337_records' },
  { id: 'work_orders_shop_records', label: 'Work Orders / Shop Records', groupId: 'work_orders_and_shop_records', detailId: 'maintenance_work_orders' },
  { id: 'legal_registration_ownership', label: 'Legal / Registration / Ownership', groupId: 'legal_and_ownership', detailId: 'certificate_of_aircraft_registration' },
  { id: 'flight_manual_checklist_reference', label: 'Flight Manual / Checklist / Reference', groupId: 'flight_crew_and_operating_documents', detailId: 'pilot_s_operating_handbook_poh' },
  { id: 'parts_traceability_inventory', label: 'Parts / Traceability / Inventory', groupId: 'parts_inventory_and_traceability', detailId: 'traceability_documents' },
  { id: 'correspondence_letters', label: 'Correspondence / Letters', groupId: 'faa_government_authority_correspondence', detailId: 'faa_letters' },
  { id: 'insurance_finance_commercial', label: 'Insurance / Finance / Commercial', groupId: 'insurance_finance_and_commercial_records', detailId: 'insurance_policies' },
  { id: 'summary_packet_derived', label: 'Summary / Packet / Derived', groupId: 'master_summaries_and_status_sheets', detailId: 'aircraft_status_summary' },
  { id: 'unknown', label: 'Unknown', groupId: 'digital_records_ai_and_internal_intelligence_files', detailId: 'master_document_register' },
]

function buildSearchableTokens(groupLabel: string, detailLabel: string, aliases: string[]) {
  return [
    groupLabel,
    detailLabel,
    slugify(groupLabel),
    slugify(detailLabel),
    ...aliases,
    ...aliases.map((value) => slugify(value)),
  ]
}

function inferTruthRole(groupId: string, docType: DocType, detailId: string): TruthRole {
  const groupDefaults = GROUP_METADATA[groupId]
  if (!groupDefaults) return 'supporting_evidence'
  if (groupId === 'flight_crew_and_operating_documents' || groupId === 'checklists_and_cockpit_references') {
    return 'reference_only'
  }
  if (groupId === 'digital_records_ai_and_internal_intelligence_files' || groupId === 'master_summaries_and_status_sheets') {
    return 'derived_summary'
  }
  if (docType === 'work_order') return 'supporting_evidence'
  if (docType === 'airworthiness_directive' || detailId.includes('ad_')) return 'canonical_evidence'
  if (docType === 'inspection_report') return 'canonical_evidence'
  if (docType === 'logbook') return 'source_of_truth'
  return groupDefaults.defaultTruthRole
}

function inferParserStrategy(groupId: string, docType: DocType, detailId: string): ParserStrategy {
  if (docType === 'logbook') return detailId.includes('historical') ? 'mixed_handwritten_typed' : 'handwritten_logbook'
  if (docType === 'form_337' || docType === 'form_8130' || detailId.includes('tag')) return 'certificate_tag_form'
  if (groupId === 'faa_government_authority_correspondence') return 'letter_correspondence'
  if (groupId === 'checklists_and_cockpit_references') return 'checklist_reference'
  if (groupId === 'master_summaries_and_status_sheets' || groupId === 'digital_records_ai_and_internal_intelligence_files') {
    return 'digital_derived_file'
  }
  if (docType === 'service_manual' || docType === 'parts_catalog') return 'table_heavy'
  return GROUP_METADATA[groupId]?.defaultParserStrategy ?? 'native_text_document'
}

function withUnique<T>(values: T[]) {
  return [...new Set(values)]
}

function inferOperationOverlays(groupId: string): AircraftOperationType[] {
  switch (groupId) {
    case 'insurance_finance_and_commercial_records':
      return ['leaseback_rental', 'part_135_charter', 'corporate_flight_department']
    case 'specialized_aircraft_type_and_mission_specific_records':
      return ['special_mission', 'government_public_use', 'part_135_charter']
    case 'flight_and_usage_records':
    case 'recurring_compliance_and_required_checks':
      return ['flight_school', 'flying_club', 'leaseback_rental', 'part_135_charter', 'corporate_flight_department']
    default:
      return [...AIRCRAFT_OPERATION_TYPES]
  }
}

function inferVisibility(
  recordFamily: RecordFamily,
  truthRole: TruthRole,
  groupId: string
): ClassificationAudience[] {
  if (recordFamily === 'digital_derived_intelligence') {
    return ['mechanic', 'lead_mechanic', 'auditor']
  }
  if (recordFamily === 'insurance_finance_commercial') {
    return ['owner', 'operator', 'auditor', 'insurance_reviewer']
  }
  if (recordFamily === 'legal_ownership') {
    return ['owner', 'operator', 'auditor']
  }
  if (truthRole === 'reference_only' && groupId === 'flight_crew_and_operating_documents') {
    return ['owner', 'operator', 'mechanic', 'lead_mechanic']
  }
  return ['owner', 'operator', 'mechanic', 'lead_mechanic', 'auditor']
}

function inferSegmentationFlags(
  recordFamily: RecordFamily,
  docType: DocType,
  parserStrategy: ParserStrategy
) {
  const needsSegmentation =
    recordFamily === 'logbooks_permanent_records' ||
    recordFamily === 'work_orders_shop_execution' ||
    recordFamily === 'recurring_compliance' ||
    docType === 'inspection_report' ||
    parserStrategy === 'handwritten_logbook' ||
    parserStrategy === 'mixed_handwritten_typed'

  return {
    needsSegmentation,
    needsCrossPageLinking:
      needsSegmentation ||
      parserStrategy === 'table_heavy' ||
      parserStrategy === 'packet_bundle',
  }
}

export function getDocumentClassificationProfileByIds(
  groupId?: string | null,
  detailId?: string | null
): DocumentClassificationProfile | null {
  const selection = findDocumentSelection(groupId, detailId)
  if (!selection) return null

  const groupDefaults = GROUP_METADATA[selection.group.id]
  const truthRole = inferTruthRole(selection.group.id, selection.detail.docType, selection.detail.id)
  const parserStrategy = inferParserStrategy(selection.group.id, selection.detail.docType, selection.detail.id)
  const intelligenceTags = withUnique([
    ...(groupDefaults?.intelligenceTags ?? []),
    selection.detail.docType === 'logbook' ? 'permanent_maintenance_history' : '',
    selection.detail.docType === 'inspection_report' ? 'inspection_history' : '',
    selection.detail.docType === 'work_order' ? 'shop_execution' : '',
    selection.detail.docType === 'airworthiness_directive' ? 'ad_compliance' : '',
    selection.detail.docType === 'service_bulletin' ? 'service_information' : '',
    selection.detail.docType === 'form_8130' ? 'parts_traceability' : '',
  ].filter(Boolean) as string[])

  const isCanonicalCandidate =
    truthRole === 'source_of_truth' || truthRole === 'canonical_evidence'
  const recordFamily = groupDefaults?.recordFamily ?? 'digital_derived_intelligence'
  const operationOverlays = inferOperationOverlays(selection.group.id)
  const visibleTo = inferVisibility(recordFamily, truthRole, selection.group.id)
  const segmentation = inferSegmentationFlags(recordFamily, selection.detail.docType, parserStrategy)

  return {
    groupId: selection.group.id,
    groupLabel: selection.group.label,
    detailId: selection.detail.id,
    detailLabel: selection.detail.label,
    docType: selection.detail.docType,
    recordFamily,
    documentClass: selection.detail.id,
    truthRole,
    parserStrategy,
    intelligenceTags,
    reviewPriority: groupDefaults?.reviewPriority ?? 'normal',
    isCanonicalCandidate,
    canActivateReminder: Boolean(groupDefaults?.canActivateReminder || selection.detail.docType === 'inspection_report'),
    canSatisfyAdRequirement: Boolean(groupDefaults?.canSatisfyAdRequirement || selection.detail.docType === 'airworthiness_directive'),
    canSatisfyInspectionRequirement: Boolean(groupDefaults?.canSatisfyInspectionRequirement || selection.detail.docType === 'inspection_report'),
    canChangeAircraftStatus: Boolean(groupDefaults?.canChangeAircraftStatus || isCanonicalCandidate),
    canChangeDocumentCompleteness: Boolean(groupDefaults?.canChangeDocumentCompleteness ?? true),
    operationOverlays,
    visibleTo,
    shouldBeHiddenFromBasicOwnerUi: !visibleTo.includes('owner'),
    shouldBeVisibleToMechanic: visibleTo.includes('mechanic') || visibleTo.includes('lead_mechanic'),
    shouldBeVisibleToAuditor: visibleTo.includes('auditor'),
    needsSegmentation: segmentation.needsSegmentation,
    needsCrossPageLinking: segmentation.needsCrossPageLinking,
  }
}

export function getDocumentClassificationProfileBySelection(
  groupId?: string | null,
  detailId?: string | null,
  fallbackDocType: DocType = 'miscellaneous'
): DocumentClassificationProfile | null {
  const direct = getDocumentClassificationProfileByIds(groupId, detailId)
  if (direct) return direct

  const fallbackSelection = inferLegacyClassification(fallbackDocType)
  return getDocumentClassificationProfileByIds(
    fallbackSelection.groupId,
    fallbackSelection.detailId
  )
}

export function getDocumentClassificationProfile(
  document: Pick<Document, 'doc_type'> & {
    document_group_id?: string | null
    document_detail_id?: string | null
  }
): DocumentClassificationProfile {
  const resolved = resolveStoredDocumentClassification(document)
  const profile = getDocumentClassificationProfileBySelection(
    resolved.groupId,
    resolved.detailId,
    document.doc_type
  )
  if (!profile) {
    throw new Error(`Unable to build classification profile for ${resolved.groupId}/${resolved.detailId}`)
  }
  return profile
}

export function buildClassificationStorageFields(
  profile: DocumentClassificationProfile
): ClassificationStorageFields {
  return {
    document_group_id: profile.groupId,
    document_detail_id: profile.detailId,
    record_family: profile.recordFamily,
    document_class: profile.documentClass,
    truth_role: profile.truthRole,
    parser_strategy: profile.parserStrategy,
    review_priority: profile.reviewPriority,
    canonical_eligibility: profile.isCanonicalCandidate,
    reminder_relevance: profile.canActivateReminder,
    ad_relevance: profile.canSatisfyAdRequirement,
    inspection_relevance: profile.canSatisfyInspectionRequirement,
    completeness_relevance: profile.canChangeDocumentCompleteness,
    intelligence_tags: profile.intelligenceTags,
  }
}

export function buildClassificationStorageFieldsBySelection(
  groupId?: string | null,
  detailId?: string | null,
  fallbackDocType: DocType = 'miscellaneous'
): ClassificationStorageFields | null {
  const profile = getDocumentClassificationProfileBySelection(
    groupId,
    detailId,
    fallbackDocType
  )
  if (!profile) return null
  return buildClassificationStorageFields(profile)
}

export function documentMatchesClassification(
  document: Pick<Document, 'doc_type'> & {
    document_group_id?: string | null
    document_detail_id?: string | null
  },
  match: {
    docTypes?: DocType[]
    groupIds?: string[]
    detailIds?: string[]
  }
) {
  const resolved = resolveStoredDocumentClassification(document)

  if (match.docTypes && match.docTypes.length > 0 && !match.docTypes.includes(document.doc_type)) {
    return false
  }

  if (match.groupIds && match.groupIds.length > 0 && !match.groupIds.includes(resolved.groupId)) {
    return false
  }

  if (match.detailIds && match.detailIds.length > 0 && !match.detailIds.includes(resolved.detailId)) {
    return false
  }

  return true
}

export function searchDocumentTaxonomy(query: string): TaxonomySearchResult[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return []
  const tokens = normalized.split(/\s+/).filter(Boolean)

  const results: TaxonomySearchResult[] = []

  for (const group of DOCUMENT_TAXONOMY_GROUPS) {
    for (const detail of group.details) {
      const aliases = DETAIL_ALIASES[detail.id] ?? []
      const searchable = buildSearchableTokens(group.label, detail.label, aliases)
      let score = 0
      const matchedOn: string[] = []

      for (const value of searchable) {
        const candidate = value.toLowerCase()
        if (candidate === normalized) {
          score += 120
          matchedOn.push(value)
        } else if (candidate.startsWith(normalized)) {
          score += 80
          matchedOn.push(value)
        } else if (candidate.includes(normalized)) {
          score += 50
          matchedOn.push(value)
        } else if (tokens.every((token) => candidate.includes(token))) {
          score += 35
          matchedOn.push(value)
        }
      }

      if (score === 0) continue

      const profile = getDocumentClassificationProfileByIds(group.id, detail.id)
      if (!profile) continue

      results.push({
        groupId: group.id,
        groupLabel: group.label,
        detailId: detail.id,
        detailLabel: detail.label,
        docType: detail.docType,
        profile,
        score,
        matchedOn: withUnique(matchedOn).slice(0, 3),
      })
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 12)
}

export function inferScanTimeBatchClass(
  groupId?: string | null,
  detailId?: string | null
): string {
  const exact = SCAN_TIME_BATCH_CLASSES.find(
    (option) => option.groupId === groupId && option.detailId === detailId
  )
  if (exact) return exact.id

  switch (groupId) {
    case 'aircraft_logbooks_and_permanent_records':
      return 'airframe_logbook'
    case 'maintenance_program_and_inspection_records':
      return 'inspection_records'
    case 'ad_sb_and_service_information':
      return 'ad_sb_compliance'
    case 'airworthiness_and_certification':
      return 'faa_forms_tags_certifications'
    case 'work_orders_and_shop_records':
      return 'work_orders_shop_records'
    case 'legal_and_ownership':
      return 'legal_registration_ownership'
    case 'flight_crew_and_operating_documents':
      return 'flight_manual_checklist_reference'
    case 'parts_inventory_and_traceability':
      return 'parts_traceability_inventory'
    case 'faa_government_authority_correspondence':
      return 'correspondence_letters'
    case 'insurance_finance_and_commercial_records':
      return 'insurance_finance_commercial'
    case 'master_summaries_and_status_sheets':
    case 'digital_records_ai_and_internal_intelligence_files':
      return 'summary_packet_derived'
    default:
      return 'unknown'
  }
}

export function getScanTimeBatchClassOption(id: string | null | undefined) {
  return SCAN_TIME_BATCH_CLASSES.find((option) => option.id === id) ?? null
}

export function getDocumentClassificationSummary(detailId?: string | null) {
  const detail = getDocumentItem(detailId)
  if (!detail) return null
  return getDocumentClassificationProfileByIds(detail.groupId, detail.id)
}
