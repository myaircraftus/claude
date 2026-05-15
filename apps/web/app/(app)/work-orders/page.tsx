// OWNER PERMISSIONS: Read-only. Can view ongoing + past work orders and stage progress.
// Can use the chat button on an open work order.
// Cannot: create, edit, or close work orders.
import { WorkOrdersEmptyState } from './work-orders-shell'

export const metadata = { title: 'Work Orders' }

// Right pane when no work order is selected. The layout (work-orders/layout.tsx)
// owns the list panel + page chrome.
export default function WorkOrdersIndexPage() {
  return <WorkOrdersEmptyState />
}
