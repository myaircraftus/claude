import type { Metadata } from 'next'
import { PublicLayout } from '@/components/marketing/vite/PublicLayout'
import { FeaturesPage } from '@/components/marketing/vite/FeaturesPage'

export const metadata: Metadata = {
  title: 'Features — AI records intelligence for aircraft',
  description:
    'Upload logbooks and aircraft records. Get citation-backed answers, AD compliance tracking, and aviation-grade document search.',
  alternates: { canonical: 'https://www.myaircraft.us/features' },
  openGraph: {
    title: 'Features · myaircraft.us',
    description: 'Aviation-grade document intelligence: AD tracking, logbook search, compliance audits, and more.',
    url: 'https://www.myaircraft.us/features',
    siteName: 'myaircraft.us',
    type: 'website',
    images: ['/redesign/MY_AIRCRAFT_LOGO.svg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Features · myaircraft.us',
    description: 'Aviation-grade document intelligence: AD tracking, logbook search, compliance audits, and more.',
    images: ['/redesign/MY_AIRCRAFT_LOGO.svg'],
  },
}

export default function Page() {
  return (
    <PublicLayout>
      <FeaturesPage />
    </PublicLayout>
  )
}
