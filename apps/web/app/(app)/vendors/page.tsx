import { redirect } from 'next/navigation'

export const metadata = { title: 'Vendors' }

export default function VendorsPage() {
  redirect('/parts-inventory/vendors')
}
