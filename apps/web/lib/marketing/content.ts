import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Fetch CMS-managed content for a marketing page.
 * Falls back to the provided `defaults` record when a slot has no DB override
 * (or when the database / table is unavailable — so marketing pages never break).
 *
 * Usage:
 *   const content = await getContent('home', {
 *     hero_title: 'Default title',
 *     hero_subtitle: '...'
 *   })
 */
export async function getContent(
  page: string,
  defaults: Record<string, any> = {}
): Promise<Record<string, any>> {
  const result: Record<string, any> = { ...defaults }

  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('marketing_content')
      .select('slot, value, content_type, metadata')
      .eq('page', page)

    if (error || !data) return result

    for (const item of data as Array<{
      slot: string
      value: string | null
      content_type: string
      metadata: any
    }>) {
      if (item.value === null) continue
      if (item.content_type === 'json') {
        try {
          result[item.slot] = JSON.parse(item.value)
        } catch {
          // leave default in place on parse failure
        }
      } else if (item.content_type === 'number') {
        const n = Number(item.value)
        if (!Number.isNaN(n)) result[item.slot] = n
      } else {
        result[item.slot] = item.value
      }
    }
  } catch {
    // Silent fallback — marketing pages should render with defaults even if DB is unreachable
  }

  return result
}

/** All marketing pages managed by the CMS. Keep in sync with admin UI. */
export const MARKETING_PAGES = [
  'home',
  'about',
  'features',
  'pricing',
  'scanning',
  'contact',
  'privacy',
  'terms',
  'blog',
  'brand',
] as const

export type MarketingPage = (typeof MARKETING_PAGES)[number]

export const CONTENT_TYPES = [
  'text',
  'rich_text',
  'image',
  'video',
  'embed',
  'link',
  'number',
  'json',
] as const

export type ContentType = (typeof CONTENT_TYPES)[number]

/**
 * Detect a YouTube / Vimeo URL and return its canonical embed URL.
 * Returns null if the input isn't a recognized embeddable video URL.
 */
export function toEmbedUrl(input: string): string | null {
  if (!input) return null
  try {
    const url = new URL(input)
    const host = url.hostname.replace(/^www\./, '')

    if (host === 'youtu.be') {
      const id = url.pathname.slice(1)
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      if (url.pathname === '/watch') {
        const id = url.searchParams.get('v')
        return id ? `https://www.youtube.com/embed/${id}` : null
      }
      if (url.pathname.startsWith('/embed/')) return url.toString()
      if (url.pathname.startsWith('/shorts/')) {
        const id = url.pathname.split('/')[2]
        return id ? `https://www.youtube.com/embed/${id}` : null
      }
    }
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const id = url.pathname.split('/').filter(Boolean).pop()
      return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null
    }
  } catch {
    return null
  }
  return null
}
