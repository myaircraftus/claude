import 'server-only'
import { cache } from 'react'
import { getContent } from './content'

/**
 * Cached fetch of the entire brand-kit slot map for the current request.
 * Components call this freely — only one DB round-trip per render.
 */
export const getBrandKit = cache(async (): Promise<Record<string, string>> => {
  const map = await getContent('brand', {})
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(map)) {
    if (typeof v === 'string' && v.trim()) out[k] = v
  }
  return out
})

export async function getBrandSlot(slot: string): Promise<string | null> {
  const kit = await getBrandKit()
  return kit[slot] ?? null
}
