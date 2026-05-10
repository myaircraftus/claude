import type { Metadata } from 'next'
import { PublicLayout } from '@/components/marketing/vite/PublicLayout'
import { PricingPagePhase14 } from '@/components/marketing/PricingPagePhase14'
import { TIER_DEFINITIONS } from '@/lib/billing/pricing-config'

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

// JSON-LD Product schema for pricing page — derived from pricing-config
// so search crawlers always see the locked prices.
const pricingJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'aircraft.us',
  description:
    'Aviation maintenance AI: per-aircraft pricing, real-time or batch processing, no long contracts.',
  brand: { '@type': 'Brand', name: 'aircraft.us' },
  offers: [
    {
      '@type': 'Offer',
      name: 'Beta',
      price: '0',
      priceCurrency: 'USD',
      category: 'subscription',
      availability: 'https://schema.org/InStock',
      url: 'https://www.myaircraft.us/pricing',
    },
    ...((TIER_DEFINITIONS.standard.priceTiers ?? []).map((bracket, i) => ({
      '@type': 'Offer',
      name: `Standard (${bracket.minAircraft}-${bracket.maxAircraft ?? '∞'} aircraft)`,
      price: String(bracket.pricePerAircraft),
      priceCurrency: 'USD',
      category: 'subscription',
      availability: 'https://schema.org/InStock',
      url: 'https://www.myaircraft.us/pricing',
    }))),
    ...((TIER_DEFINITIONS.pro.priceTiers ?? []).map((bracket, i) => ({
      '@type': 'Offer',
      name: `Pro (${bracket.minAircraft}-${bracket.maxAircraft ?? '∞'} aircraft)`,
      price: String(bracket.pricePerAircraft),
      priceCurrency: 'USD',
      category: 'subscription',
      availability: 'https://schema.org/InStock',
      url: 'https://www.myaircraft.us/pricing',
    }))),
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
        <PricingPagePhase14 />
      </PublicLayout>
    </>
  )
}
