import { slugify } from '@/lib/utils'
import type { DocType, Document } from '@/types'
import type { BatchType, BatchSourceMode } from '@/lib/scanner/types'

type DetailSeed =
  | string
  | {
      label: string
      docType?: DocType
      id?: string
    }

export interface DocumentDetailDefinition {
  id: string
  label: string
  docType: DocType
}

export interface DocumentGroupDefinition {
  id: string
  label: string
  details: DocumentDetailDefinition[]
}

export interface DocumentSelectionDefinition {
  group: DocumentGroupDefinition
  detail: DocumentDetailDefinition
}

function toIdentifier(value: string): string {
  return slugify(value).replace(/-/g, '_')
}

function defineGroup(
  id: string,
  label: string,
  defaultDocType: DocType,
  details: DetailSeed[]
): DocumentGroupDefinition {
  return {
    id,
    label,
    details: details.map((detail) => {
      const seed = typeof detail === 'string' ? { label: detail, docType: defaultDocType } : detail
      return {
        id: seed.id ?? toIdentifier(seed.label),
        label: seed.label,
        docType: seed.docType ?? defaultDocType,
      }
    }),
  }
}

export const DOCUMENT_GROUPS: DocumentGroupDefinition[] = [
  defineGroup('legal_and_ownership', 'Legal and Ownership', 'lease_ownership', [
    'Certificate of Aircraft Registration',
    'Temporary Registration',
    'Registration History',
    'Bill of Sale',
    'Prior Bills of Sale',
    'Chain of Ownership Documents',
    'Purchase Agreement',
    'Delivery Acceptance Documents',
    'Lease Agreements',
    'Trust Ownership Documents',
    'Security Agreement / Lender Documents',
    'Lien Documents',
    'Release of Lien Documents',
    'Import Documents',
    'Export Documents',
    'Customs Clearance Records',
    'State Tax Documents',
    'Use Tax Documents',
    'Legal Notices',
    'Ownership Transfer Documents',
    'N-Number Reservation Documents',
  ]),
  defineGroup('airworthiness_and_certification', 'Airworthiness and Certification', 'compliance', [
    'Standard Airworthiness Certificate',
    'Special Airworthiness Certificate',
    'Export Certificate of Airworthiness',
    { label: 'FAA Form 8130 Documents', docType: 'form_8130' },
    'Original Conformity Documents',
    'Type Certificate Data Sheet (TCDS)',
    'Supplemental Type Certificates (STCs)',
    'STC ICAs',
    'Field Approvals',
    { label: 'FAA Form 337 Records', docType: 'form_337' },
    { label: 'Approved Flight Manual Supplements', docType: 'afm_supplement' },
    'Equipment List',
    'Weight and Balance Report',
    'Revised Weight and Balance Amendments',
    'Aircraft Status Sheet',
    'Noise Certificate',
    'Radio Station License',
    'Airworthiness Authority Supporting Documents',
  ]),
  defineGroup(
    'aircraft_logbooks_and_permanent_records',
    'Aircraft Logbooks and Permanent Records',
    'logbook',
    [
      'Airframe Logbooks',
      'Engine Logbooks',
      'Propeller Logbooks',
      'APU Logbooks',
      'Rotorcraft Component Logbooks',
      'Avionics Logbooks',
      'Appliance / Accessory Logbooks',
      'Serialized Component History Cards',
      'Component Cards',
      'Journey Log',
      'Tech Log',
      'Flight Log',
      'Maintenance Release Records',
      'Return to Service Records',
      'Historical Logbook Scans',
      'Lost Logbook Affidavits',
      'Reconstructed Record Documents',
    ]
  ),
  defineGroup(
    'maintenance_program_and_inspection_records',
    'Maintenance Program and Inspection Records',
    'maintenance_manual',
    [
      'Approved Maintenance Program',
      'Maintenance Manual',
      { label: 'Service Manual', docType: 'service_manual' },
      { label: 'Overhaul Manual', docType: 'service_manual' },
      'Structural Repair Manual (SRM)',
      { label: 'Illustrated Parts Catalog (IPC)', docType: 'parts_catalog' },
      { label: 'Parts Catalog', docType: 'parts_catalog' },
      'Wiring Diagram Manual',
      'Fault Isolation Manual',
      'Troubleshooting Manual',
      'Component Maintenance Manuals (CMMs)',
      { label: 'Inspection Program Documents', docType: 'inspection_report' },
      { label: 'Annual Inspection Records', docType: 'inspection_report' },
      { label: '100-Hour Inspection Records', docType: 'inspection_report', id: '100_hour_inspection_records' },
      { label: 'Progressive Inspection Records', docType: 'inspection_report' },
      { label: 'Phase Inspection Records', docType: 'inspection_report' },
      { label: 'CAMP / Continuous Airworthiness Records', docType: 'inspection_report' },
      { label: 'Corrosion Inspection Records', docType: 'inspection_report' },
      { label: 'Structural Inspection Records', docType: 'inspection_report' },
      { label: 'Special Inspection Records', docType: 'inspection_report' },
      { label: 'Non-Routine Inspection Records', docType: 'inspection_report' },
    ]
  ),
  defineGroup('ad_sb_and_service_information', 'AD / SB / Service Information', 'compliance', [
    { label: 'Airworthiness Directive Master List', docType: 'airworthiness_directive' },
    { label: 'AD Compliance Records', docType: 'compliance' },
    { label: 'Recurring AD Compliance Records', docType: 'compliance' },
    { label: 'AD Method of Compliance Documents', docType: 'airworthiness_directive' },
    { label: 'AD Supporting Signoffs', docType: 'compliance' },
    { label: 'AD Supporting Work Orders', docType: 'work_order' },
    { label: 'Service Bulletins', docType: 'service_bulletin' },
    { label: 'Mandatory Service Bulletins', docType: 'service_bulletin' },
    { label: 'Service Letters', docType: 'service_bulletin' },
    { label: 'Service Instructions', docType: 'service_bulletin' },
    { label: 'Service Kits', docType: 'service_bulletin' },
    { label: 'Service Change Notices', docType: 'service_bulletin' },
    { label: 'Vendor Bulletins', docType: 'service_bulletin' },
    { label: 'ICA Revisions', docType: 'compliance' },
    { label: 'FAA SAIBs', docType: 'airworthiness_directive' },
    'Advisory Notices',
    'OEM Technical Correspondence',
  ]),
  defineGroup('flight_crew_and_operating_documents', 'Flight Crew and Operating Documents', 'poh', [
    { label: "Pilot's Operating Handbook (POH)", docType: 'poh', id: 'pilot_s_operating_handbook_poh' },
    { label: 'Airplane Flight Manual (AFM)', docType: 'afm', id: 'airplane_flight_manual_afm' },
    { label: 'Rotorcraft Flight Manual', docType: 'afm' },
    { label: 'Approved Flight Manual Supplements', docType: 'afm_supplement' },
    'Quick Reference Handbook',
    'Checklist Handbook',
    'Normal Procedures',
    'Emergency Procedures',
    'Abnormal Procedures',
    'Performance Charts',
    'Limitations Section',
    'Placard List',
    'Cockpit Markings Reference',
    'Minimum Equipment List (MEL)',
    'Configuration Deviation List (CDL)',
    'KOEL / Kinds of Operation Equipment List',
  ]),
  defineGroup(
    'engines_propellers_apu_and_major_components',
    'Engines, Propellers, APU, and Major Components',
    'miscellaneous',
    [
      'Engine Installation Records',
      'Engine Overhaul Records',
      'Engine Teardown Reports',
      'Engine Inspection Reports',
      'Compression Test Records',
      'Borescope Reports',
      'Oil Analysis Reports',
      'Trend Monitoring Records',
      'Propeller Overhaul Records',
      'Propeller Balance Records',
      'Governor Records',
      'Magneto Records',
      'Turbocharger Records',
      'Starter Records',
      'Alternator Records',
      'Generator Records',
      'Landing Gear Overhaul Records',
      'Shock Strut Service Records',
      'Brake Records',
      'Wheel Records',
      'Battery Records',
      'ELT Records',
      'ELT Battery Expiry Records',
      'Oxygen System Records',
      'Fire Extinguisher Inspection Records',
      'Vacuum Pump Records',
      'Fuel System Component Records',
      'Hose Replacement Records',
      'Life-Limited Component Tracking Records',
    ]
  ),
  defineGroup('avionics_and_electrical', 'Avionics and Electrical', 'miscellaneous', [
    'Avionics Installation Records',
    'Wiring Modification Records',
    'Avionics Manuals',
    'Navigation Database Update Records',
    'Software Update Records',
    'Firmware Update Records',
    'Avionics STC Records',
    'Antenna Installation Records',
    'Transponder Certification Tests',
    'Altimeter Test Records',
    'Pitot-Static Test Records',
    'IFR Certification Records',
    'ELT Test Records',
    'ADS-B Compliance Records',
    'Autopilot Calibration Records',
  ]),
  defineGroup('repairs_alterations_and_damage_history', 'Repairs, Alterations, and Damage History', 'miscellaneous', [
    'Major Repair Records',
    'Minor Repair Records',
    'Major Alteration Records',
    'Minor Alteration Records',
    { label: 'FAA Form 337 Records', docType: 'form_337' },
    'Damage History Records',
    'Incident Repair Records',
    'Accident Repair Records',
    'Structural Repair Approvals',
    'Corrosion Treatment Records',
    'Composite Repair Records',
    'Paint Records',
    'Interior Refurbishment Records',
    'Modification Packages',
    'Engineering Orders',
    'DER Approvals',
    'Repair Station Release Documents',
    'Return to Service Tags',
    'Repair Photographs',
    'Insurance Repair Documentation',
  ]),
  defineGroup('parts_inventory_and_traceability', 'Parts, Inventory, and Traceability', 'miscellaneous', [
    { label: 'Illustrated Parts Catalog', docType: 'parts_catalog' },
    { label: 'Parts Manuals', docType: 'parts_catalog' },
    'Parts Purchase Invoices',
    'Vendor Invoices',
    'Packing Slips',
    'Traceability Documents',
    { label: 'FAA Form 8130-3', docType: 'form_8130', id: 'faa_form_8130_3' },
    'EASA Form 1',
    'Certificates of Conformity',
    'Yellow Tags',
    'Shelf-Life Tracking Records',
    'Serialized Parts Inventory Records',
    'Rotable Pool Records',
    'Loaner Component Records',
    'Removed Parts Records',
    'Scrap Tags',
  ]),
  defineGroup('work_orders_and_shop_records', 'Work Orders and Shop Records', 'work_order', [
    'Maintenance Work Orders',
    'Internal Shop Work Cards',
    'Task Cards',
    'Work Scopes',
    'Squawk Lists',
    'Discrepancy Lists',
    'Corrective Action Records',
    'Deferred Maintenance Records',
    'Labor Records',
    'Inspection Signoff Sheets',
    'Contractor Work Orders',
    'Repair Station Work Orders',
    'Shop Visit Reports',
    'Maintenance Release Certificates',
    'Service Center Reports',
  ]),
  defineGroup('recurring_compliance_and_required_checks', 'Recurring Compliance and Required Checks', 'inspection_report', [
    'ELT Inspection Records',
    'ELT Battery Replacement Records',
    'Pitot-Static Check Records',
    'Altimeter Check Records',
    'Transponder Inspection Records',
    'IFR Certification Check Records',
    'VOR Check Logs',
    'Emergency Equipment Inspection Records',
    'Oxygen Bottle Hydrostatic Records',
    'Fire Bottle Servicing Records',
    'Compass Swing Records',
    'Updated Weight and Balance Records',
    'Aging Aircraft Inspection Records',
    'Corrosion Program Compliance Records',
    'Time-Limited Component Replacement Records',
  ]),
  defineGroup('flight_and_usage_records', 'Flight and Usage Records', 'logbook', [
    'Hobbs Time Records',
    'Tach Time Records',
    'Flight Time Summaries',
    'Airframe Total Time Records',
    'Engine Total Time Records',
    'SMOH Records',
    'Propeller Total Time Records',
    'SPOH Records',
    'Cycle Counts',
    'Landing Counts',
    'APU Hours Records',
    'APU Cycle Records',
    'Mission Records',
    'Utilization Reports',
    'Dispatch Reliability Records',
  ]),
  defineGroup('insurance_finance_and_commercial_records', 'Insurance, Finance, and Commercial Records', 'insurance', [
    'Insurance Policies',
    'Certificates of Insurance',
    'Claims Records',
    'Loss History',
    'Appraisals',
    'Aircraft Valuation Reports',
    'Lender Inspection Reports',
    { label: 'Financing Agreements', docType: 'lease_ownership' },
    { label: 'Lease Return Condition Reports', docType: 'lease_ownership' },
    'Pre-Buy Inspection Reports',
    'Buyer Due Diligence Packets',
    'Auditor Summaries',
    'Asset Management Reports',
  ]),
  defineGroup('faa_government_authority_correspondence', 'FAA / Government / Authority Correspondence', 'compliance', [
    'FAA Registration Correspondence',
    'Registration Renewal Notices',
    'FAA Letters',
    'FAA Deficiency Letters',
    'FAA Compliance Letters',
    'FAA Approval Letters',
    'FAA Field Approval Correspondence',
    'FAA Inquiry Correspondence',
    'FAA Enforcement Correspondence',
    'Registration Cancellation Letters',
    'Registration Transfer Letters',
    'Export Authority Letters',
    'Import Authority Letters',
    'Airworthiness Authority Correspondence',
    'Manufacturer Letters',
    'Dealer Letters',
    'Lessor Letters',
  ]),
  defineGroup('manufacturer_oem_and_delivery_documents', 'Manufacturer / OEM / Delivery Documents', 'miscellaneous', [
    'OEM Delivery Documents',
    'Factory Build Sheet',
    'Equipment / Options List',
    'Original Delivery Inventory',
    'Warranty Records',
    'Warranty Claims',
    'OEM Support Letters',
    'Service Difficulty Communications',
    'Product Improvement Program Documents',
    'Continued Operational Safety Notices',
    'Cabin Completion Records',
    'Interior Completion Records',
  ]),
  defineGroup('operational_and_emergency_equipment_records', 'Operational and Emergency Equipment Records', 'inspection_report', [
    'Survival Equipment Inspection Records',
    'Raft Inspection Records',
    'Life Vest Inspection Records',
    'First Aid Kit Records',
    'ELT Records',
    'Portable Oxygen Records',
    'Oxygen Mask Records',
    'Fire Extinguisher Records',
    'Emergency Equipment Location List',
  ]),
  defineGroup('checklists_and_cockpit_references', 'Checklists and Cockpit References', 'poh', [
    'Normal Checklist',
    'Before Start Checklist',
    'Start Checklist',
    'Taxi Checklist',
    'Run-Up Checklist',
    'Takeoff Checklist',
    'Cruise Checklist',
    'Descent Checklist',
    'Before Landing Checklist',
    'After Landing Checklist',
    'Shutdown Checklist',
    'Emergency Checklist',
    'Abnormal Checklist',
    'Winter Operations Checklist',
    'Ferry Flight Checklist',
    'Ground Handling Checklist',
  ]),
  defineGroup(
    'specialized_aircraft_type_and_mission_specific_records',
    'Specialized / Aircraft-Type / Mission-Specific Records',
    'miscellaneous',
    [
      'Rotor Blade Records',
      'Tail Rotor Records',
      'Gearbox Records',
      'Life-Limited Parts List',
      'Cargo Hook Records',
      'Floats Records',
      'Skis Records',
      'Agricultural Spray System Records',
      'Charter / Part 135 Compliance Records',
      'Flight School Records',
      'Rental Records',
      'Part 91 Manuals',
      'Part 135 Manuals',
      'Part 145 Manuals',
      'RVSM Approval Records',
      'ETOPS Approval Records',
      'Special Operations Approvals',
      'Pressurization System Records',
      'De-Ice System Records',
      'Anti-Ice System Records',
    ]
  ),
  defineGroup(
    'digital_records_ai_and_internal_intelligence_files',
    'Digital Records, AI, and Internal Intelligence Files',
    'miscellaneous',
    [
      'Scanned Copies of All Logs',
      'OCR Text Extracts',
      'Searchable Maintenance History',
      'Missing Document List',
      'Missing Record Gap Analysis',
      'Component Time Tracking Sheets',
      'AD / SB Master Tracker',
      'Inspection Due Tracker',
      'Upcoming Maintenance Forecast',
      'Aircraft Records Index',
      'Master Document Register',
      'Folder Structure Reference',
      'Naming Convention Reference',
      'Pre-Buy Summary Packet',
      'Insurance Packet',
      'Lender Packet',
      'Audit Packet',
      'Export Packet',
      'Backup Archive Copies',
    ]
  ),
  defineGroup('master_summaries_and_status_sheets', 'Master Summaries and Status Sheets', 'miscellaneous', [
    'Aircraft Document Checklist',
    'Aircraft Status Summary',
    'Airworthiness Summary',
    'Registration Summary',
    'Ownership Summary',
    'Damage History Summary',
    'Modification Summary',
    'Engine Status Summary',
    'Propeller Status Summary',
    'Component Due List',
    'Inspection Due List',
    'AD Due List',
    'SB Recommended Action List',
    'Record Gaps / Missing Items Summary',
  ]),
]

export const DOCUMENT_GROUP_MAP = Object.fromEntries(
  DOCUMENT_GROUPS.map((group) => [group.id, group])
) as Record<string, DocumentGroupDefinition>

const DOCUMENT_DETAIL_ID_SET = new Set(
  DOCUMENT_GROUPS.flatMap((group) => group.details.map((detail) => detail.id))
)

const COMMON_DOCUMENT_CLASSIFICATIONS: Array<{ groupId: string; detailId: string }> = [
  { groupId: 'aircraft_logbooks_and_permanent_records', detailId: 'airframe_logbooks' },
  { groupId: 'aircraft_logbooks_and_permanent_records', detailId: 'engine_logbooks' },
  { groupId: 'aircraft_logbooks_and_permanent_records', detailId: 'propeller_logbooks' },
  { groupId: 'work_orders_and_shop_records', detailId: 'maintenance_work_orders' },
  { groupId: 'flight_crew_and_operating_documents', detailId: 'pilot_s_operating_handbook_poh' },
  { groupId: 'maintenance_program_and_inspection_records', detailId: 'maintenance_manual' },
  { groupId: 'ad_sb_and_service_information', detailId: 'service_bulletins' },
  { groupId: 'airworthiness_and_certification', detailId: 'faa_form_337_records' },
]

const LEGACY_DOC_TYPE_MAPPING: Record<DocType, { groupId: string; detailId: string }> = {
  logbook: {
    groupId: 'aircraft_logbooks_and_permanent_records',
    detailId: 'historical_logbook_scans',
  },
  poh: {
    groupId: 'flight_crew_and_operating_documents',
    detailId: 'pilot_s_operating_handbook_poh',
  },
  afm: {
    groupId: 'flight_crew_and_operating_documents',
    detailId: 'airplane_flight_manual_afm',
  },
  afm_supplement: {
    groupId: 'flight_crew_and_operating_documents',
    detailId: 'approved_flight_manual_supplements',
  },
  maintenance_manual: {
    groupId: 'maintenance_program_and_inspection_records',
    detailId: 'maintenance_manual',
  },
  service_manual: {
    groupId: 'maintenance_program_and_inspection_records',
    detailId: 'service_manual',
  },
  parts_catalog: {
    groupId: 'maintenance_program_and_inspection_records',
    detailId: 'parts_catalog',
  },
  service_bulletin: {
    groupId: 'ad_sb_and_service_information',
    detailId: 'service_bulletins',
  },
  airworthiness_directive: {
    groupId: 'ad_sb_and_service_information',
    detailId: 'ad_compliance_records',
  },
  work_order: {
    groupId: 'work_orders_and_shop_records',
    detailId: 'maintenance_work_orders',
  },
  inspection_report: {
    groupId: 'maintenance_program_and_inspection_records',
    detailId: 'inspection_program_documents',
  },
  form_337: {
    groupId: 'airworthiness_and_certification',
    detailId: 'faa_form_337_records',
  },
  form_8130: {
    groupId: 'airworthiness_and_certification',
    detailId: 'faa_form_8130_documents',
  },
  lease_ownership: {
    groupId: 'legal_and_ownership',
    detailId: 'certificate_of_aircraft_registration',
  },
  insurance: {
    groupId: 'insurance_finance_and_commercial_records',
    detailId: 'insurance_policies',
  },
  compliance: {
    groupId: 'recurring_compliance_and_required_checks',
    detailId: 'updated_weight_and_balance_records',
  },
  miscellaneous: {
    groupId: 'digital_records_ai_and_internal_intelligence_files',
    detailId: 'master_document_register',
  },
}

export function isDocumentGroupId(value: string | null | undefined): value is string {
  return Boolean(value && DOCUMENT_GROUP_MAP[value])
}

export function isDocumentDetailId(value: string | null | undefined): value is string {
  return Boolean(value && DOCUMENT_DETAIL_ID_SET.has(value))
}

export function getDocumentGroupById(groupId: string | null | undefined): DocumentGroupDefinition | null {
  if (!groupId) return null
  return DOCUMENT_GROUP_MAP[groupId] ?? null
}

export function getDocumentDetailsForGroup(groupId: string | null | undefined): DocumentDetailDefinition[] {
  return getDocumentGroupById(groupId)?.details ?? []
}

export function findDocumentSelection(
  groupId?: string | null,
  detailId?: string | null
): DocumentSelectionDefinition | null {
  const group = getDocumentGroupById(groupId)
  if (!group || !detailId) return null
  const detail = group.details.find((candidate) => candidate.id === detailId)
  if (!detail) return null
  return { group, detail }
}

export function findFirstDocumentSelectionByDetailId(
  detailId?: string | null
): DocumentSelectionDefinition | null {
  if (!detailId) return null
  for (const group of DOCUMENT_GROUPS) {
    const detail = group.details.find((candidate) => candidate.id === detailId)
    if (detail) {
      return { group, detail }
    }
  }
  return null
}

export function inferLegacyClassification(docType: DocType): { groupId: string; detailId: string } {
  return LEGACY_DOC_TYPE_MAPPING[docType] ?? LEGACY_DOC_TYPE_MAPPING.miscellaneous
}

export const DOCUMENT_TAXONOMY_GROUPS = DOCUMENT_GROUPS

export const COMMON_DOCUMENT_DETAILS = getCommonDocumentSelections().map((selection) => selection.detail.id)

export function getDocumentItemsForGroup(groupId: string | null | undefined): DocumentDetailDefinition[] {
  return getDocumentDetailsForGroup(groupId)
}

export function getDocumentItem(detailId: string | null | undefined): (DocumentDetailDefinition & {
  groupId: string
  groupLabel: string
}) | null {
  const selection = findFirstDocumentSelectionByDetailId(detailId)
  if (!selection) return null
  return {
    ...selection.detail,
    groupId: selection.group.id,
    groupLabel: selection.group.label,
  }
}

export function deriveDocTypeFromClassification(
  detailId: string | null | undefined,
  fallbackDocType: DocType = 'miscellaneous'
): DocType {
  return getDocumentItem(detailId)?.docType ?? fallbackDocType
}

export function resolveStoredDocumentClassification(document: Pick<Document, 'doc_type'> & {
  document_group_id?: string | null
  document_detail_id?: string | null
}) {
  const selection = findDocumentSelection(document.document_group_id, document.document_detail_id)
    ?? findFirstDocumentSelectionByDetailId(document.document_detail_id)

  if (selection) {
    return {
      groupId: selection.group.id,
      groupLabel: selection.group.label,
      detailId: selection.detail.id,
      detailLabel: selection.detail.label,
      docType: selection.detail.docType,
    }
  }

  const fallback = inferLegacyClassification(document.doc_type)
  const fallbackSelection = findDocumentSelection(fallback.groupId, fallback.detailId)
  if (!fallbackSelection) {
    throw new Error(`Invalid fallback document classification for doc type ${document.doc_type}`)
  }

  return {
    groupId: fallbackSelection.group.id,
    groupLabel: fallbackSelection.group.label,
    detailId: fallbackSelection.detail.id,
    detailLabel: fallbackSelection.detail.label,
    docType: fallbackSelection.detail.docType,
  }
}

export function getCommonDocumentSelections(): DocumentSelectionDefinition[] {
  return COMMON_DOCUMENT_CLASSIFICATIONS.map(({ groupId, detailId }) => {
    const selection = findDocumentSelection(groupId, detailId)
    if (!selection) {
      throw new Error(`Invalid common document classification: ${groupId}/${detailId}`)
    }
    return selection
  })
}

export function inferScannerBatchClassification(
  selection: DocumentSelectionDefinition
): { batchType: BatchType; sourceMode: BatchSourceMode } {
  const label = selection.detail.label.toLowerCase()

  if (selection.detail.docType === 'logbook') {
    if (label.includes('engine')) return { batchType: 'engine_logbook', sourceMode: 'batch' }
    if (label.includes('prop')) return { batchType: 'prop_logbook', sourceMode: 'batch' }
    if (label.includes('avionics')) return { batchType: 'avionics_logbook', sourceMode: 'batch' }
    return { batchType: 'airframe_logbook', sourceMode: 'batch' }
  }

  if (selection.detail.docType === 'work_order') {
    return { batchType: 'work_order_batch', sourceMode: 'batch' }
  }

  if (label.includes('discrepancy') || label.includes('squawk')) {
    return { batchType: 'discrepancy_batch', sourceMode: 'batch' }
  }

  if (
    selection.detail.docType === 'form_337' ||
    selection.detail.docType === 'form_8130' ||
    selection.detail.docType === 'inspection_report' ||
    selection.detail.docType === 'compliance'
  ) {
    return { batchType: 'evidence_batch', sourceMode: 'evidence' }
  }

  return { batchType: 'general_records', sourceMode: 'batch' }
}
