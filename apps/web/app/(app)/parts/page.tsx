import { redirect } from 'next/navigation'

// Parts is now a tab inside the Maintenance Hub
export default function PartsPage() {
  redirect('/maintenance?tab=parts')
}
