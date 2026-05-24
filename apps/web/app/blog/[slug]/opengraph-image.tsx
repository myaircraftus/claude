import { ImageResponse } from 'next/og'

export const alt = 'myaircraft.us blog post'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * Per-blog-post OG image generator. Renders the post title (derived from
 * the slug) + brand wordmark over the brand gradient. This replaces the
 * broken coverImage references in the blog frontmatter (the JPG files
 * were never committed to apps/web/public/blog/, so the previous OG
 * metadata was pointing at 404 URLs and social previews showed a broken
 * image).
 *
 * NOTE: We deliberately do NOT call getPostBySlug() here — that helper
 * reads MDX files from process.cwd() + content/blog/ via fs.readFileSync,
 * which fails at runtime inside the OG image serverless function because
 * the content directory isn't traced into the function bundle. Deriving
 * the title from the slug keeps the function self-contained.
 *
 * Next.js auto-discovers this file for /blog/[slug] URLs and writes the
 * resulting PNG into the page's <meta property="og:image" />.
 */

// Map known slugs to their human-readable titles (for the most-shared posts).
// Falls back to slug-to-title formatting for any unmapped slug.
const SLUG_TITLE: Record<string, { title: string; category: string }> = {
  'best-aircraft-maintenance-software-2026': {
    title: 'Best Aircraft Maintenance Software in 2026: Honest Comparison',
    category: 'Software',
  },
  'aircraft-annual-inspection-cost-2026': {
    title: 'How Much Does an Aircraft Annual Inspection Cost in 2026?',
    category: 'Maintenance',
  },
  'far-91-409-411-413-explained': {
    title: 'FAR 91.409, 91.411, 91.413 — Annual, Altimeter, Transponder Checks',
    category: 'Compliance',
  },
  'aircraft-ownership-true-cost-2026': {
    title: 'The True Cost of Aircraft Ownership in 2026',
    category: 'Ownership',
  },
  'aircraft-records-prebuy-inspection-checklist-2026': {
    title: 'Aircraft Records Pre-Buy Inspection Checklist (2026)',
    category: 'Pre-Buy',
  },
  'aircraft-logbook-lost-or-damaged-what-to-do': {
    title: "Lost or Damaged Aircraft Logbooks: The Owner's Recovery Playbook",
    category: 'Records',
  },
  'cessna-172-100-hour-inspection-cost-checklist': {
    title: 'Cessna 172 100-Hour Inspection: Cost Breakdown + Checklist (2026)',
    category: 'Cessna 172',
  },
  'ad-compliance-tracking-tools-comparison': {
    title: 'AD Compliance Tracking Tools — Honest Comparison',
    category: 'Software',
  },
  'understanding-ad-compliance-2025': {
    title: 'Understanding AD Compliance in 2025',
    category: 'Compliance',
  },
  'ai-aviation-records-how-it-works': {
    title: 'How AI Actually Reads Your Logbooks',
    category: 'AI',
  },
  'annual-inspection-checklist': {
    title: 'Annual Inspection Season: Pre-Annual Checklist',
    category: 'Maintenance',
  },
  'faa-registry-changes-2026': {
    title: 'FAA Aircraft Registry Updates in 2026',
    category: 'FAA',
  },
  'mechanic-portal-v2-launch': {
    title: 'Mechanic Portal 2.0: Work Orders, Revenue Analytics, Parts',
    category: 'Product',
  },
  'elt-battery-replacement-guide': {
    title: 'ELT Battery Replacement: The Compliance Item Most Owners Forget',
    category: 'Compliance',
  },
  'cessna-182-common-ads': {
    title: 'Cessna 182: The 12 ADs Every Owner Should Have Memorized',
    category: 'Cessna 182',
  },
  'document-scanning-best-practices': {
    title: 'Scanning Paper Logbooks: Best Practices for OCR Accuracy',
    category: 'Scanning',
  },
  'prepurchase-inspection-questions': {
    title: '27 Questions to Ask Before Buying a Used Aircraft',
    category: 'Pre-Buy',
  },
}

function titleizeSlug(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export default async function BlogPostOgImage({ params }: { params: { slug: string } }) {
  const known = SLUG_TITLE[params.slug]
  const title = known?.title ?? titleizeSlug(params.slug)
  const category = known?.category ?? 'Aviation Records'

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: 'linear-gradient(135deg, #0A1628 0%, #1E3A5F 50%, #2563EB 100%)',
          color: 'white',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Top — brand wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              background: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0A1628',
              fontSize: 30,
              fontWeight: 900,
            }}
          >
            m
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px' }}>
            myaircraft.us
          </div>
        </div>

        {/* Middle — category pill + title */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div
            style={{
              display: 'inline-flex',
              alignSelf: 'flex-start',
              padding: '8px 20px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.16)',
              border: '1px solid rgba(255,255,255,0.28)',
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
            }}
          >
            {category}
          </div>
          <div
            style={{
              fontSize: title.length > 70 ? 48 : title.length > 50 ? 56 : 64,
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: '-1px',
              maxWidth: 1040,
            }}
          >
            {title}
          </div>
        </div>

        {/* Bottom — domain */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 20, opacity: 0.7, fontWeight: 500 }}>
            Aircraft Records Intelligence · AI-powered
          </div>
          <div style={{ fontSize: 20, opacity: 0.7, fontWeight: 500 }}>
            myaircraft.us/blog
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
