import { redirect } from 'next/navigation'

export const metadata = { title: 'Purchase Orders' }

export default function PurchaseOrdersListPage() {
  redirect('/parts-inventory/purchase-orders')
}
