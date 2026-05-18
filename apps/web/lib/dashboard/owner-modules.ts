/**
 * SOP-DOC-001 §2.2 / Item 4 — owner dashboard modules by operation type.
 *
 * operation_type (on the organizations table) controls which dashboard
 * modules an owner organization sees. It NEVER affects document upload or
 * view permissions — the Document Iron Wall (SOP §4) applies to every owner
 * operation type equally.
 */
import type { OrganizationOperationType } from '@/types'

/** Human-readable labels for the owner operation types. */
export const OWNER_OPERATION_TYPE_LABELS: Record<OrganizationOperationType, string> = {
  private: 'Private Aircraft Owner',
  partnership: 'Aircraft Partnership',
  flight_school: 'Flight School / Rental Fleet',
  flying_club: 'Flying Club',
  corporate: 'Corporate Flight Department',
}

/**
 * The dashboard module keys visible for an operation type — the seven base
 * modules every owner sees, plus the operation-specific modules.
 */
export function getOwnerModules(operationType: OrganizationOperationType): string[] {
  const base = [
    'aircraft-health-score',
    'records-completeness',
    'inspection-due',
    'ad-sb-status',
    'missing-documents',
    'recent-work-orders',
    'ask-myaircraft',
  ]

  if (operationType === 'partnership') {
    return [...base, 'partner-cost-split', 'pending-approvals', 'squawk-transparency']
  }
  if (operationType === 'flight_school') {
    return [...base, 'fleet-dispatch-status', 'hours-to-100hr', 'aircraft-utilization', 'downtime-report']
  }
  if (operationType === 'flying_club') {
    return [...base, 'member-squawks', 'fleet-availability', 'cost-per-aircraft']
  }
  if (operationType === 'corporate') {
    return [...base, 'dispatch-readiness', 'maintenance-forecast', 'executive-summary']
  }
  // private (default)
  return [...base, 'cost-of-ownership', 'insurance-packet', 'prebuy-resale-readiness']
}

export interface OwnerModuleMeta {
  label: string
  description: string
  /** Route this module links to. Absent → the module is a "coming soon" card. */
  href?: string
}

/**
 * Display metadata per module key. Modules without an `href` render as
 * "coming soon" placeholder cards — the routing/feature work is tracked
 * separately, but the module is still surfaced so the operation-type wiring
 * is visible and verifiable.
 */
export const OWNER_MODULE_META: Record<string, OwnerModuleMeta> = {
  'aircraft-health-score': {
    label: 'Aircraft Health Score',
    description: 'At-a-glance airworthiness and records health per tail.',
  },
  'records-completeness': {
    label: 'Records Completeness',
    description: 'How complete your aircraft document set is.',
  },
  'inspection-due': {
    label: 'Inspections Due',
    description: 'Upcoming annual and 100-hour inspections.',
    href: '/compliance',
  },
  'ad-sb-status': {
    label: 'AD / SB Status',
    description: 'Outstanding Airworthiness Directives and Service Bulletins.',
    href: '/compliance',
  },
  'missing-documents': {
    label: 'Missing Documents',
    description: 'Required aircraft records not yet in your vault.',
    href: '/documents',
  },
  'recent-work-orders': {
    label: 'Recent Work Orders',
    description: 'Latest maintenance work on your fleet.',
    href: '/work-orders',
  },
  'ask-myaircraft': {
    label: 'Ask myaircraft',
    description: 'Ask questions about your aircraft records.',
    href: '/ask',
  },
  'partner-cost-split': {
    label: 'Partner Cost Split',
    description: 'Shared maintenance costs across co-owners.',
  },
  'pending-approvals': {
    label: 'Pending Approvals',
    description: 'Estimates and work awaiting a partner decision.',
    href: '/approvals',
  },
  'squawk-transparency': {
    label: 'Squawk Transparency',
    description: 'Open squawks visible to every partner.',
    href: '/squawks',
  },
  'fleet-dispatch-status': {
    label: 'Fleet Dispatch Status',
    description: 'Which trainers are available to fly right now.',
  },
  'hours-to-100hr': {
    label: 'Hours to 100-Hour',
    description: 'Time remaining before each aircraft is due.',
  },
  'aircraft-utilization': {
    label: 'Aircraft Utilization',
    description: 'Flight hours and usage trends across the fleet.',
  },
  'downtime-report': {
    label: 'Downtime Report',
    description: 'Aircraft out of service and expected return.',
  },
  'member-squawks': {
    label: 'Member Squawks',
    description: 'Squawks reported by club members.',
    href: '/squawks',
  },
  'fleet-availability': {
    label: 'Fleet Availability',
    description: 'Club aircraft availability at a glance.',
  },
  'cost-per-aircraft': {
    label: 'Cost per Aircraft',
    description: 'Operating cost breakdown per club aircraft.',
  },
  'dispatch-readiness': {
    label: 'Dispatch Readiness',
    description: 'Mission-readiness status for the flight department.',
  },
  'maintenance-forecast': {
    label: 'Maintenance Forecast',
    description: 'Projected maintenance events and budget.',
  },
  'executive-summary': {
    label: 'Executive Summary',
    description: 'High-level fleet status report for leadership.',
  },
  'cost-of-ownership': {
    label: 'Cost of Ownership',
    description: 'Total cost of owning and operating your aircraft.',
  },
  'insurance-packet': {
    label: 'Insurance Packet',
    description: 'Records bundle ready for insurance renewal.',
  },
  'prebuy-resale-readiness': {
    label: 'Prebuy / Resale Readiness',
    description: 'How sale-ready your aircraft records are.',
  },
}
