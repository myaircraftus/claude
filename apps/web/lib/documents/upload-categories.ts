/**
 * SOP-DOC-001 §6 — per-persona upload category groups with Tier 1 / Tier 2
 * progressive disclosure.
 *
 * Each group is a UI affordance that maps to one or more real `DocumentType`
 * values from persona-taxonomy.ts (the source of truth). Tier 1 groups are
 * shown immediately in the upload modal; Tier 2 groups are revealed via a
 * "Show more" toggle.
 *
 * The persona × type Iron Wall is still enforced by `canPersonaUpload` and by
 * /api/upload/complete — these groups only control DISPLAY. Where SOP §6
 * names a category the current `document_type` enum has no dedicated value
 * for (e.g. damage history, ownership records), the group maps to `other`;
 * expanding the enum is tracked as a follow-up.
 */
import type { DocumentType } from './persona-taxonomy'
import { canPersonaUpload } from './persona-taxonomy'
import type { Persona } from '@/types'

export interface UploadCategoryGroup {
  /** Stable key. */
  key: string
  /** Bold category label shown in the modal. */
  label: string
  /** One-line muted description. */
  description: string
  /** 1 = always visible; 2 = revealed via "Show more". */
  tier: 1 | 2
  /** Example accepted file types, shown muted under the description. */
  exampleFileTypes: string
  /** Real DocumentType values this category offers (the source of truth). */
  documentTypes: DocumentType[]
}

// ─── Owner: the "Aircraft Records Vault" (SOP §6.1) ─────────────────────────
const OWNER_GROUPS: UploadCategoryGroup[] = [
  {
    key: 'required_aircraft_documents',
    label: 'Required Aircraft Documents',
    description:
      'Airworthiness certificate, registration, POH/AFM, weight & balance, insurance.',
    tier: 1,
    exampleFileTypes: 'PDF, JPG, PNG',
    documentTypes: [
      'aircraft_airworthiness',
      'aircraft_registration',
      'aircraft_poh',
      'aircraft_afm',
      'aircraft_weight_balance',
      'aircraft_insurance',
    ],
  },
  {
    key: 'logbooks',
    label: 'Logbooks',
    description:
      'Airframe, engine, propeller, avionics & component logbooks; historical and lost-logbook statements.',
    tier: 1,
    exampleFileTypes: 'PDF, JPG, PNG',
    documentTypes: ['aircraft_logbook'],
  },
  {
    key: 'inspections',
    label: 'Annual & Inspection Records',
    description:
      'Annual and 100-hour inspection sign-offs and reports, pre-buy inspection reports.',
    tier: 1,
    exampleFileTypes: 'PDF',
    documentTypes: ['aircraft_annual', 'aircraft_100hr', 'aircraft_prebuy'],
  },
  {
    key: 'ad_sb_compliance',
    label: 'AD / SB Compliance Records',
    description:
      'AD and Service Bulletin compliance reports and one-time AD evidence for your aircraft.',
    tier: 1,
    exampleFileTypes: 'PDF',
    documentTypes: ['other'],
  },
  {
    key: 'stc_337',
    label: 'STC & Form 337 Records',
    description:
      'Supplemental Type Certificates, FAA Form 337s, field approvals, DER approvals, ICA documents.',
    tier: 1,
    exampleFileTypes: 'PDF',
    documentTypes: ['stc', 'form_337'],
  },
  {
    key: 'work_orders_invoices',
    label: 'Work Orders & Invoices',
    description:
      'Completed work orders and invoices received from a shop — scans of paper records you keep.',
    tier: 1,
    exampleFileTypes: 'PDF, JPG, PNG',
    documentTypes: ['other'],
  },
  {
    key: 'engine_prop_records',
    label: 'Engine & Propeller Records',
    description:
      'Oil analysis reports, borescope reports, compression records, overhaul records.',
    tier: 2,
    exampleFileTypes: 'PDF, JPG, PNG',
    documentTypes: ['other'],
  },
  {
    key: 'manuals',
    label: 'Manuals',
    description:
      "Your copy of the POH/AFM, AFM supplements, owner's manual, checklists, performance charts.",
    tier: 2,
    exampleFileTypes: 'PDF',
    documentTypes: ['aircraft_poh', 'aircraft_afm'],
  },
  {
    key: 'parts_traceability',
    label: 'Parts & Traceability',
    description:
      'FAA 8130-3 forms, certificates of conformity, yellow/green tags, parts receipts.',
    tier: 2,
    exampleFileTypes: 'PDF, JPG, PNG',
    documentTypes: ['receipt', 'other'],
  },
  {
    key: 'damage_repair',
    label: 'Damage & Repair History',
    description:
      'Damage reports, prop strike records, hard landing inspections, corrosion records.',
    tier: 2,
    exampleFileTypes: 'PDF, JPG, PNG',
    documentTypes: ['other'],
  },
  {
    key: 'ownership_financial',
    label: 'Ownership & Financial Records',
    description:
      'Bill of sale, purchase agreement, title search, lien release, loan & tax documents.',
    tier: 2,
    exampleFileTypes: 'PDF',
    documentTypes: ['other'],
  },
  {
    key: 'photos',
    label: 'Photos & Digital Evidence',
    description:
      'Full aircraft photos, panel, engine compartment, data plate & serial-number photos.',
    tier: 2,
    exampleFileTypes: 'JPG, PNG, HEIC',
    documentTypes: ['photo'],
  },
  {
    key: 'special',
    label: 'Special Category',
    description:
      'Experimental operating limitations, builder log, Phase I/II test records, LSA safety directives.',
    tier: 2,
    exampleFileTypes: 'PDF',
    documentTypes: ['other'],
  },
]

// ─── Shop: the "MRO Library" (SOP §6.2) ─────────────────────────────────────
const SHOP_GROUPS: UploadCategoryGroup[] = [
  {
    key: 'aircraft_maintenance_manuals',
    label: 'Aircraft Maintenance Manuals',
    description:
      'AMM, line maintenance manuals, chaptered maintenance manuals, inspection programs (ICA).',
    tier: 1,
    exampleFileTypes: 'PDF',
    documentTypes: ['maintenance_manual'],
  },
  {
    key: 'parts_catalogs',
    label: 'Parts Catalogs / IPC',
    description:
      'Illustrated parts catalogs, parts manuals, standard hardware catalogs, superseded-parts lists.',
    tier: 1,
    exampleFileTypes: 'PDF',
    documentTypes: ['parts_catalog'],
  },
  {
    key: 'ad_sb_documents',
    label: 'AD / SB Documents',
    description:
      'Airworthiness Directives, Service Bulletins, mandatory & alert SBs, service letters.',
    tier: 1,
    exampleFileTypes: 'PDF',
    documentTypes: ['airworthiness_directive', 'service_bulletin', 'service_letter'],
  },
  {
    key: 'stc_approved_data',
    label: 'STC & Approved Data',
    description:
      'STC packages, DER approvals, field approvals, ICA supplements held as shop reference.',
    tier: 1,
    exampleFileTypes: 'PDF',
    documentTypes: ['other'],
  },
  {
    key: 'logbooks_records',
    label: 'Logbooks & Records (shop copies)',
    description:
      'Shop reference copies of completed logbook entries, inspection sign-offs, return-to-service statements.',
    tier: 1,
    exampleFileTypes: 'PDF',
    documentTypes: ['other'],
  },
  {
    key: 'engine_manuals',
    label: 'Engine Manuals',
    description:
      "Engine maintenance, overhaul & operator's manuals, engine parts catalogs and service bulletins.",
    tier: 2,
    exampleFileTypes: 'PDF',
    documentTypes: ['maintenance_manual'],
  },
  {
    key: 'propeller_manuals',
    label: 'Propeller Manuals',
    description:
      'Propeller maintenance, overhaul & governor manuals, parts catalogs, service bulletins.',
    tier: 2,
    exampleFileTypes: 'PDF',
    documentTypes: ['maintenance_manual'],
  },
  {
    key: 'avionics_manuals',
    label: 'Avionics & Electrical Manuals',
    description:
      'Avionics installation/maintenance manuals, wiring diagrams, autopilot & ADS-B manuals.',
    tier: 2,
    exampleFileTypes: 'PDF',
    documentTypes: ['wiring_diagram', 'maintenance_manual'],
  },
  {
    key: 'component_manuals',
    label: 'Component Manuals (CMMs)',
    description:
      'CMMs for brakes, landing gear, hydraulics, fuel, environmental and oxygen systems.',
    tier: 2,
    exampleFileTypes: 'PDF',
    documentTypes: ['maintenance_manual'],
  },
  {
    key: 'structural_repair',
    label: 'Structural & Repair Manuals',
    description:
      'SRM, sheet metal & composite repair manuals, NDI manual, corrosion repair manual.',
    tier: 2,
    exampleFileTypes: 'PDF',
    documentTypes: ['maintenance_manual'],
  },
  {
    key: 'regulatory_references',
    label: 'Regulatory References',
    description:
      '14 CFR parts, FAA advisory circulars, type certificate data sheets, FAA orders.',
    tier: 2,
    exampleFileTypes: 'PDF',
    documentTypes: ['tcds', 'training_manual'],
  },
  {
    key: 'repair_station_quality',
    label: 'Repair Station / Quality Records',
    description:
      'RSM, QCM, capabilities list, training program manual, tool calibration & vendor approval records.',
    tier: 2,
    exampleFileTypes: 'PDF',
    documentTypes: ['training_manual', 'other'],
  },
  {
    key: 'safety_environmental',
    label: 'Safety & Environmental',
    description:
      'OSHA manual, SDS sheets, hazard communication, spill response, waste disposal records.',
    tier: 2,
    exampleFileTypes: 'PDF',
    documentTypes: ['other'],
  },
  {
    key: 'tooling_calibration',
    label: 'Tooling & Calibration',
    description:
      'Calibration certificates, special tool manuals, GSE manuals, test equipment manuals.',
    tier: 2,
    exampleFileTypes: 'PDF',
    documentTypes: ['other'],
  },
]

/**
 * Upload category groups for a persona. Every group's `documentTypes` is
 * filtered to types the persona may actually upload (`canPersonaUpload`);
 * any group left with no uploadable type is dropped. Admin sees the union
 * of owner + shop groups.
 */
export function getUploadCategoryGroups(persona: Persona): UploadCategoryGroup[] {
  const base =
    persona === 'shop'
      ? SHOP_GROUPS
      : persona === 'admin'
        ? [...OWNER_GROUPS, ...SHOP_GROUPS]
        : OWNER_GROUPS
  return base
    .map((g) => ({
      ...g,
      documentTypes: g.documentTypes.filter((t) => canPersonaUpload(persona, t)),
    }))
    .filter((g) => g.documentTypes.length > 0)
}
