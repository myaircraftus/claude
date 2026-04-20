export const AIRCRAFT_OPERATION_TYPES = [
  'private_owner',
  'flight_school',
  'flying_club',
  'leaseback_rental',
  'part_135_charter',
  'corporate_flight_department',
  'government_public_use',
  'special_mission',
] as const

export type AircraftOperationType = (typeof AIRCRAFT_OPERATION_TYPES)[number]

export interface OperationTypeOption {
  value: AircraftOperationType
  label: string
  description: string
  reminderFocus: string[]
  rolePresets: string[]
  documentGroups: string[]
}

export const OPERATION_TYPE_OPTIONS: OperationTypeOption[] = [
  {
    value: 'private_owner',
    label: 'Private Owner / Part 91',
    description: 'Owner-flown or privately managed aircraft with standard Part 91 expectations.',
    reminderFocus: ['Annual inspection', 'ELT', 'transponder', 'documents'],
    rolePresets: ['Owner', 'Mechanic', 'Viewer'],
    documentGroups: [
      'legal_and_ownership',
      'airworthiness_and_certification',
      'aircraft_logbooks_and_permanent_records',
      'maintenance_program_and_inspection_records',
      'ad_sb_and_service_information',
      'flight_crew_and_operating_documents',
      'engines_propellers_apu_and_major_components',
      'avionics_and_electrical',
      'repairs_alterations_and_damage_history',
      'recurring_compliance_and_required_checks',
      'master_summaries_and_status_sheets',
    ],
  },
  {
    value: 'flight_school',
    label: 'Flight School / Part 141 or rental training',
    description: 'Frequent instructional use with 100-hour, squawk, and dispatch-heavy workflow.',
    reminderFocus: ['100-hour', 'discrepancies', 'dispatch reliability', 'student use'],
    rolePresets: ['Owner', 'Operations Director', 'Lead Mechanic', 'Mechanic'],
    documentGroups: [
      'legal_and_ownership',
      'airworthiness_and_certification',
      'aircraft_logbooks_and_permanent_records',
      'maintenance_program_and_inspection_records',
      'ad_sb_and_service_information',
      'flight_crew_and_operating_documents',
      'engines_propellers_apu_and_major_components',
      'avionics_and_electrical',
      'work_orders_and_shop_records',
      'recurring_compliance_and_required_checks',
      'flight_and_usage_records',
      'master_summaries_and_status_sheets',
    ],
  },
  {
    value: 'flying_club',
    label: 'Flying Club',
    description: 'Shared member access with frequent scheduling, squawks, and current/historical records.',
    reminderFocus: ['100-hour review', 'club inspections', 'member squawks'],
    rolePresets: ['Owner', 'Operator', 'Lead Mechanic', 'Viewer'],
    documentGroups: [
      'legal_and_ownership',
      'airworthiness_and_certification',
      'aircraft_logbooks_and_permanent_records',
      'maintenance_program_and_inspection_records',
      'ad_sb_and_service_information',
      'flight_crew_and_operating_documents',
      'work_orders_and_shop_records',
      'recurring_compliance_and_required_checks',
      'flight_and_usage_records',
      'master_summaries_and_status_sheets',
    ],
  },
  {
    value: 'leaseback_rental',
    label: 'Leaseback / Rental',
    description: 'Commercial-use or rental context with higher compliance and recurring inspection needs.',
    reminderFocus: ['100-hour', 'damage tracking', 'commercial readiness'],
    rolePresets: ['Owner', 'Operator', 'Lead Mechanic', 'Mechanic'],
    documentGroups: [
      'legal_and_ownership',
      'airworthiness_and_certification',
      'aircraft_logbooks_and_permanent_records',
      'maintenance_program_and_inspection_records',
      'ad_sb_and_service_information',
      'flight_crew_and_operating_documents',
      'engines_propellers_apu_and_major_components',
      'work_orders_and_shop_records',
      'recurring_compliance_and_required_checks',
      'flight_and_usage_records',
      'insurance_finance_and_commercial_records',
      'master_summaries_and_status_sheets',
    ],
  },
  {
    value: 'part_135_charter',
    label: 'Part 135 Charter',
    description: 'Operationally intensive aircraft with tighter recurring compliance and customer visibility.',
    reminderFocus: ['100-hour', 'Ops specs support', 'crew / equipment compliance'],
    rolePresets: ['Owner', 'Operations Director', 'Lead Mechanic', 'Mechanic'],
    documentGroups: [
      'legal_and_ownership',
      'airworthiness_and_certification',
      'aircraft_logbooks_and_permanent_records',
      'maintenance_program_and_inspection_records',
      'ad_sb_and_service_information',
      'flight_crew_and_operating_documents',
      'engines_propellers_apu_and_major_components',
      'avionics_and_electrical',
      'work_orders_and_shop_records',
      'recurring_compliance_and_required_checks',
      'flight_and_usage_records',
      'insurance_finance_and_commercial_records',
      'faa_government_authority_correspondence',
      'master_summaries_and_status_sheets',
    ],
  },
  {
    value: 'corporate_flight_department',
    label: 'Corporate Flight Department',
    description: 'Managed corporate operation with owner/operator separation and polished packet expectations.',
    reminderFocus: ['executive readiness', 'documents', 'recurring checks'],
    rolePresets: ['Owner', 'Operator', 'Lead Mechanic', 'Viewer'],
    documentGroups: [
      'legal_and_ownership',
      'airworthiness_and_certification',
      'aircraft_logbooks_and_permanent_records',
      'maintenance_program_and_inspection_records',
      'ad_sb_and_service_information',
      'flight_crew_and_operating_documents',
      'engines_propellers_apu_and_major_components',
      'avionics_and_electrical',
      'recurring_compliance_and_required_checks',
      'flight_and_usage_records',
      'insurance_finance_and_commercial_records',
      'manufacturer_oem_and_delivery_documents',
      'master_summaries_and_status_sheets',
    ],
  },
  {
    value: 'government_public_use',
    label: 'Government / Public Use',
    description: 'Public-use or agency aircraft with authority and audit-heavy record expectations.',
    reminderFocus: ['authority records', 'equipment checks', 'audit readiness'],
    rolePresets: ['Owner', 'Operator', 'Lead Mechanic', 'Viewer'],
    documentGroups: [
      'legal_and_ownership',
      'airworthiness_and_certification',
      'aircraft_logbooks_and_permanent_records',
      'maintenance_program_and_inspection_records',
      'ad_sb_and_service_information',
      'flight_crew_and_operating_documents',
      'engines_propellers_apu_and_major_components',
      'avionics_and_electrical',
      'recurring_compliance_and_required_checks',
      'flight_and_usage_records',
      'faa_government_authority_correspondence',
      'operational_and_emergency_equipment_records',
      'master_summaries_and_status_sheets',
    ],
  },
  {
    value: 'special_mission',
    label: 'Special Mission / Survey / Utility',
    description: 'Mission-driven aircraft with component, utilization, and mission-equipment emphasis.',
    reminderFocus: ['mission equipment', 'component tracking', 'special inspections'],
    rolePresets: ['Owner', 'Operator', 'Lead Mechanic', 'Mechanic'],
    documentGroups: [
      'legal_and_ownership',
      'airworthiness_and_certification',
      'aircraft_logbooks_and_permanent_records',
      'maintenance_program_and_inspection_records',
      'ad_sb_and_service_information',
      'engines_propellers_apu_and_major_components',
      'avionics_and_electrical',
      'work_orders_and_shop_records',
      'recurring_compliance_and_required_checks',
      'flight_and_usage_records',
      'specialized_aircraft_type_and_mission_specific_records',
      'master_summaries_and_status_sheets',
    ],
  },
]

const OPERATION_BY_VALUE = new Map(OPERATION_TYPE_OPTIONS.map(option => [option.value, option]))

const FOR_HIRE_TYPES = new Set<AircraftOperationType>([
  'flight_school',
  'flying_club',
  'leaseback_rental',
  'part_135_charter',
])

export function normalizeOperationTypes(values?: string[] | null): AircraftOperationType[] {
  return (values ?? []).filter((value): value is AircraftOperationType =>
    AIRCRAFT_OPERATION_TYPES.includes(value as AircraftOperationType)
  )
}

export function isForHireOperation(values?: string[] | null) {
  return normalizeOperationTypes(values).some(value => FOR_HIRE_TYPES.has(value))
}

export function getOperationTypeOption(value: string | null | undefined) {
  if (!value) return null
  return OPERATION_BY_VALUE.get(value as AircraftOperationType) ?? null
}

export function getOperationTypeLabels(values?: string[] | null) {
  return normalizeOperationTypes(values)
    .map(value => OPERATION_BY_VALUE.get(value)?.label ?? value)
}

export function buildOperationProfile(values?: string[] | null) {
  const types = normalizeOperationTypes(values)
  const options = types.map(type => OPERATION_BY_VALUE.get(type)).filter(Boolean) as OperationTypeOption[]

  const rolePresets = Array.from(
    new Set(options.flatMap(option => option.rolePresets))
  )
  const reminderFocus = Array.from(
    new Set(options.flatMap(option => option.reminderFocus))
  )
  const documentGroups = Array.from(
    new Set(options.flatMap(option => option.documentGroups))
  )

  return {
    types,
    labels: options.map(option => option.label),
    rolePresets,
    reminderFocus,
    documentGroups,
    appliesForHireRules: types.some(type => FOR_HIRE_TYPES.has(type)),
  }
}

export function getRelevantDocumentGroups(values?: string[] | null) {
  return buildOperationProfile(values).documentGroups
}
