import { WorkOrdersEmptyState } from './work-orders-shell'

export const metadata = { title: 'Work Orders' }

// Right pane when no work order is selected. The layout (work-orders/layout.tsx)
// owns the list panel + page chrome.
export default function WorkOrdersIndexPage() {
  return <WorkOrdersEmptyState />
}
