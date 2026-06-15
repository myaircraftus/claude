// OWNER PERMISSIONS: Read-only. Can view ongoing + past work orders and stage progress.
// Can use the chat button on an open work order.
// Cannot: create, edit, or close work orders.
import { WorkOrdersEmptyState } from './work-orders-shell'
import { WorkOrdersEmptyStateV2 } from '@/components/work-orders/redesign/work-orders-shell-v2'
import { resolveWoUi } from '@/lib/work-orders/ui-mode'

export const metadata = { title: 'Work Orders' }

// Right pane when no work order is selected. The layout (work-orders/layout.tsx)
// owns the list panel + page chrome. Empty state matches the active UI mode —
// redesign by default, the old one under ?ui=legacy.
export default function WorkOrdersIndexPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const useRedesign = resolveWoUi(searchParams?.ui) === 'v2'
  return useRedesign ? <WorkOrdersEmptyStateV2 /> : <WorkOrdersEmptyState />
}
