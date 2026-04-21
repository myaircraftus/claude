import type { Metadata } from 'next'
import { PublicLayout } from '@/components/marketing/vite/PublicLayout'
import { PrivacyPage } from '@/components/marketing/vite/PrivacyPage'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How myaircraft.us handles your data. Records are encrypted, never sold, and never used to train public AI models.',
  alternates: { canonical: 'https://www.myaircraft.us/privacy' },
  openGraph: {
    title: 'Privacy Policy · myaircraft.us',
    description: 'How we handle your aircraft records and personal data.',
    url: 'https://www.myaircraft.us/privacy',
    siteName: 'myaircraft.us',
    type: 'website',
    images: ['/redesign/MY_AIRCRAFT_LOGO.svg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Privacy Policy · myaircraft.us',
    description: 'How we handle your aircraft records and personal data.',
    images: ['/redesign/MY_AIRCRAFT_LOGO.svg'],
  },
}

export default function Page() {
  return (
    <PublicLayout>
      <PrivacyPage />
    </PublicLayout>
  )
}
