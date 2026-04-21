import type { Metadata } from 'next'
import { PublicLayout } from '@/components/marketing/vite/PublicLayout'
import { PricingPage } from '@/components/marketing/vite/PricingPage'

export const metadata: Metadata = {
  title: 'Pricing — Simple plans for owners, mechanics, and fleets',
  description:
    'Transparent pricing for aircraft owners, A&P mechanics, and fleet operators. Start free. Free scanning for subscribers.',
  alternates: { canonical: 'https://www.myaircraft.us/pricing' },
  openGraph: {
    title: 'Pricing · myaircraft.us',
    description: 'Plans for owners, mechanics, and fleet operators. Free scanning included with paid subscriptions.',
    url: 'https://www.myaircraft.us/pricing',
    siteName: 'myaircraft.us',
    type: 'website',
    images: ['/redesign/MY_AIRCRAFT_LOGO.svg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pricing · myaircraft.us',
    description: 'Plans for owners, mechanics, and fleet operators. Free scanning included with paid subscriptions.',
    images: ['/redesign/MY_AIRCRAFT_LOGO.svg'],
  },
}

// JSON-LD Product schema for pricing page — shown to search crawlers.
const pricingJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'myaircraft.us',
  description: 'Aviation-specific AI records intelligence platform for aircraft owners, mechanics, and fleet operators.',
  brand: { '@type': 'Brand', name: 'myaircraft.us' },
  offers: [
    {
      '@type': 'Offer',
      name: 'Owner',
      price: '29',
      priceCurrency: 'USD',
      category: 'subscription',
      availability: 'https://schema.org/InStock',
      url: 'https://www.myaircraft.us/pricing',
    },
    {
      '@type': 'Offer',
      name: 'Mechanic',
      price: '79',
      priceCurrency: 'USD',
      category: 'subscription',
      availability: 'https://schema.org/InStock',
      url: 'https://www.myaircraft.us/pricing',
    },
    {
      '@type': 'Offer',
      name: 'Fleet',
      priceCurrency: 'USD',
      category: 'subscription',
      availability: 'https://schema.org/InStock',
      url: 'https://www.myaircraft.us/pricing',
    },
  ],
}

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger -- trusted static JSON from this module
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />
      <PublicLayout>
        <PricingPage />
      </PublicLayout>
    </>
  )
}
