import type { Metadata } from 'next'
import { PublicLayout } from '@/components/marketing/vite/PublicLayout'
import { PricingPagePhase14 } from '@/components/marketing/PricingPagePhase14'
import { TIER_DEFINITIONS } from '@/lib/billing/pricing-config'

export const metadata: Metadata = {
  title: 'Pricing — Pay per aircraft, no long contracts',
  description:
    'Three tiers. Same features on every paid plan. The only difference is how fast your documents become searchable. Beta free during launch; Standard from $99/aircraft/mo; Pro from $149/aircraft/mo.',
  alternates: { canonical: 'https://www.myaircraft.us/pricing' },
  openGraph: {
    title: 'Pricing · myaircraft.us',
    description: 'Pay per aircraft. Beta free. Standard from $99/mo. Pro from $149/mo. No long contracts.',
    url: 'https://www.myaircraft.us/pricing',
    siteName: 'myaircraft.us',
    type: 'website',
    images: ['/redesign/MY_AIRCRAFT_LOGO.svg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pricing · myaircraft.us',
    description: 'Pay per aircraft. Beta free. Standard from $99/mo. Pro from $149/mo.',
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
