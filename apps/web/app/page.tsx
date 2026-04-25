import { PublicLayout } from '@/components/marketing/vite/PublicLayout'
import { HomePage } from '@/components/marketing/vite/HomePage'
import { getBrandKit } from '@/lib/marketing/brand'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const brandKit = await getBrandKit()
  return (
    <PublicLayout>
      <HomePage brandKit={brandKit} />
    </PublicLayout>
  )
}
