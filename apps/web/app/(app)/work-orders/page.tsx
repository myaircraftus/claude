import { redirect } from 'next/navigation'

// Work Orders is now a tab inside the Maintenance Hub
export default function WorkOrdersPage() {
  redirect('/maintenance?tab=work-orders')
}
