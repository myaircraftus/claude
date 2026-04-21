import type { Metadata } from 'next'
import { PublicLayout } from '@/components/marketing/vite/PublicLayout'
import { ScanningPage } from '@/components/marketing/vite/ScanningPage'

export const metadata: Metadata = {
  title: 'Free Hangar Scanning — We digitize your records',
  description:
    'Free on-site scanning of your aircraft logbooks and records for subscribers. Same-day digital access to every page.',
  alternates: { canonical: 'https://www.myaircraft.us/scanning' },
  openGraph: {
    title: 'Free Hangar Scanning · myaircraft.us',
    description: 'We come to your hangar and digitize your logbooks. Free for subscribers. Same-day access.',
    url: 'https://www.myaircraft.us/scanning',
    siteName: 'myaircraft.us',
    type: 'website',
    images: ['/redesign/MY_AIRCRAFT_LOGO.svg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free Hangar Scanning · myaircraft.us',
    description: 'We come to your hangar and digitize your logbooks. Free for subscribers. Same-day access.',
    images: ['/redesign/MY_AIRCRAFT_LOGO.svg'],
  },
}

export default function Page() {
  return (
    <PublicLayout>
      <ScanningPage />
    </PublicLayout>
  )
}
