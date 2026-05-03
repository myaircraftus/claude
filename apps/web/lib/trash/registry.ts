/**
 * Trash registry (cross-cutting concern 4).
 *
 * Single source of truth for which tables participate in soft-delete.
 * Used by /api/trash (list + restore + permanent-delete) and the
 * /api/cron/trash-purge cron.
 *
 * `display_field` is the column the trash UI shows as the row's name
 * (e.g. work_orders → work_order_number). The list API selects (id,
 * display_field, deleted_at) so the page renders without N+1 fetches.
 */

export interface TrashEntityConfig {
  table: string
  display_field: string
  /** Friendly label for the trash UI ("Work Orders"). */
  label: string
}

export const TRASH_ENTITIES: Record<string, TrashEntityConfig> = {
  work_orders:       { table: 'work_orders',       display_field: 'work_order_number', label: 'Work orders' },
  inspections:       { table: 'inspections',       display_field: 'procedure_name_snapshot', label: 'Inspections' },
  compliance_items:  { table: 'compliance_items',  display_field: 'title',  label: 'Compliance items' },
  continued_items:   { table: 'continued_items',   display_field: 'description', label: 'Continued items' },
  cost_entries:      { table: 'cost_entries',      display_field: 'description', label: 'Cost entries' },
  documents:         { table: 'documents',         display_field: 'title',  label: 'Documents' },
  customers:         { table: 'customers',         display_field: 'name',   label: 'Customers' },
  vendors:           { table: 'vendors',           display_field: 'name',   label: 'Vendors' },
  inventory_parts:   { table: 'inventory_parts',   display_field: 'part_number', label: 'Parts' },
  purchase_orders:   { table: 'purchase_orders',   display_field: 'po_number', label: 'Purchase orders' },
  approval_requests: { table: 'approval_requests', display_field: 'subject', label: 'Approval requests' },
  tools:             { table: 'tools',             display_field: 'serial_number', label: 'Tools' },
  serial_components: { table: 'serial_components', display_field: 'serial_number', label: 'Components' },
  core_obligations:  { table: 'core_obligations',  display_field: 'part_number', label: 'Core obligations' },
}

export type TrashEntityType = keyof typeof TRASH_ENTITIES

export const TRASH_RETENTION_DAYS = 30
