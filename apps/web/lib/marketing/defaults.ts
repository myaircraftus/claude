/**
 * Default content for all marketing pages.
 * These values are used when no DB override exists AND are seeded
 * into `marketing_content` via the admin "Seed Defaults" action.
 *
 * Shape: { [page]: { [slot]: { content_type, value, metadata? } } }
 */

import type { ContentType } from './content'

export interface ContentDefault {
  content_type: ContentType
  value: string
  metadata?: Record<string, any>
  label?: string
  description?: string
}

export const MARKETING_DEFAULTS: Record<string, Record<string, ContentDefault>> = {
  home: {
    hero_title: {
      content_type: 'text',
      value: 'Your entire fleet. One intelligent hangar.',
      label: 'Hero title',
      description: 'Main headline on the homepage',
    },
    hero_subtitle: {
      content_type: 'rich_text',
      value:
        'Logbooks get lost. Maintenance history gets buried. ADs slip through. myaircraft.us brings your records, squawks, work orders, estimates, and AI search into one trusted platform — built for the people who actually deal with the paperwork.',
      label: 'Hero subtitle',
      description: 'Supporting text under the hero headline',
    },
    who_for_title: {
      content_type: 'text',
      value: 'Built for the people who actually deal with the records.',
      label: 'Who-it\u2019s-for section title',
    },
    who_for_subtitle: {
      content_type: 'rich_text',
      value:
        'Aircraft owners, A&P mechanics, MRO shops, fleet operators, flight schools \u2014 every workflow on the same trusted platform.',
      label: 'Who-it\u2019s-for section subtitle',
    },
    hero_cta_primary: {
      content_type: 'text',
      value: 'Start free trial',
      label: 'Hero primary CTA',
    },
    hero_cta_secondary: {
      content_type: 'text',
      value: 'See how it works',
      label: 'Hero secondary CTA',
    },
    hero_image: {
      content_type: 'image',
      value:
        'https://images.unsplash.com/photo-1767532704240-65f516e6d97d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
      label: 'Hero image',
      description: 'Main visual on the homepage',
    },
    mechanic_image: {
      content_type: 'image',
      value:
        'https://images.unsplash.com/photo-1742729251800-2f58d9c91553?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
      label: 'Mechanic image',
    },
    logbook_image: {
      content_type: 'image',
      value:
        'https://images.unsplash.com/photo-1547717015-67560f10d0a0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
      label: 'Logbook image',
    },
    owner_image: {
      content_type: 'image',
      value:
        'https://images.unsplash.com/photo-1686686489494-76caffffe5b5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
      label: 'Owner image',
    },
    hero_video: {
      content_type: 'video',
      value: '',
      label: 'Hero video (optional)',
      description: 'If set, replaces the hero image with a background video',
    },
  },

  about: {
    hero_title: {
      content_type: 'text',
      value: 'Built by aviators. Engineered for every hangar.',
      label: 'About hero title',
    },
    hero_subtitle: {
      content_type: 'rich_text',
      value:
        'myaircraft.us was founded to give general aviation the software it deserves — honest, mechanic-grade, and powered by modern AI.',
      label: 'About hero subtitle',
    },
    mission: {
      content_type: 'rich_text',
      value:
        'Our mission is to eliminate the paper-shuffle in aviation records so every hour flown is traceable, every AD is accounted for, and every mechanic finishes the day with cleaner books than they started with.',
      label: 'Mission statement',
    },
    team_image: {
      content_type: 'image',
      value: '',
      label: 'Team image',
    },
  },

  features: {
    hero_title: {
      content_type: 'text',
      value: 'Everything you need. Nothing you don\u2019t.',
      label: 'Features hero title',
    },
    hero_subtitle: {
      content_type: 'rich_text',
      value:
        'From logbook OCR to squawk tracking, work orders to invoicing — all the tools a modern maintenance operation needs, unified.',
      label: 'Features hero subtitle',
    },
  },

  pricing: {
    hero_title: {
      content_type: 'text',
      value: 'Simple pricing. No per-seat surprises.',
      label: 'Pricing hero title',
    },
    hero_subtitle: {
      content_type: 'rich_text',
      value:
        'Pay per aircraft or per mechanic \u2014 whichever is less. Cancel anytime.',
      label: 'Pricing hero subtitle',
    },
    tier_solo_price: {
      content_type: 'number',
      value: '49',
      label: 'Solo tier price (USD/mo)',
    },
    tier_shop_price: {
      content_type: 'number',
      value: '149',
      label: 'Shop tier price (USD/mo)',
    },
    tier_fleet_price: {
      content_type: 'number',
      value: '499',
      label: 'Fleet tier price (USD/mo)',
    },
  },

  scanning: {
    hero_title: {
      content_type: 'text',
      value: 'Scan once. Search forever.',
      label: 'Scanning hero title',
    },
    hero_subtitle: {
      content_type: 'rich_text',
      value:
        'Our AI pipeline turns decades of paper logbooks into a searchable, citable knowledge base — in minutes, not weeks.',
      label: 'Scanning hero subtitle',
    },
    demo_video: {
      content_type: 'video',
      value: '',
      label: 'Demo video URL',
    },
  },

  contact: {
    hero_title: {
      content_type: 'text',
      value: 'We\u2019d love to hear from you.',
      label: 'Contact hero title',
    },
    hero_subtitle: {
      content_type: 'rich_text',
      value: 'Questions, partnerships, or feedback \u2014 reach out anytime.',
      label: 'Contact hero subtitle',
    },
    support_email: {
      content_type: 'link',
      value: 'mailto:hello@myaircraft.us',
      label: 'Support email',
    },
    support_phone: {
      content_type: 'text',
      value: '',
      label: 'Support phone',
    },
  },

  privacy: {
    hero_title: {
      content_type: 'text',
      value: 'Privacy Policy',
      label: 'Privacy hero title',
    },
    last_updated: {
      content_type: 'text',
      value: '2026-04-20',
      label: 'Last updated date',
    },
    body: {
      content_type: 'rich_text',
      value:
        'Your data belongs to you. We process maintenance records to deliver the product, and we never sell your information.',
      label: 'Privacy policy body',
    },
  },

  terms: {
    hero_title: {
      content_type: 'text',
      value: 'Terms of Service',
      label: 'Terms hero title',
    },
    last_updated: {
      content_type: 'text',
      value: '2026-04-20',
      label: 'Last updated date',
    },
    body: {
      content_type: 'rich_text',
      value:
        'By using myaircraft.us you agree to our standard SaaS terms. Contact us for enterprise agreements.',
      label: 'Terms body',
    },
  },

  blog: {
    hero_title: {
      content_type: 'text',
      value: 'The Hangar',
      label: 'Blog hero title',
    },
    hero_subtitle: {
      content_type: 'rich_text',
      value: 'Notes on aviation maintenance, AI, and running a better shop.',
      label: 'Blog hero subtitle',
    },
  },

  /**
   * Brand kit — site-wide design assets uploaded by the platform admin.
   * Empty defaults intentionally; admin uploads via CMS to override.
   * Components fall back to bundled SVGs / lucide icons when slot is empty.
   */
  brand: {
    logo_primary: {
      content_type: 'image',
      value: '',
      label: 'Primary logo (full)',
      description: 'Used in nav and footer. SVG preferred.',
    },
    logo_mark: {
      content_type: 'image',
      value: '',
      label: 'Logomark (icon only)',
      description: 'Square icon variant — for favicons, social cards.',
    },
    logo_dark: {
      content_type: 'image',
      value: '',
      label: 'Dark-background logo',
      description: 'Variant for dark sections.',
    },
    loader_primary: {
      content_type: 'image',
      value: '',
      label: 'Loader animation',
      description: 'Animated SVG or GIF for loading states.',
    },

    // Tech partner logos — third-party trademarks, upload only assets you have rights to.
    partner_openai: { content_type: 'image', value: '', label: 'OpenAI logo' },
    partner_anthropic: { content_type: 'image', value: '', label: 'Anthropic logo' },
    partner_aws: { content_type: 'image', value: '', label: 'AWS logo' },
    partner_google: { content_type: 'image', value: '', label: 'Google Cloud logo' },
    partner_figma: { content_type: 'image', value: '', label: 'Figma logo' },

    // OEM aircraft brand logos.
    oem_cessna: { content_type: 'image', value: '', label: 'Cessna logo' },
    oem_piper: { content_type: 'image', value: '', label: 'Piper logo' },
    oem_beechcraft: { content_type: 'image', value: '', label: 'Beechcraft logo' },
    oem_cirrus: { content_type: 'image', value: '', label: 'Cirrus logo' },
    oem_diamond: { content_type: 'image', value: '', label: 'Diamond logo' },
    oem_mooney: { content_type: 'image', value: '', label: 'Mooney logo' },
    oem_gulfstream: { content_type: 'image', value: '', label: 'Gulfstream logo' },
    oem_embraer: { content_type: 'image', value: '', label: 'Embraer logo' },
    oem_pilatus: { content_type: 'image', value: '', label: 'Pilatus logo' },
    oem_daher: { content_type: 'image', value: '', label: 'Daher / TBM logo' },
    oem_textron: { content_type: 'image', value: '', label: 'Textron logo' },
    oem_socata: { content_type: 'image', value: '', label: 'Socata logo' },

    // Demo / interactive section media.
    demo_video: {
      content_type: 'embed',
      value: '',
      label: 'Mechanic UI demo video',
      description: 'YouTube / Vimeo URL. Replaces the static demo screenshot.',
    },
    demo_screenshot: {
      content_type: 'image',
      value: '',
      label: 'Mechanic UI demo screenshot',
      description: 'Fallback if no demo video is set.',
    },
  },
}

/**
 * Schema for an OEM logo slot.
 * Lookup name (e.g. "cessna") maps to brand.oem_<name> in the CMS.
 */
export const OEM_BRAND_SLOTS = [
  'cessna', 'piper', 'beechcraft', 'cirrus', 'diamond', 'mooney',
  'gulfstream', 'embraer', 'pilatus', 'daher', 'textron', 'socata',
] as const

export type OemBrandSlot = (typeof OEM_BRAND_SLOTS)[number]

export const PARTNER_BRAND_SLOTS = ['openai', 'anthropic', 'aws', 'google', 'figma'] as const
export type PartnerBrandSlot = (typeof PARTNER_BRAND_SLOTS)[number]
