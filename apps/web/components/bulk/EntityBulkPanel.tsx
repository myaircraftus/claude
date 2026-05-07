'use client'

/**
 * EntityBulkPanel (Spec polish.bulk-ui-rollout) — convenience wrapper
 * around BulkSelectionPanel that knows the right (apiPath, apiKey,
 * labelKey, presets) per entity. List pages just mount:
 *
 *     <EntityBulkPanel entityType="inspections" />
 *
 * The single source of truth for which fields are bulk-patchable per
 * entity is lib/bulk/processor.ts FIELD_WHITELIST (extended in the
 * cross-cutting batch). Presets here are the *common* operator actions
 * — additional one-off patches can still go through the API directly.
 */

import { BulkSelectionPanel } from './BulkSelectionPanel'

interface EntityCfg {
  apiPath: string
  apiKey: string
  labelKey: string
  subLabelKey?: string
  presets: Array<{ label: string; patch: Record<string, unknown>; confirm?: string }>
}

const CFG: Record<string, EntityCfg> = {
  inspections: {
    apiPath: '/api/inspections',
    apiKey: 'inspections',
    labelKey: 'procedure_name_snapshot',
    subLabelKey: 'status',
    presets: [
      { label: 'Mark complete',    patch: { status: 'complete' } },
      { label: 'Mark in-progress', patch: { status: 'in-progress' } },
      { label: 'Mark draft',       patch: { status: 'draft' } },
    ],
  },
  compliance_items: {
    apiPath: '/api/compliance-items',
    apiKey: 'items',
    labelKey: 'title',
    subLabelKey: 'status',
    presets: [
      { label: 'Mark current',  patch: { status: 'current' } },
      { label: 'Mark deferred', patch: { status: 'deferred' } },
    ],
  },
  continued_items: {
    apiPath: '/api/continued-items',
    apiKey: 'items',
    labelKey: 'description',
    subLabelKey: 'status',
    presets: [
      { label: 'Mark in-progress', patch: { status: 'in-progress' } },
      { label: 'Mark completed',   patch: { status: 'completed' } },
      { label: "Won't fix",        patch: { status: 'wont-fix' } },
    ],
  },
  approval_requests: {
    apiPath: '/api/approval-requests',
    apiKey: 'requests',
    labelKey: 'subject',
    subLabelKey: 'status',
    presets: [
      { label: 'Mark expired',   patch: { status: 'expired' } },
      { label: 'Mark completed', patch: { status: 'completed' } },
    ],
  },
  purchase_orders: {
    apiPath: '/api/purchase-orders',
    apiKey: 'purchase_orders',
    labelKey: 'po_number',
    subLabelKey: 'status',
    presets: [
      { label: 'Mark cancelled', patch: { status: 'cancelled' } },
      { label: 'Mark fulfilled', patch: { status: 'fulfilled' } },
    ],
  },
  inventory_parts: {
    apiPath: '/api/inventory-parts',
    apiKey: 'parts',
    labelKey: 'part_number',
    subLabelKey: 'description',
    presets: [
      { label: 'Archive',   patch: { is_archived: true },  confirm: 'Archive {n} parts? Archived parts are hidden from the active inventory.' },
      { label: 'Unarchive', patch: { is_archived: false } },
    ],
  },
  vendors: {
    apiPath: '/api/vendors',
    apiKey: 'vendors',
    labelKey: 'name',
    subLabelKey: 'vendor_type',
    presets: [
      { label: 'Mark approved',     patch: { approved: true } },
      { label: 'Mark not-approved', patch: { approved: false } },
      { label: 'Archive',           patch: { is_archived: true }, confirm: 'Archive {n} vendors?' },
    ],
  },
  documents: {
    apiPath: '/api/documents',
    apiKey: 'documents',
    labelKey: 'title',
    subLabelKey: 'doc_type',
    presets: [
      { label: 'Visibility: team',    patch: { visibility: 'team' } },
      { label: 'Visibility: private', patch: { visibility: 'private' } },
    ],
  },
  customers: {
    apiPath: '/api/customers',
    apiKey: 'customers',
    labelKey: 'name',
    subLabelKey: 'email',
    presets: [
      { label: 'Enable portal',  patch: { portal_access: true } },
      { label: 'Disable portal', patch: { portal_access: false } },
    ],
  },
  tools: {
    apiPath: '/api/tools',
    apiKey: 'tools',
    labelKey: 'name',
    subLabelKey: 'status',
    presets: [
      { label: 'Available',       patch: { status: 'available' } },
      { label: 'Out of service',  patch: { status: 'out-of-service' } },
    ],
  },
  serial_components: {
    apiPath: '/api/serial-components',
    apiKey: 'components',
    labelKey: 'serial_number',
    subLabelKey: 'status',
    presets: [
      { label: 'In-overhaul', patch: { status: 'in-overhaul' } },
      { label: 'In-stock',    patch: { status: 'in-stock' } },
      { label: 'Scrap',       patch: { status: 'scrapped' }, confirm: 'Scrap {n} components? This is a recoverable status change but typically permanent.' },
    ],
  },
  core_obligations: {
    apiPath: '/api/core-obligations',
    apiKey: 'obligations',
    labelKey: 'part_number',
    subLabelKey: 'status',
    presets: [
      { label: 'Mark received', patch: { status: 'received' } },
      { label: 'Mark waived',   patch: { status: 'waived' } },
    ],
  },
  cost_entries: {
    apiPath: '/api/costs',
    apiKey: 'entries',
    labelKey: 'description',
    subLabelKey: 'category',
    presets: [
      { label: 'Approve',   patch: { approved: true } },
      { label: 'Unapprove', patch: { approved: false } },
    ],
  },
}

interface Props {
  entityType: keyof typeof CFG
  className?: string
}

export function EntityBulkPanel({ entityType, className }: Props) {
  const cfg = CFG[entityType]
  if (!cfg) return null
  return (
    <BulkSelectionPanel
      apiPath={cfg.apiPath}
      apiKey={cfg.apiKey}
      labelKey={cfg.labelKey}
      subLabelKey={cfg.subLabelKey}
      entityType={entityType as string}
      presets={cfg.presets}
      className={className}
    />
  )
}
