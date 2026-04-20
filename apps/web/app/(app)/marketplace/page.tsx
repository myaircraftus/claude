import { MarketplacePage } from '@/components/redesign/MarketplacePage'
import { requireAppServerSession } from '@/lib/auth/server-app'

export const metadata = { title: 'Marketplace' }

export default async function MarketplaceRoute() {
  await requireAppServerSession()

  return <MarketplacePage />
}
