import { ImageResponse } from 'next/og'
import { getPostBySlug } from '@/lib/blog'

export const alt = 'myaircraft.us blog post'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * Per-blog-post OG image generator. Renders the post title + category +
 * brand wordmark over the brand gradient. This replaces the broken
 * coverImage references in the blog frontmatter (the JPG files were never
 * committed to apps/web/public/blog/, so the previous OG metadata was
 * pointing at 404 URLs and social previews showed a broken image).
 *
 * Next.js auto-discovers this file for /blog/[slug] URLs and writes the
 * resulting PNG into the page's <meta property="og:image" />.
 */
export default async function BlogPostOgImage({ params }: { params: { slug: string } }) {
  const post = await getPostBySlug(params.slug)
  const title = post?.title ?? 'myaircraft.us'
  const category = post?.category ?? 'Aviation Records'

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
