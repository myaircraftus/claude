export type PartsInventoryViewKey =
  | 'dashboard'
  | 'ai-search'
  | 'inventory'
  | 'vendors'
  | 'purchase-orders'
  | 'rx-receipts'
  | 'returns'
  | 'analytics'

export const PARTS_INVENTORY_VIEWS: Array<{
  key: PartsInventoryViewKey
  label: string
  href: string
}> = [
  { key: 'dashboard', label: 'Overview', href: '/parts-inventory' },
  { key: 'ai-search', label: 'AI Parts Search', href: '/parts-inventory/ai-parts-search' },
  { key: 'inventory', label: 'Inventory', href: '/parts-inventory/inventory' },
  { key: 'vendors', label: 'Vendors', href: '/parts-inventory/vendors' },
  { key: 'purchase-orders', label: 'Purchase Orders', href: '/parts-inventory/purchase-orders' },
  { key: 'rx-receipts', label: 'RX Receipts', href: '/parts-inventory/rx-receipts' },
  { key: 'returns', label: 'Returns', href: '/parts-inventory/returns' },
  { key: 'analytics', label: 'Analytics', href: '/parts-inventory/analytics' },
]

export const PARTS_INVENTORY_VIEW_KEYS = new Set(PARTS_INVENTORY_VIEWS.map((item) => item.key))

export function normalizePartsInventoryView(value: string | null | undefined): PartsInventoryViewKey {
  return PARTS_INVENTORY_VIEW_KEYS.has(value as PartsInventoryViewKey)
    ? (value as PartsInventoryViewKey)
    : 'dashboard'
}

export function partsInventoryHref(view: PartsInventoryViewKey): string {
  return PARTS_INVENTORY_VIEWS.find((item) => item.key === view)?.href ?? '/parts-inventory'
}

export type StockStatus = 'in_stock' | 'at_min' | 'low_stock' | 'out_of_stock' | 'on_order' | 'expiring_due'

export function computeStockStatus(input: {
  qtyInStock: number
  minStock: number
  onOrder?: number
  dueDate?: string | null
  now?: Date
}): StockStatus {
  const qty = Number.isFinite(input.qtyInStock) ? input.qtyInStock : 0
  const min = Number.isFinite(input.minStock) ? input.minStock : 0
  if (input.onOrder && input.onOrder > 0) return 'on_order'
  if (input.dueDate) {
    const now = input.now ?? new Date()
    const due = new Date(input.dueDate)
    const days = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    if (Number.isFinite(days) && days <= 45) return 'expiring_due'
  }
  if (qty === 0) return 'out_of_stock'
  if (qty === min) return 'at_min'
  if (qty > 0 && qty < min) return 'low_stock'
  return 'in_stock'
}

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  in_stock: 'In Stock',
  at_min: 'At Min',
  low_stock: 'Low Stock',
  out_of_stock: 'Out of Stock',
  on_order: 'On Order',
  expiring_due: 'Expiring / Due',
}

export const STOCK_STATUS_CLASS: Record<StockStatus, string> = {
  in_stock: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  at_min: 'bg-amber-50 text-amber-700 border-amber-200',
  low_stock: 'bg-orange-50 text-orange-700 border-orange-200',
  out_of_stock: 'bg-rose-50 text-rose-700 border-rose-200',
  on_order: 'bg-blue-50 text-blue-700 border-blue-200',
  expiring_due: 'bg-violet-50 text-violet-700 border-violet-200',
}

export const PARTS_AUDIT_ACTIONS = [
  'part_saved',
  'part_added_to_inventory',
  'inventory_adjusted',
  'vendor_ai_reviewed',
  'vendor_saved',
  'purchase_order_created',
  'rx_receipt_confirmed',
  'return_created',
  'analytics_exported',
] as const

export type PartsAuditAction = (typeof PARTS_AUDIT_ACTIONS)[number]

export function isPartsAuditAction(value: unknown): value is PartsAuditAction {
  return typeof value === 'string' && (PARTS_AUDIT_ACTIONS as readonly string[]).includes(value)
}
