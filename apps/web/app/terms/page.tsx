import type { Metadata } from 'next'
import { PublicLayout } from '@/components/marketing/vite/PublicLayout'
import { TermsPage } from '@/components/marketing/vite/TermsPage'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'Terms of service governing use of myaircraft.us and the records-intelligence platform.',
  alternates: { canonical: 'https://www.myaircraft.us/terms' },
  openGraph: {
    title: 'Terms of Service · myaircraft.us',
    description: 'Terms of service for the myaircraft.us platform.',
    url: 'https://www.myaircraft.us/terms',
    siteName: 'myaircraft.us',
    type: 'website',
    images: ['/redesign/MY_AIRCRAFT_LOGO.svg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Terms of Service · myaircraft.us',
    description: 'Terms of service for the myaircraft.us platform.',
    images: ['/redesign/MY_AIRCRAFT_LOGO.svg'],
  },
}

export default function Page() {
  return (
    <PublicLayout>
      <TermsPage />
    </PublicLayout>
  )
}
