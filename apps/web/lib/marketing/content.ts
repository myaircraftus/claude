import { createServerSupabase } from '@/lib/supabase/server'

// Re-export the pure type & constant definitions from content-types so
// existing server-side callers don't need to change their import paths.
// Client Components must import directly from './content-types' to
// avoid pulling the server-only createServerSupabase into the bundle.
export {
  MARKETING_PAGES,
  CONTENT_TYPES,
  type MarketingPage,
  type ContentType,
} from './content-types'

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

export { toEmbedUrl } from './embed'
