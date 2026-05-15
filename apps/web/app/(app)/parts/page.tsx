import { redirect } from 'next/navigation'

export const metadata = { title: 'Parts & Inventory' }

export default function PartsPage() {
  redirect('/parts-inventory/inventory')
}
